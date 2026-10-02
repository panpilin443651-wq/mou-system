import type { PlanSection } from "@prisma/client";

// ============================================================================
// แผนดำเนินงานตามแบบฟอร์ม "เอกสารแนบ 4" ของ กยท.
// ============================================================================
// แบบฟอร์มจริงเป็นตาราง Excel ที่กรอกตัวเลข "แผน" กับ "ผล" รายเดือน 12 เดือน
// แล้วให้สูตรใน Excel คิดเปอร์เซ็นต์ให้ ระบบนี้คิดสูตรเดียวกันด้วย JavaScript
// เพื่อให้ตัวเลขที่เห็นบนเว็บกับไฟล์ที่ดาวน์โหลดออกไปตรงกันเสมอ
//
// รวมไว้ที่ไฟล์เดียวเพราะทั้งหน้าเว็บ (ฝั่งเบราว์เซอร์) ไฟล์ Excel
// และหน้ารายการแผน ต้องใช้สูตรชุดเดียวกัน ถ้าเขียนซ้ำจะแก้ไม่ทั่ว
// ============================================================================

export const QUARTERS = [1, 2, 3, 4] as const;

/**
 * ไตรมาสของปีงบประมาณไทย ไม่ตรงกับไตรมาสปฏิทิน
 * ปีงบเริ่ม 1 ต.ค. ไตรมาส 1 จึงเป็น ต.ค.-ธ.ค.
 */
export const QUARTER_MONTHS: Record<number, string> = {
  1: "ต.ค. – ธ.ค.",
  2: "ม.ค. – มี.ค.",
  3: "เม.ย. – มิ.ย.",
  4: "ก.ค. – ก.ย.",
};

export function quarterLabel(quarter: number): string {
  return `ไตรมาส ${quarter}`;
}

// ----------------------------------------------------------------------------
// เดือนตามปีงบประมาณ
// ----------------------------------------------------------------------------

/**
 * 12 เดือนเรียงตามปีงบประมาณ ไม่ใช่ปีปฏิทิน
 * ช่องที่ 0 คือ ต.ค. (เดือนแรกของปีงบ) ช่องที่ 11 คือ ก.ย.
 * ลำดับนี้ต้องตรงกับหัวตารางในเอกสารแนบ 4 เป๊ะ ๆ
 */
export const FISCAL_MONTHS = [
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
] as const;

// ระบุชนิดเป็น number ไว้ ไม่งั้น TypeScript จะจำค่าเป็นเลข 12 ตายตัว
// แล้วฟังก์ชันที่รับจำนวนเดือนจะรับได้เฉพาะเลข 12 เท่านั้น
export const MONTH_COUNT: number = FISCAL_MONTHS.length;

/** เดือนช่องที่ i อยู่ไตรมาสไหน (ใช้ตีเส้นคั่นไตรมาสในตาราง) */
export function monthQuarter(index: number): number {
  return Math.floor(index / 3) + 1;
}

/**
 * แปลงเดือนปฏิทิน (0 = ม.ค.) เป็นช่องในปีงบประมาณ
 * ต.ค.(9) → 0, พ.ย.(10) → 1, ธ.ค.(11) → 2, ม.ค.(0) → 3 ...
 */
export function calendarMonthToFiscalIndex(calendarMonth: number): number {
  return (calendarMonth + 3) % 12;
}

/**
 * ตอนนี้ควรคิดยอดสะสมถึงเดือนไหนของปีงบ `year`
 *
 * ปีงบ 2569 = 1 ต.ค. 2568 ถึง 30 ก.ย. 2569 (พ.ศ.)
 * - ถ้าปีงบนั้นจบไปแล้ว → คิดครบ 12 เดือน
 * - ถ้ายังมาไม่ถึง → คิด 0 เดือน (ยังไม่มีอะไรให้สะสม)
 * - ถ้ากำลังอยู่ในปีนั้น → คิดถึงเดือนปัจจุบัน
 */
