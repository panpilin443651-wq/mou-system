import type { ScoreDirection } from "@prisma/client";

// ============================================================================
// การคิด % ความก้าวหน้า (ข้อ 4) และคะแนน 1-5 (ข้อ 5)
// ============================================================================
// รวมไว้ที่ไฟล์เดียว เพราะถูกเรียกจากทั้งตอนบันทึกผล ตอนแสดงผล และ Dashboard
// ถ้าเขียนซ้ำหลายที่แล้วแก้สูตรทีหลัง จะได้ตัวเลขไม่ตรงกันระหว่างหน้า
//
// เรื่องที่ต้องระวังที่สุดคือ "ทิศทาง" ของตัวชี้วัด
// ตัวชี้วัดบางตัว "ค่าน้อยยิ่งดี" เช่น ค่าใช้จ่ายบริหารต่อไร่
// ถ้าใช้สูตรเดียวกับตัวที่ค่ามากยิ่งดี ผลจะกลับหัวกลับหางทั้งหมด
// ============================================================================

export type Criteria = { level: number; targetValue: number | null };

/**
 * % ความก้าวหน้า เทียบผลงานจริงกับค่าเป้าหมาย
 *
 * ค่ามากยิ่งดี : (ผลงานจริง ÷ เป้าหมาย) × 100
 * ค่าน้อยยิ่งดี: (เป้าหมาย ÷ ผลงานจริง) × 100   ← กลับเศษกับส่วน
 *
 * ทำไมต้องกลับ? ตัวอย่างค่าใช้จ่ายบริหารต่อไร่ เป้าหมาย 94 บาท
 * ถ้าทำได้จริง 80 บาท แปลว่าทำได้ "ดีกว่า" เป้าหมาย ควรได้เกิน 100%
 * แต่ถ้าใช้สูตรแรกจะได้ 80/94 = 85% ซึ่งอ่านผิดความหมาย
 *
 * จำกัดไม่เกิน 100 ตามที่ตกลงไว้ในแผน เพื่อไม่ให้หน่วยที่ทำเกินเป้ามาก
 * ไปดึงค่าเฉลี่ยรวมของทั้งองค์กรให้สูงเกินจริง
 */
export function calcProgressPct(
  actualValue: number | null,
  targetValue: number | null,
  direction: ScoreDirection
): number | null {
  // ค่าเป้าหมายที่เป็นข้อความ (targetValue = null) เอามาหารไม่ได้ จึงไม่มี % ความก้าวหน้า
  if (actualValue === null || targetValue === null) return null;

  let raw: number;
  if (direction === "LOWER_IS_BETTER") {
    // ทำได้ 0 ในตัวชี้วัดที่ยิ่งน้อยยิ่งดี = ดีที่สุดเท่าที่เป็นไปได้
    if (actualValue === 0) return 100;
    raw = (targetValue / actualValue) * 100;
  } else {
    if (targetValue === 0) return actualValue > 0 ? 100 : 0;
    raw = (actualValue / targetValue) * 100;
  }

  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(Math.min(raw, 100) * 100) / 100;
}

/**
 * คะแนน 1-5 จากการเทียบผลงานจริงกับเกณฑ์ของตัวชี้วัดนั้น
 *
 * วิธีคิด: ไล่ดูว่าผ่านเกณฑ์ได้ถึงระดับสูงสุดระดับไหน
 *   ค่ามากยิ่งดี  → ผ่านเมื่อ ผลงานจริง >= ค่าเกณฑ์ของระดับนั้น
 *   ค่าน้อยยิ่งดี → ผ่านเมื่อ ผลงานจริง <= ค่าเกณฑ์ของระดับนั้น
 *
 * ตัวอย่างจาก MOU (ค่าใช้จ่ายบริหารต่อไร่ ค่าน้อยยิ่งดี):
 *   ระดับ 1 = 111 | ระดับ 3 = 94 | ระดับ 5 = 77
 *   ทำได้จริง 80 → ผ่านถึงระดับ 4 (เพราะ 80 <= เกณฑ์ระดับ 4 แต่ยังมากกว่า 77)
 *
 * คืน 0 เมื่อทำได้ต่ำกว่าเกณฑ์ระดับ 1 (ยังไม่ผ่านเกณฑ์ขั้นต่ำ)
 * คืน null เมื่อยังไม่ได้กรอกผล หรือตัวชี้วัดนั้นไม่มีเกณฑ์ให้เทียบ
 */
