// ============================================================================
// การจัดการวันเวลา - จุดที่พลาดง่ายที่สุดของทั้งระบบ
// ============================================================================
// เซิร์ฟเวอร์ (โดยเฉพาะบน Vercel) ทำงานด้วยเวลา UTC เสมอ
// แต่ผู้ใช้ทุกคนคิดเป็นเวลาไทย (UTC+7)
//
// กฎของโครงการนี้:
//   1. ฐานข้อมูลเก็บเป็น UTC เท่านั้น
//   2. แปลงเป็นเวลาไทยเฉพาะตอนแสดงผลบนหน้าจอ
//   3. รับค่าจากฟอร์มเป็นเวลาไทย แล้วแปลงเป็น UTC ก่อนบันทึก
//
// ถ้าไม่ทำตามนี้ ระบบจะเปิด-ปิดคลาดเคลื่อนไป 7 ชั่วโมง
// ============================================================================

const BANGKOK_OFFSET_HOURS = 7;
export const BANGKOK_TIMEZONE = "Asia/Bangkok";

/**
 * แปลงวันที่จากช่อง input type="date" (ได้มาเป็น "2568-10-01" ตามปฏิทินไทย
 * ที่ผู้ใช้เห็น แต่ค่าจริงเป็น ค.ศ.) ให้เป็นเวลา UTC สำหรับเก็บลงฐานข้อมูล
 *
 * @param dateString รูปแบบ YYYY-MM-DD (ค.ศ.)
 * @param endOfDay   true = สิ้นสุดวัน 23:59:59 ตามเวลาไทย
 */
export function bangkokDateToUtc(dateString: string, endOfDay = false): Date | null {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, y, m, d] = match;
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;

  return new Date(
    Date.UTC(Number(y), Number(m) - 1, Number(d), hour - BANGKOK_OFFSET_HOURS, minute, second)
  );
}

/**
 * แปลงค่าจากช่อง input type="datetime-local" (รูปแบบ "2026-01-31T23:59")
 * ให้เป็นเวลา UTC สำหรับเก็บลงฐานข้อมูล
 *
 * ถือว่าเวลาที่กรอกเป็น "เวลาไทย" เสมอ ไม่ใช่เวลาของเครื่องผู้ใช้
 * เพราะถ้าผู้ดูแลระบบเปิดหน้านี้จากเครื่องที่ตั้งโซนเวลาอื่น
 * เวลาปิดระบบจะเพี้ยนไปทั้งองค์กร
 */
export function bangkokDateTimeToUtc(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const [, y, m, d, hh, mm, ss] = match;
  return new Date(
    Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh) - BANGKOK_OFFSET_HOURS,
      Number(mm),
      ss ? Number(ss) : 0
    )
  );
}

/** แปลงเวลาจากฐานข้อมูล (UTC) กลับเป็นรูปแบบของช่อง datetime-local ตามเวลาไทย */
export function utcToBangkokDateTimeInput(date: Date): string {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_HOURS * 3600 * 1000);
  return shifted.toISOString().slice(0, 16);
}

/** แปลงวันที่จากฐานข้อมูล (UTC) กลับเป็น YYYY-MM-DD ตามเวลาไทย สำหรับเติมในฟอร์ม */
export function utcToBangkokDateInput(date: Date): string {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_HOURS * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** แสดงวันที่แบบไทย เช่น "1 ต.ค. 2568" (พ.ศ.) */
export function formatThaiDate(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** แสดงวันที่พร้อมเวลาแบบไทย เช่น "1 ต.ค. 2568 08:30 น." */
export function formatThaiDateTime(date: Date): string {
  const formatted = new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatted} น.`;
}

/**
 * ปีบัญชีของ กยท. เริ่ม 1 ต.ค. ของปีก่อนหน้า และจบ 30 ก.ย. ของปีนั้น
 * เช่น ปีบัญชี 2569 = 1 ต.ค. 2568 ถึง 30 ก.ย. 2569
 *
 * @param buddhistYear ปี พ.ศ. เช่น 2570
 */
export function defaultFiscalYearRange(buddhistYear: number) {
  const gregorianEnd = buddhistYear - 543;
  return {
    startDate: new Date(Date.UTC(gregorianEnd - 1, 9, 1, -BANGKOK_OFFSET_HOURS)),
    endDate: new Date(Date.UTC(gregorianEnd, 8, 30, 23 - BANGKOK_OFFSET_HOURS, 59, 59)),
  };
}

/**
 * ช่วง 3 เดือนของไตรมาสในปีบัญชี ตามเวลาไทย
 * เช่น ปีบัญชี 2569 ไตรมาส 1 = 1 ต.ค. 2568 00:00 ถึง 31 ธ.ค. 2568 23:59:59
 *
 * ผู้รับผิดชอบส่วนงานรายงานผลของไตรมาสได้เฉพาะช่วงนี้เท่านั้น
 * (ดู lib/submission-window.ts)
 *
 * @param buddhistYear ปี พ.ศ. ของปีบัญชี
 * @param quarter      1-4
 */
export function fiscalQuarterRange(buddhistYear: number, quarter: number) {
  const g = buddhistYear - 543 - 1; // ปี ค.ศ. ที่ปีบัญชีเริ่ม (เดือน ต.ค.)
  // Date.UTC ทดเดือนที่เกิน 11 ขึ้นปีถัดไปให้เอง (เดือน 12 = ม.ค. ปีหน้า)
  const monthStart = (offset: number) =>
    new Date(Date.UTC(g, 9 + offset, 1, -BANGKOK_OFFSET_HOURS));

  const start = monthStart((quarter - 1) * 3);
  const nextStart = monthStart(quarter * 3);
  return {
    start,
    /** วินาทีสุดท้ายของไตรมาส (23:59:59 ของวันสุดท้าย) */
    end: new Date(nextStart.getTime() - 1000),
  };
}

/**
 * ตอนนี้อยู่ไตรมาสไหนของปีบัญชี `buddhistYear`
 * คืน 0 ถ้าปีบัญชียังไม่เริ่ม และ 5 ถ้าปีบัญชีจบไปแล้ว
 */
export function currentFiscalQuarter(buddhistYear: number, now = new Date()): number {
  if (now < fiscalQuarterRange(buddhistYear, 1).start) return 0;
  for (const q of [1, 2, 3, 4]) {
    if (now <= fiscalQuarterRange(buddhistYear, q).end) return q;
  }
  return 5;
}

/**
 * ช่วงเวลาที่เก็บในตาราง SubmissionWindow ตอนสร้างปีบัญชีใหม่
 * ตรงกับ 3 เดือนของแต่ละไตรมาส (ระบบใช้ช่วงจาก fiscalQuarterRange เป็นหลักอยู่แล้ว
 * ค่าในตารางเก็บไว้ให้ข้อมูลตรงกันเท่านั้น)
 */
export function defaultSubmissionWindows(buddhistYear: number) {
  return [1, 2, 3, 4].map((quarter) => {
    const { start, end } = fiscalQuarterRange(buddhistYear, quarter);
    return { quarter, openAt: start, closeAt: end };
  });
}