export function currentFiscalMonthIndex(year: number, now = new Date()): number {
  // ใช้เวลาไทยเสมอ ไม่งั้นช่วงหัวค่ำของวันสิ้นเดือนจะนับพลาดไปหนึ่งเดือน
  const bangkok = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const buddhistYear = bangkok.getFullYear() + 543;
  const month = bangkok.getMonth();

  // เดือน ต.ค.-ธ.ค. นับเป็นปีงบถัดไป
  const currentFiscalYear = month >= 9 ? buddhistYear + 1 : buddhistYear;

  if (currentFiscalYear > year) return MONTH_COUNT;
  if (currentFiscalYear < year) return 0;
  return calendarMonthToFiscalIndex(month) + 1;
}

// ----------------------------------------------------------------------------
// ตัวเลขรายเดือน
// ----------------------------------------------------------------------------

/** ตัวเลขรายเดือน 12 ช่อง · null = เว้นว่าง ซึ่งไม่เหมือนกับเลข 0 */
export type MonthValues = (number | null)[];

export const EMPTY_MONTHS: MonthValues = Array(MONTH_COUNT).fill(null);

/**
 * อ่านค่ารายเดือนจากฐานข้อมูล (เก็บเป็น Json) ให้ได้อาร์เรย์ยาว 12 เสมอ
 *
 * ข้อมูลใน Json ไม่มีอะไรรับประกันรูปร่าง ถ้าแถวเก่ายาวไม่ครบหรือมีค่าแปลกปลอม
 * ต้องไม่ทำให้หน้าเว็บพัง จึงเติมให้ครบและตัดค่าที่ไม่ใช่ตัวเลขทิ้ง
 */
export function toMonths(value: unknown): MonthValues {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: MONTH_COUNT }, (_, i) => {
    const v = source[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });
}

/** รวมยอดตั้งแต่เดือนแรกถึงช่องที่ `upto - 1` (upto = จำนวนเดือนที่นับ) */
export function sumMonths(months: MonthValues, upto = MONTH_COUNT): number {
  return months
    .slice(0, Math.max(0, Math.min(upto, MONTH_COUNT)))
    .reduce((sum: number, v) => sum + (v ?? 0), 0);
}

/**
 * เปอร์เซ็นต์ผลเทียบแผน ตามสูตรใน Excel ต้นฉบับ: `IF(ผล=0, 0, ผล/แผน)`
 *
 * ต้นฉบับกันแค่กรณีผลเป็นศูนย์ แต่ต้องกันตัวหารเป็นศูนย์ด้วย
 * ไม่งั้นแถวที่ยังไม่ได้ใส่แผนจะได้ Infinity แล้วหน้าเว็บขึ้น NaN%
 */
export function planPct(plan: number, actual: number): number {
  if (actual === 0 || plan === 0) return 0;
  return (actual / plan) * 100;
}

/**
 * กรอกแผนดำเนินงานครบพอจะกด "ส่งแผน" ได้หรือยัง (ตรวจใน savePlanAction)
 *
 * ถือว่าครบเมื่อมีอย่างน้อย 1 รายการที่ตั้งชื่อรายการและใส่ตัวเลขแผนอย่างน้อย 1 เดือน
 * การรายงานผลรายไตรมาสดูจาก PlanHeader.confirmedAt ไม่ได้ดูจากฟังก์ชันนี้
 */
export function isPlanComplete(
  rows: { title: string; planMonths: MonthValues }[],
): boolean {
  return rows.some(
    (r) => r.title.trim() !== "" && r.planMonths.some((v) => v !== null),
  );
}

/**
 * ค่าเป้าหมายของรายการ ไม่ตรงกับผลรวมแผนรายเดือนทั้งปี
 *
 * ใช้ทั้งหน้าเว็บ (เด้งแจ้งเตือนก่อนส่ง) และ savePlanAction (ปฏิเสธการบันทึก)
 * ช่องค่าเป้าหมายว่าง = ไม่ตรวจ · ปัดทศนิยม 6 ตำแหน่งก่อนเทียบ กันเศษทศนิยมของการบวกเลข
 */
export function targetMismatch(targetValue: number | null, planMonths: MonthValues): boolean {
  if (targetValue === null) return false;
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return round(targetValue) !== round(sumMonths(planMonths));
}

