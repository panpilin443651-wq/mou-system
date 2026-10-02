import { bangkokDateToUtc, formatThaiDate, utcToBangkokDateInput } from "@/lib/datetime";

// ============================================================================
// วันที่ต้องแก้ไขให้เสร็จ ตอนส่วนกลางตีกลับแผน/ผล
// ============================================================================
// ส่วนกลางเลือกวันที่ในช่อง input type="date" ข้างปุ่มตีกลับ (บังคับกรอก)
// เก็บเป็นสิ้นวันตามเวลาไทย (23:59:59) แสดงในแจ้งเตือนและแถบแดงบนหน้าแผน/รายงานผล
// ไฟล์นี้ไม่แตะฐานข้อมูล ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าเว็บ
// ============================================================================

/** ชื่อช่องในฟอร์มตีกลับ */
export const RETURN_DUE_FIELD = "returnDueDate";

/** วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD ใช้เป็นค่าต่ำสุดของช่องวันที่ */
export function todayBangkokInput(now = new Date()): string {
  return utcToBangkokDateInput(now);
}

/** อ่านวันที่จากฟอร์มตีกลับ - ต้องกรอกและต้องไม่ใช่วันที่ผ่านมาแล้ว */
export function readReturnDueDate(
  formData: FormData,
): { dueAt: Date; error?: undefined } | { dueAt?: undefined; error: string } {
  const raw = String(formData.get(RETURN_DUE_FIELD) ?? "").trim();
  if (!raw) return { error: "กรุณาเลือกวันที่ที่ต้องแก้ไขให้เสร็จก่อนตีกลับ" };
  const dueAt = bangkokDateToUtc(raw, true);
  if (!dueAt || Number.isNaN(dueAt.getTime())) return { error: "วันที่ที่ต้องแก้ไขให้เสร็จไม่ถูกต้อง" };
  if (raw < todayBangkokInput()) return { error: "วันที่ที่ต้องแก้ไขให้เสร็จต้องไม่ใช่วันที่ผ่านมาแล้ว" };
  return { dueAt };
}

/** ข้อความกำหนดส่ง เช่น "ต้องแก้ไขให้เสร็จภายในวันที่ 15 ต.ค. 2569" */
export function returnDueText(dueAt: Date): string {
  return `ต้องแก้ไขให้เสร็จภายในวันที่ ${formatThaiDate(dueAt)}`;
}
