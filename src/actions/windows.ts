"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageSystem } from "@/lib/permissions";
import {
  bangkokDateTimeToUtc,
  fiscalQuarterRange,
  formatThaiDateTime,
} from "@/lib/datetime";
import { writeAudit, diffFields } from "@/lib/audit";
import { windowRange } from "@/lib/submission-window";

// ============================================================================
// Server Action สำหรับช่วงเวลาเปิด-ปิดรับรายงาน (ข้อ 9) - เฉพาะ ADMIN
// ============================================================================
// เวลาที่กรอกในฟอร์มถือเป็น "เวลาไทย" เสมอ แล้วแปลงเป็น UTC ก่อนเก็บ
// ถ้าเก็บตรงๆ ตามโซนเวลาของเครื่องผู้กรอก เวลาปิดจะเพี้ยนไปทั้งองค์กร
// ============================================================================

export type FormState = { error: string | null; message?: string | null };

export async function updateWindowAction(
  windowId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) {
    return { error: "คุณไม่มีสิทธิ์ตั้งช่วงเวลาเปิด-ปิดระบบ" };
  }

  const existing = await db.submissionWindow.findUnique({
    where: { id: windowId },
    include: { fiscalYear: { select: { year: true } } },
  });
  if (!existing) return { error: "ไม่พบช่วงเวลาที่จะแก้ไข" };

  // ช่วงเปิด-ปิด: ตามไตรมาส (ค่าเริ่มต้น) หรือส่วนกลางกำหนดวันเวลาเอง
  // เวลาที่กรอกถือเป็นเวลาไทยเสมอ แล้วแปลงเป็น UTC ก่อนเก็บ
  const isCustom = formData.get("rangeMode") === "custom";
  let openAt: Date;
  let closeAt: Date;
  if (isCustom) {
    const open = bangkokDateTimeToUtc(String(formData.get("openAt") ?? ""));
    const close = bangkokDateTimeToUtc(String(formData.get("closeAt") ?? ""));
    if (!open) return { error: "กรุณากรอกวันและเวลาเปิดระบบ" };
    if (!close) return { error: "กรุณากรอกวันและเวลาปิดระบบ" };
    if (close <= open) return { error: "เวลาปิดระบบต้องช้ากว่าเวลาเปิดระบบ" };
    openAt = open;
    closeAt = close;
  } else {
    ({ start: openAt, end: closeAt } = fiscalQuarterRange(
      existing.fiscalYear.year,
      existing.quarter,
    ));
  }

  const isForceClosed = formData.get("isForceClosed") === "true";

  await db.submissionWindow.update({
    where: { id: windowId },
    data: { openAt, closeAt, isForceClosed, isCustom },
  });

  await writeAudit({
    userId: actor.id,
    action: "WINDOW_UPDATE",
    entity: "SubmissionWindow",
    entityId: windowId,
    detail: {
      year: existing.fiscalYear.year,
      quarter: existing.quarter,
      ...diffFields(
        {
          openAt: existing.openAt.toISOString(),
          closeAt: existing.closeAt.toISOString(),
          isForceClosed: existing.isForceClosed,
          isCustom: existing.isCustom,
        },
        {
          openAt: openAt.toISOString(),
          closeAt: closeAt.toISOString(),
          isForceClosed,
          isCustom,
        }
      ),
    },
  });

  revalidatePath("/admin/windows");
  revalidatePath("/reports");
  return {
    error: null,
    message: isForceClosed
      ? `ปิดฉุกเฉินไตรมาส ${existing.quarter} แล้ว`
      : `ไตรมาส ${existing.quarter} เปิดรายงาน${isCustom ? "ตามวันเวลาที่กำหนด" : "ตามช่วงของไตรมาส"} ${formatThaiDateTime(openAt)} ถึง ${formatThaiDateTime(closeAt)}`,
  };
}

/**
 * ขยายเวลาให้ส่วนงานใดส่วนงานหนึ่งเป็นกรณีพิเศษ
 *
 * ใช้เมื่อส่วนงานขอผ่อนผัน โดยไม่ต้องเปิดระบบให้ทั้ง 30 หน่วยพร้อมกัน
 * ขยายได้อย่างเดียว ย่นเวลาให้ปิดเร็วขึ้นไม่ได้ เพราะจะกลายเป็นการลงโทษเฉพาะหน่วย
 */
export async function addExceptionAction(
  windowId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) {
    return { error: "คุณไม่มีสิทธิ์ขยายเวลาให้ส่วนงาน" };
  }

  const window = await db.submissionWindow.findUnique({
    where: { id: windowId },
    include: { fiscalYear: { select: { year: true } } },
  });
  if (!window) return { error: "ไม่พบช่วงเวลาที่จะขยาย" };
  // เทียบกับเวลาปิดที่ใช้จริง (ตามไตรมาส หรือที่ส่วนกลางกำหนดเอง)
  const quarterEnd = windowRange(window.fiscalYear.year, window.quarter, window).end;

  const departmentId = String(formData.get("departmentId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const closeAt = bangkokDateTimeToUtc(String(formData.get("closeAt") ?? ""));

  if (!departmentId) return { error: "กรุณาเลือกส่วนงาน" };
  if (!closeAt) return { error: "กรุณากรอกวันเวลาปิดใหม่" };
  if (reason.length < 4) return { error: "กรุณาระบุเหตุผลที่ขยายเวลา" };
  if (closeAt <= quarterEnd) {
    return {
      error: `เวลาปิดใหม่ต้องช้ากว่าเวลาปิดระบบของไตรมาสนี้ (${formatThaiDateTime(quarterEnd)})`,
    };
  }

  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { code: true },
  });
  if (!department) return { error: "ไม่พบส่วนงานที่เลือก" };

  try {
    await db.windowException.upsert({
      where: { windowId_departmentId: { windowId, departmentId } },
      update: { closeAt, reason },
      create: { windowId, departmentId, closeAt, reason },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return { error: "บันทึกการขยายเวลาไม่สำเร็จ" };
    }
    throw error;
  }

  await writeAudit({
    userId: actor.id,
    action: "WINDOW_EXCEPTION_SET",
    entity: "SubmissionWindow",
    entityId: windowId,
    detail: {
      quarter: window.quarter,
      department: department.code,
      closeAt: closeAt.toISOString(),
      reason,
    },
  });

  revalidatePath("/admin/windows");
  revalidatePath("/reports");
  return {
    error: null,
    message: `ขยายเวลาให้ ${department.code} ถึง ${formatThaiDateTime(closeAt)} แล้ว`,
  };
}

export async function removeExceptionAction(
  exceptionId: string,
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) {
    return { error: "คุณไม่มีสิทธิ์ยกเลิกการขยายเวลา" };
  }

  const existing = await db.windowException.findUnique({
    where: { id: exceptionId },
    include: {
      department: { select: { code: true } },
      window: { select: { quarter: true } },
    },
  });
  if (!existing) return { error: "ไม่พบรายการขยายเวลานี้" };

  await db.windowException.delete({ where: { id: exceptionId } });

  await writeAudit({
    userId: actor.id,
    action: "WINDOW_EXCEPTION_REMOVE",
    entity: "SubmissionWindow",
    entityId: existing.windowId,
    detail: { quarter: existing.window.quarter, department: existing.department.code },
  });

  revalidatePath("/admin/windows");
  revalidatePath("/reports");
  return { error: null, message: `ยกเลิกการขยายเวลาของ ${existing.department.code} แล้ว` };
}