/** "รายงานผลการดำเนินงานของระดับ" เขียนได้ไม่เกินกี่คำ */
export const LEVEL_REPORT_MAX_WORDS = 10_000;

/**
 * นับจำนวนคำ ใช้ทั้งตัวนับบนหน้าเว็บและตอนตรวจที่เซิร์ฟเวอร์ ผลจึงตรงกันเสมอ
 *
 * ภาษาไทยไม่เว้นวรรคระหว่างคำ นับด้วยการแยกช่องว่างจะได้ทั้งย่อหน้าเป็นคำเดียว
 * จึงใช้ Intl.Segmenter ตัดคำตามพจนานุกรมภาษาไทย (นับเฉพาะส่วนที่เป็นคำ ไม่นับเว้นวรรคและเครื่องหมาย)
 */
export function countWords(text: string): number {
  if (text.trim() === "") return 0;
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("th", { granularity: "word" });
    let count = 0;
    for (const s of segmenter.segment(text)) if (s.isWordLike) count++;
    return count;
  }
  return text.trim().split(/\s+/).length;
}

/** เลขลำดับของรายการตามที่แสดงในตาราง เช่น "2" (เป้าหมาย) หรือ "3.1" (ขั้นที่ 1 ของระดับ 3) */
export function planRowLabel(row: {
  section: PlanSection;
  criteriaLevel: number | null;
  sortOrder: number;
}): string {
  return row.section === "STEP" && row.criteriaLevel !== null
    ? `${row.criteriaLevel}.${row.sortOrder}`
    : String(row.sortOrder);
}

// ----------------------------------------------------------------------------
// สรุปผลรายแถวและรายตาราง
// ----------------------------------------------------------------------------

export type PlanRowInput = {
  planMonths: MonthValues;
  actualMonths: MonthValues;
};

export type PlanRowSummary = {
  /** ยอดแผนสะสมถึงเดือนที่กำลังคิด */
  planCum: number;
  actualCum: number;
  /** ผลการดำเนินงานเทียบเป้าหมายสะสม (%) */
  cumPct: number;
  /** ยอดทั้งปี 12 เดือน */
  planYear: number;
  actualYear: number;
  /** ผลการดำเนินงานเทียบเป้าหมายทั้งปี (%) */
  yearPct: number;
};

export function summarizeRow(row: PlanRowInput, upto: number): PlanRowSummary {
  const planCum = sumMonths(row.planMonths, upto);
  const actualCum = sumMonths(row.actualMonths, upto);
  const planYear = sumMonths(row.planMonths);
  const actualYear = sumMonths(row.actualMonths);

  return {
    planCum,
    actualCum,
    cumPct: planPct(planCum, actualCum),
    planYear,
    actualYear,
    yearPct: planPct(planYear, actualYear),
  };
}

/**
 * บรรทัดสรุปท้ายตาราง "ค่าเฉลี่ยร้อยละผลการดำเนินงานตามเป้าหมาย"
 *
 * ต้นฉบับใช้ AVERAGE ของคอลัมน์เปอร์เซ็นต์ คือเฉลี่ยแบบให้ทุกแถวน้ำหนักเท่ากัน
 * ไม่ใช่เอายอดรวมมาหารกัน ผลลัพธ์ต่างกันเมื่อแต่ละแถวมีขนาดไม่เท่ากัน
 */
export function summarizeSection(rows: PlanRowInput[], upto: number) {
  const summaries = rows.map((r) => summarizeRow(r, upto));
  const avg = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

  return {
    rows: summaries,
    count: rows.length,
    avgCumPct: avg(summaries.map((s) => s.cumPct)),
    avgYearPct: avg(summaries.map((s) => s.yearPct)),
  };
}

// ----------------------------------------------------------------------------
// ข้อความประจำแบบฟอร์ม
// ----------------------------------------------------------------------------

export const PLAN_SECTIONS = ["TARGET", "STEP"] as const;

export const PLAN_SECTION_TITLE: Record<PlanSection, string> = {
  TARGET: "เป้าหมายตัวชี้วัด",
  STEP: "ติดตามการดำเนินงานตามแผน (การประเมินเชิงคุณภาพ)",
};

