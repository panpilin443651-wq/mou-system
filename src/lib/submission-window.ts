import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import {
  currentFiscalQuarter,
  fiscalQuarterRange,
  formatThaiDateTime,
} from "@/lib/datetime";
import { MONTH_COUNT, monthQuarter } from "@/lib/plan";

// ============================================================================
// การตรวจช่วงเวลารับรายงาน (ข้อ 9)
// ============================================================================
// รวมไว้ที่เดียว เพราะต้องถูกเรียกจากทุกจุดที่เขียนข้อมูลของไตรมาสนั้น
//   - บันทึกร่าง / ส่งผล / ดึงกลับมาแก้
//   - ตอนออกบัตรผ่านอัปโหลดไฟล์ และตอนบันทึกข้อมูลไฟล์ / ลบไฟล์
//   - ช่องแผน/ผลรายเดือนในตารางแผนดำเนินงาน (monthLocks)
//
// ถ้าเขียนเงื่อนไขซ้ำกระจายไปแต่ละที่ จะมีสักที่ที่ลืมตรวจ แล้วกลายเป็นช่องโหว่
//
// กฎที่ใช้:
//   - ผู้รับผิดชอบส่วนงานรายงานผลได้เฉพาะในช่วงเปิด-ปิดของไตรมาส
//     ค่าเริ่มต้นคือ 3 เดือนของไตรมาส (ไตรมาส 1 = ต.ค.-ธ.ค. ...) ตามเวลาไทย
//     ส่วนกลางกำหนดวันเวลาเปิด-ปิดเองได้ที่ ตั้งค่าระบบ > ช่วงเวลาเปิด-ปิด
//     ไตรมาสที่ผ่านไปแล้วแก้ย้อนหลังไม่ได้ ไตรมาสที่ยังมาไม่ถึงก็รายงานล่วงหน้าไม่ได้
//   - ส่วนกลางสั่ง "ปิดฉุกเฉิน" ไตรมาสได้ (SubmissionWindow.isForceClosed)
//   - ส่วนกลางขยายเวลาให้เฉพาะส่วนงานได้ (WindowException) ขยายได้อย่างเดียว
//   - ส่วนกลาง (ADMIN) ทำได้เสมอ เพราะต้องแก้ข้อมูลให้ส่วนงานได้แม้เลยกำหนดแล้ว
//   - ผู้บริหารแก้ไขอะไรไม่ได้อยู่แล้วตั้งแต่ชั้นสิทธิ์
//
// ช่วงเวลาเปิด-ปิด (windowRange):
//   ปกติใช้ 3 เดือนของไตรมาส (fiscalQuarterRange)
//   ถ้าส่วนกลางกำหนดวันเวลาเองที่หน้าตั้งค่า (SubmissionWindow.isCustom) ใช้ openAt / closeAt ที่ตั้งไว้
//   แถวที่ไม่ได้กำหนดเอง ไม่อ่าน openAt / closeAt เพราะปีเก่าบางปียังเก็บค่าแบบเดิมค้างไว้
// ============================================================================

export type WindowState =
  | "OPEN" // อยู่ในไตรมาสนี้ (หรืออยู่ในช่วงที่ขยายเวลาให้)
  | "BEFORE_OPEN" // ไตรมาสนี้ยังมาไม่ถึง
  | "AFTER_CLOSE" // ไตรมาสนี้ผ่านไปแล้ว
  | "FORCE_CLOSED"; // ส่วนกลางสั่งปิดฉุกเฉิน

export type WindowStatus = {
  state: WindowState;
  openAt: Date;
  /** เวลาปิดที่ใช้จริง (รวมการขยายเวลาเฉพาะส่วนงานแล้ว) */
  closeAt: Date;
  /** เวลาปิดเดิมก่อนขยาย - null ถ้าไม่มีการขยาย */
  originalCloseAt: Date | null;
  extensionReason: string | null;
  /** ผู้ใช้คนนี้บันทึกข้อมูลของไตรมาสนี้ได้หรือไม่ */
  canWrite: boolean;
  /** true เมื่อทำได้เพราะเป็นส่วนกลาง ทั้งที่ช่วงเวลาปิดอยู่ */
  isAdminOverride: boolean;
  /** ข้อความอธิบายสำหรับแสดงบนหน้าจอ */
  message: string;
};