export function calcScoreLevel(
  actualValue: number | null,
  criteria: Criteria[],
  direction: ScoreDirection
): number | null {
  if (actualValue === null) return null;

  const usable = criteria
    .filter((c): c is { level: number; targetValue: number } => c.targetValue !== null)
    .sort((a, b) => a.level - b.level);
  if (usable.length === 0) return null;

  let best = 0;
  for (const c of usable) {
    const passed =
      direction === "LOWER_IS_BETTER"
        ? actualValue <= c.targetValue
        : actualValue >= c.targetValue;
    if (passed) best = Math.max(best, c.level);
  }
  return best;
}

/**
 * ข้อความเกณฑ์บางรายการเป็นข้อความที่ระบบสร้างเองตอนใส่ข้อมูลตั้งต้น
 * เช่น "ระดับ 3 = 3 ระดับ" ซึ่งไม่มีประโยชน์กับผู้อ่าน
 * ต่างจากข้อความจริงที่ดึงมาจาก MOU เช่น "สินค้าคงคลัง คงเหลือไม่เกินร้อยละ 29.74"
 *
 * ใช้ฟังก์ชันนี้กรองก่อนแสดงผลเสมอ จะได้ไม่โชว์ข้อความที่ไม่ได้บอกอะไร
 */
export function isPlaceholderCriteria(description: string | null | undefined): boolean {
  if (!description) return true;
  return /^ระดับ\s*[1-5]\s*=\s*/.test(description.trim());
}

/**
 * แยกค่าที่ผู้ใช้กรอกในช่องค่าเกณฑ์/ค่าเป้าหมาย ว่าเป็นตัวเลขหรือข้อความ
 *
 * MOU บางตัวชี้วัดกำหนดเกณฑ์เป็นคำบรรยาย เช่น "จัดทำแผนแล้วเสร็จ" ไม่ใช่ตัวเลข
 * ตัวเลขใส่จุลภาคคั่นหลักได้ ("1,250.50") ส่วนอย่างอื่นถือเป็นข้อความทั้งหมด
 */
export function parseTargetInput(raw: string): { value: number | null; text: string | null } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, text: null };
  const numeric = trimmed.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numeric)) return { value: Number(numeric), text: null };
  return { value: null, text: trimmed };
}

/** ค่าเป้าหมายหลักสำหรับแสดงผล ใช้ตัวเลขถ้ามี ไม่งั้นใช้ข้อความ */
export function targetLabel(indicator: {
  targetValue: number | null;
  targetText: string | null;
  unit: string;
}): string {
  if (indicator.targetValue !== null) return `${indicator.targetValue} ${indicator.unit}`;
  return indicator.targetText ?? "-";
}

/** ข้อความอธิบายคะแนนสำหรับแสดงบนหน้าจอ */
export function scoreLabel(scoreLevel: number | null): string {
  if (scoreLevel === null) return "ยังไม่ได้ประเมิน";
  if (scoreLevel === 0) return "ต่ำกว่าเกณฑ์ระดับ 1";
  return `ระดับ ${scoreLevel}`;
}

/**
 * คะแนนถ่วงน้ำหนักของตัวชี้วัดหนึ่งรายการ
 *
 * คะแนนรวมของส่วนงาน = ผลรวมของ (คะแนน × น้ำหนัก ÷ 100) ทุกตัวชี้วัด
 * น้ำหนักรวมของทุกส่วนงานเท่ากับ 100 อยู่แล้ว คะแนนรวมจึงเต็ม 5 เท่ากันทุกหน่วย
 * ทำให้เทียบข้ามส่วนงานได้ตรงๆ
 */
export function weightedScore(scoreLevel: number | null, weight: number): number | null {
  if (scoreLevel === null) return null;
  return Math.round(((scoreLevel * weight) / 100) * 10000) / 10000;
}

/** สีของป้ายคะแนน - ใช้ชุดเดียวกันทุกหน้า */
export function scoreClass(scoreLevel: number | null): string {
  if (scoreLevel === null) return "bg-slate-100 text-slate-600";
  if (scoreLevel >= 4) return "bg-emerald-50 text-emerald-800";
  if (scoreLevel === 3) return "bg-brand-50 text-brand-800";
  if (scoreLevel >= 1) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}