/** หัวคอลัมน์แรกของแต่ละตาราง ซึ่งแบบฟอร์มใช้คนละคำกัน */
export const PLAN_SECTION_INDEX_LABEL: Record<PlanSection, string> = {
  TARGET: "ตัวชี้วัดที่",
  STEP: "ลำดับ",
};

export const PLAN_SECTION_ITEM_LABEL: Record<PlanSection, string> = {
  TARGET: "เป้าหมายตัวชี้วัด",
  STEP: "ขั้นตอนการดำเนินงาน",
};

/** หัวคอลัมน์เปอร์เซ็นต์ ซึ่งแบบฟอร์มก็ใช้คนละคำกันสองตาราง */
export const PLAN_SECTION_CUM_LABEL: Record<PlanSection, string> = {
  TARGET: "ผลการดำเนินงานเทียบเป้าหมายสะสม",
  STEP: "ความก้าวหน้าเทียบแผนสะสม",
};

export const PLAN_SECTION_YEAR_LABEL: Record<PlanSection, string> = {
  TARGET: "ผลการดำเนินงานเทียบเป้าหมายทั้งปี",
  STEP: "ความก้าวหน้าเทียบแผนทั้งปี",
};

/** หัวบรรทัดค่าเฉลี่ยท้ายตาราง - ตารางเป้าหมายเทียบผลกับเป้าหมาย ตารางขั้นตอนเทียบความก้าวหน้ากับแผน */
export const PLAN_SECTION_AVG_LABEL: Record<PlanSection, string> = {
  TARGET: "ค่าเฉลี่ยร้อยละผลการดำเนินงานตามเป้าหมาย",
  STEP: "ค่าเฉลี่ยร้อยละความก้าวหน้าตามแผนการดำเนินงาน",
};

export const PLAN_SECTION_CAUSE_LABEL: Record<PlanSection, string> = {
  TARGET: "สาเหตุที่ไม่สามารถดำเนินการได้ตามเป้าหมาย",
  STEP: "สาเหตุที่ไม่สามารถดำเนินการได้ตามแผน",
};

/** คำแนะนำท้ายตาราง คัดลอกจากแบบฟอร์มต้นฉบับ เพื่อให้คนกรอกเห็นเกณฑ์เดียวกัน */
export const PLAN_SECTION_GUIDE: Record<PlanSection, string> = {
  TARGET:
    "แนวทางการกำหนดเป้าหมายตัวชี้วัดรายเดือน : 1. กรณีที่เป้าหมายการดำเนินงานมีลักษณะที่เป็นฤดูกาล " +
    "ควรกำหนดเป้าหมายรายเดือนโดยพิจารณาจากข้อมูลสถิติผลการดำเนินงานในอดีต การวิเคราะห์แนวโน้มในอนาคต " +
    "รวมถึงปัจจัยเสี่ยงปัจจุบันที่เกี่ยวข้อง เพื่อให้ได้เป้าหมายที่ใกล้เคียงกับสภาพการณ์จริงมากที่สุด " +
    "2. งานที่ไม่มีปัจจัยภายนอก เช่น ฤดูกาลมาเกี่ยวข้อง ขอให้เร่งดำเนินการให้แล้วเสร็จภายในไตรมาส 3",
  STEP:
    "แนวทางการกำหนดขั้นตอนการดำเนินงาน : 1. การกำหนดขั้นตอนการดำเนินงาน ควรกำหนดขั้นตอนหลัก ๆ " +
    "ที่สำคัญต่อการบรรลุเป้าหมายให้ชัดเจนก่อน จากนั้นจึงกำหนดกิจกรรมย่อย ๆ ของแต่ละขั้นตอน " +
    "ไม่ควรนำกิจกรรมย่อย ๆ มาใส่ในขั้นตอนหลัก 2. การกำหนดค่าเป้าหมายของขั้นตอนหลัก " +
    "อาจระบุเป็นจำนวนครั้งที่ต้องดำเนินการ ไม่ระบุค่าเป้าหมายเป็นร้อยละ " +
    "3. กรณีที่มีกิจกรรมที่ดำเนินการ 1 ครั้ง แต่ใช้เวลาดำเนินการมากกว่า 1 เดือน " +
    "ให้ใส่เลข 1 ในเดือนสุดท้ายที่คาดว่ากิจกรรมนั้น ๆ จะแล้วเสร็จ " +
    "4. งานที่ไม่มีปัจจัยภายนอก เช่น ฤดูกาลมาเกี่ยวข้อง ขอให้เร่งดำเนินการให้แล้วเสร็จภายในไตรมาส 3",
};

