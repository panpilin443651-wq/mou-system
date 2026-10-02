import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import { getQuarterStatuses, type WindowStatus } from "@/lib/submission-window";

// ============================================================================
// ล็อกผลการดำเนินงานหลังหัวหน้าส่วนงานกดส่งผล
// ============================================================================
// ส่งผลไตรมาสแล้ว หัวหน้าส่วนงานและผู้รายงานแก้อะไรในผลไม่ได้อีก
// (ผลรายเดือน สาเหตุ แนวทางแก้ไข หลักฐาน รายงานผลรายระดับ และผลรวมของไตรมาส)
// จนกว่าส่วนกลางจะตีกลับผล ซึ่งเปลี่ยนสถานะกลับเป็นร่าง - ส่วนกลางแก้ได้เสมอ
//
// ผลรายเดือนในตารางแผนไม่ได้แยกตามไตรมาส จึงดูจากไตรมาสที่ผู้ใช้ "เขียนได้อยู่ตอนนี้"
// (ช่วงเวลาเปิด) ถ้าไตรมาสนั้นส่งผลแล้ว = ล็อก ใช้ทั้งหน้าเว็บและ Server Action ให้ตรงกัน
// ============================================================================

/** ไตรมาสที่ส่งผลแล้วและทำให้ผู้ใช้คนนี้แก้ผลไม่ได้ - null = ไม่ล็อก */
export async function submittedResultsLock({
  indicatorId,
  statuses,
  isAdmin,
}: {
  indicatorId: string;
  /** สถานะช่วงเวลาของ 4 ไตรมาส (getQuarterStatuses) ช่องที่ i = ไตรมาส i+1 */
  statuses: WindowStatus[];
  isAdmin: boolean;
}): Promise<number | null> {
  if (isAdmin) return null;
  const writable = statuses.flatMap((s, i) => (s.canWrite ? [i + 1] : []));
  if (writable.length === 0) return null;
  const submitted = await db.quarterlyReport.findFirst({
    where: { indicatorId, quarter: { in: writable }, status: "SUBMITTED" },
    select: { quarter: true },
    orderBy: { quarter: "asc" },
  });
  return submitted?.quarter ?? null;
}

/** เหมือน submittedResultsLock แต่ดึงสถานะช่วงเวลาเอง - ใช้กับไฟล์หลักฐานที่ไม่มีสถานะในมือ */
export async function submittedResultsLockFor(
  indicator: { id: string; fiscalYearId: number; departmentId: string },
  actor: Actor,
): Promise<number | null> {
  if (actor.role === "ADMIN") return null;
  const statuses = await getQuarterStatuses({
    fiscalYearId: indicator.fiscalYearId,
    departmentId: indicator.departmentId,
    actor,
  });
  return submittedResultsLock({ indicatorId: indicator.id, statuses, isAdmin: false });
}

export function submittedLockMessage(quarter: number): string {
  return `ส่งผลไตรมาส ${quarter} แล้ว แก้ไขไม่ได้ · ถ้าต้องแก้ติดต่อส่วนกลางให้ตีกลับผล`;
}