function describe(state: WindowState, quarter: number, openAt: Date, closeAt: Date): string {
  switch (state) {
    case "OPEN":
      return `รายงานผลไตรมาส ${quarter} ได้ถึง ${formatThaiDateTime(closeAt)}`;
    case "BEFORE_OPEN":
      return `ยังไม่ถึงไตรมาส ${quarter} จะรายงานได้ตั้งแต่ ${formatThaiDateTime(openAt)}`;
    case "AFTER_CLOSE":
      return `ไตรมาส ${quarter} สิ้นสุดแล้วเมื่อ ${formatThaiDateTime(closeAt)} แก้ไขย้อนหลังไม่ได้`;
    case "FORCE_CLOSED":
      return `ส่วนกลางปิดรับข้อมูลของไตรมาส ${quarter} ไว้`;
  }
}

type WindowRow = {
  isForceClosed: boolean;
  isCustom: boolean;
  openAt: Date;
  closeAt: Date;
  exceptions: { closeAt: Date; reason: string }[];
} | null;

/**
 * ช่วงเปิด-ปิดที่ใช้จริงของไตรมาสหนึ่ง (ยังไม่รวมการขยายเวลาเฉพาะส่วนงาน)
 * ส่วนกลางกำหนดเอง = openAt/closeAt ของแถว · ไม่ได้กำหนด = 3 เดือนของไตรมาส
 */
export function windowRange(
  year: number,
  quarter: number,
  window: { isCustom: boolean; openAt: Date; closeAt: Date } | null,
): { start: Date; end: Date } {
  if (window?.isCustom) return { start: window.openAt, end: window.closeAt };
  return fiscalQuarterRange(year, quarter);
}

/** ตัดสินสถานะของไตรมาสหนึ่ง จากปีบัญชี + แถว SubmissionWindow (ถ้ามี) */
function computeStatus({
  year,
  quarter,
  window,
  actor,
  now,
}: {
  year: number;
  quarter: number;
  window: WindowRow;
  actor: Actor;
  now: Date;
}): WindowStatus {
  const { start, end } = windowRange(year, quarter, window);
  const isAdmin = actor.role === "ADMIN";

  // การขยายเวลาเฉพาะส่วนงาน ใช้ได้เฉพาะเมื่อทำให้ปิดช้าลงเท่านั้น
  // ไม่ให้ใช้ย่นเวลาปิดให้เร็วขึ้น เพราะจะกลายเป็นการลงโทษเฉพาะหน่วย
  const exception = window?.exceptions[0] ?? null;
  const extended = exception && exception.closeAt > end ? exception.closeAt : null;
  const effectiveClose = extended ?? end;

  let state: WindowState;
  if (window?.isForceClosed) state = "FORCE_CLOSED";
  else if (now < start) state = "BEFORE_OPEN";
  else if (now > effectiveClose) state = "AFTER_CLOSE";
  else state = "OPEN";

  const open = state === "OPEN";

  return {
    state,
    openAt: start,
    closeAt: effectiveClose,
    originalCloseAt: extended ? end : null,
    extensionReason: extended ? exception!.reason : null,
    canWrite: open || isAdmin,
    isAdminOverride: !open && isAdmin,
    message: describe(state, quarter, start, effectiveClose),
  };
}

/**
 * ตรวจว่าตอนนี้ส่วนงานนี้บันทึกข้อมูลของไตรมาสนี้ได้หรือไม่
 *
 * เรียกที่ฝั่งเซิร์ฟเวอร์เท่านั้น และต้องเรียก **ก่อนบันทึกทุกครั้ง**
 * การซ่อนปุ่มบนหน้าจอเป็นแค่ความสวยงาม กันคนที่ยิงข้อมูลตรงไม่ได้
 */
export async function getWindowStatus({
  fiscalYearId,
  quarter,
  departmentId,
  actor,
  now = new Date(),
}: {
  fiscalYearId: number;
  quarter: number;
  departmentId: string;
  actor: Actor;
  now?: Date;
}): Promise<WindowStatus> {
  const statuses = await getQuarterStatuses({ fiscalYearId, departmentId, actor, now });
  return statuses[quarter - 1];
}