// ----------------------------------------------------------------------------
// กลุ่มของตารางขั้นตอนการดำเนินงาน: ค่าเกณฑ์ระดับ 1-5 + เงื่อนไขอื่นๆ
// ----------------------------------------------------------------------------

/**
 * กลุ่ม "เงื่อนไขอื่นๆ (ถ้ามี)" ต่อท้ายค่าเกณฑ์ระดับ 5
 *
 * เก็บเป็นระดับ 6 ใน ActionPlan.criteriaLevel และ PlanLevelReport.level
 * จะได้ใช้ตารางและช่องรายงานผลรายระดับชุดเดิมได้เลย ไม่ต้องเพิ่มตารางใหม่
 * ไม่มี ScoreCriteria ระดับ 6 จริง จึงไม่กระทบการคิดคะแนน
 */
export const OTHER_CONDITIONS_LEVEL = 6;

export type PlanLevelGroup = {
  level: number;
  /** หัวกลุ่ม เช่น "ค่าเกณฑ์ระดับ 3" */
  title: string;
  /** ข้อความใต้หัวกลุ่ม ใช้เรียกต่อท้ายข้อความ เช่น "ของระดับ 3" */
  shortTitle: string;
  /** ค่าเกณฑ์ของระดับนั้น แสดงต่อท้ายหัวกลุ่ม เช่น "80 บาท/ไร่" - null = ไม่มี */
  value: string | null;
  /** ข้อความใต้หัวกลุ่ม (รายการเงื่อนไขของกลุ่มเงื่อนไขอื่นๆ) - null = ไม่มีให้แสดง */
  description: string | null;
};

/**
 * กลุ่มทั้งหมดของตารางขั้นตอนการดำเนินงาน ใช้ทั้งหน้าเว็บ ไฟล์ Excel และตอนบันทึก
 * ตัวชี้วัดที่ยังไม่มีค่าเกณฑ์เลย ไม่มีกลุ่มเงื่อนไขอื่นๆ ด้วย (ยังเพิ่มขั้นตอนไม่ได้ทั้งตาราง)
 */
export function planLevelGroups(
  criteria: { level: number; targetValue: number | null; description: string | null }[],
  unit: string,
  conditions: string[],
): PlanLevelGroup[] {
  if (criteria.length === 0) return [];
  return [
    ...criteria.map((c) => ({
      level: c.level,
      title: `ค่าเกณฑ์ระดับ ${c.level}`,
      shortTitle: `ระดับ ${c.level}`,
      // เกณฑ์ตัวเลขแสดงค่า + หน่วย เกณฑ์แบบข้อความแสดงข้อความเกณฑ์จาก MOU
      // (ตัดคำว่า "ระดับ 3 =" ที่ระบบเติมให้ออก เพราะหัวกลุ่มบอกระดับอยู่แล้ว)
      value:
        c.targetValue !== null
          ? `${formatPlanNumber(c.targetValue)} ${unit}`.trim()
          : c.description?.trim().replace(/^ระดับ\s*[1-5]\s*=\s*/, "") || null,
      description: null,
    })),
    {
      level: OTHER_CONDITIONS_LEVEL,
      title: "เงื่อนไขอื่นๆ (ถ้ามี)",
      shortTitle: "เงื่อนไขอื่นๆ",
      value: null,
      description:
        conditions.length === 0
          ? null
          : conditions.length === 1
            ? conditions[0]
            : conditions.map((c, i) => `${i + 1}. ${c}`).join("\n"),
    },
  ];
}

/** แสดงตัวเลขแบบไม่ให้มีทศนิยมรุงรัง แต่ยังเก็บทศนิยมจริงไว้ถ้ามี */
export function formatPlanNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

export function formatPct(value: number): string {
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
}
