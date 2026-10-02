import { bangkokDateTimeToUtc, formatThaiDateTime, utcToBangkokDateInput } from "@/lib/datetime";

// ============================================================================
// วันและเวลาที่ต้องแก้ไขให้เสร็จ ตอนส่วนกลางตีกลับแผน/ผล
// ============================================================================
// ส่วนกลางเลือกวันที่ (บังคับ) และเวลา (ค่าตั้งต้น 16:30 = เลิกงาน) ข้างปุ่มตีกลับ
// ถือเป็นเวลาไทยเสมอ แสดงในแจ้งเตือน แถบแดงหน้าแผน/รายงานผล และหน้ารายการ
// ไฟล์นี้ไม่แตะฐานข้อมูล ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าเว็บ
// ============================================================================

/** ชื่อช่องในฟอร์มตีกลับ */
export const RETURN_DUE_FIELD = "returnDueDate";
export const RETURN_DUE_TIME_FIELD = "returnDueTime";

/** เวลาตั้งต้นของช่องเวลา - เวลาเลิกงานราชการ */
export const DEFAULT_RETURN_DUE_TIME = "16:30";

/** วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD ใช้เป็นค่าต่ำสุดของช่องวันที่ */
export function todayBangkokInput(now = new Date()): string {
  return utcToBangkokDateInput(now);
}

/** อ่านวันและเวลาจากฟอร์มตีกลับ - ต้องเลือกวันที่ และต้องเป็นเวลาหลังจากตอนนี้ */
export function readReturnDueDate(
  formData: FormData,
  now = new Date(),
): { dueAt: Date; error?: undefined } | { dueAt?: undefined; error: string } {
  const date = String(formData.get(RETURN_DUE_FIELD) ?? "").trim();
  const time = String(formData.get(RETURN_DUE_TIME_FIELD) ?? "").trim() || DEFAULT_RETURN_DUE_TIME;
  if (!date) return { error: "กรุณาเลือกวันที่ที่ต้องแก้ไขให้เสร็จก่อนตีกลับ" };
  // bangkokDateTimeToUtc ไม่ตรวจช่วงตัวเลข "25:99" จะถูกปัดไปวันถัดไปเงียบๆ
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { error: "เวลาที่ต้องแก้ไขให้เสร็จไม่ถูกต้อง" };
  }
  const dueAt = bangkokDateTimeToUtc(`${date}T${time}`);
  if (!dueAt || Number.isNaN(dueAt.getTime())) {
    return { error: "วันหรือเวลาที่ต้องแก้ไขให้เสร็จไม่ถูกต้อง" };
  }
  if (dueAt <= now) return { error: "วันและเวลาที่ต้องแก้ไขให้เสร็จต้องเป็นเวลาหลังจากตอนนี้" };
  return { dueAt };
}

/** ข้อความกำหนดส่ง เช่น "ต้องแก้ไขให้เสร็จภายในวันที่ 15 ต.ค. 2569 16:30 น." */
export function returnDueText(dueAt: Date): string {
  return `ต้องแก้ไขให้เสร็จภายในวันที่ ${formatThaiDateTime(dueAt)}`;
}