/** สถานะของทั้ง 4 ไตรมาสในคำถามเดียว (ช่อง 0 = ไตรมาส 1) */
export async function getQuarterStatuses({
  fiscalYearId,
  departmentId,
  actor,
  now = new Date(),
}: {
  fiscalYearId: number;
  departmentId: string;
  actor: Actor;
  now?: Date;
}): Promise<WindowStatus[]> {
  const fiscalYear = await db.fiscalYear.findUniqueOrThrow({
    where: { id: fiscalYearId },
    select: {
      year: true,
      windows: {
        select: {
          quarter: true,
          isForceClosed: true,
          isCustom: true,
          openAt: true,
          closeAt: true,
          exceptions: {
            where: { departmentId },
            select: { closeAt: true, reason: true },
          },
        },
      },
    },
  });

  return [1, 2, 3, 4].map((quarter) =>
    computeStatus({
      year: fiscalYear.year,
      quarter,
      window: fiscalYear.windows.find((w) => w.quarter === quarter) ?? null,
      actor,
      now,
    }),
  );
}

/**
 * ตรวจจาก indicatorId โดยตรง - ใช้ใน Server Action ที่มีแค่ id ของตัวชี้วัด
 * คืน null ถ้าไม่พบตัวชี้วัด
 */
export async function getWindowStatusForIndicator({
  indicatorId,
  quarter,
  actor,
  now,
}: {
  indicatorId: string;
  quarter: number;
  actor: Actor;
  now?: Date;
}): Promise<WindowStatus | null> {
  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    select: { fiscalYearId: true, departmentId: true },
  });
  if (!indicator) return null;

  return getWindowStatus({
    fiscalYearId: indicator.fiscalYearId,
    quarter,
    departmentId: indicator.departmentId,
    actor,
    now,
  });
}

/** ไตรมาสปัจจุบันของปีบัญชี บีบให้อยู่ในช่วง 1-4 ใช้เป็นไตรมาสที่เปิดให้ดูเป็นค่าเริ่มต้น */
export function defaultQuarter(year: number, now = new Date()): number {
  return Math.min(4, Math.max(1, currentFiscalQuarter(year, now)));
}

// ----------------------------------------------------------------------------
// ช่องรายเดือนในตารางแผนดำเนินงาน
// ----------------------------------------------------------------------------

export type MonthLocks = {
  /** ช่อง "แผน" ของเดือนนี้แก้ไม่ได้ (ช่อง 0 = ต.ค.) */
  plan: boolean[];
  /** ช่อง "ผล" ของเดือนนี้แก้ไม่ได้ */
  actual: boolean[];
};

/**
 * เดือนไหนในตารางแผนที่แก้ได้ ตามสถานะของไตรมาสที่เดือนนั้นอยู่
 *
 * - ช่อง "ผล" แก้ได้เฉพาะเดือนในไตรมาสที่รายงานได้อยู่ตอนนี้
 *   (ไตรมาสที่ผ่านไปแล้วแก้ย้อนหลังไม่ได้ ไตรมาสข้างหน้ายังไม่มีผลให้รายงาน)
 * - ช่อง "แผน" แก้ได้ทั้งไตรมาสที่รายงานได้อยู่และไตรมาสข้างหน้า
 *   แต่ไตรมาสที่ผ่านไปแล้วล็อก เพราะเปลี่ยนแผนย้อนหลังจะทำให้ % ผลเทียบแผนเปลี่ยนไปด้วย
 *
 * ส่วนกลางแก้ได้ทุกเดือน (canWrite เป็น true ทุกไตรมาสอยู่แล้ว)
 */
export function monthLocks(statuses: WindowStatus[]): MonthLocks {
  const plan: boolean[] = [];
  const actual: boolean[] = [];
  for (let i = 0; i < MONTH_COUNT; i++) {
    const s = statuses[monthQuarter(i) - 1];
    actual.push(!s.canWrite);
    plan.push(!s.canWrite && s.state !== "BEFORE_OPEN");
  }
  return { plan, actual };
}
