import raw from "../../prisma/department-scores.json";

// ============================================================================
// คะแนนภาพรวมของแต่ละส่วนงาน (จากไฟล์ Excel ของส่วนกลาง)
// ============================================================================
// ที่มา: คะแนน MOU/คะแนนจัดลำดับ MOU 69.xlsx
//
// ทำไมเก็บเป็นไฟล์ ไม่เก็บในฐานข้อมูล?
//   เป็นตัวเลขสรุปที่ส่วนกลางจัดทำปีละครั้ง ไม่ได้แก้ระหว่างปี
//   และต้นทางก็เป็นไฟล์ Excel อยู่แล้ว เก็บเป็นไฟล์จึงตรงกับความเป็นจริง
//   ถ้าภายหลังต้องการแก้ตัวเลขในระบบได้เอง ค่อยย้ายไปเก็บในฐานข้อมูล
//
// วิธีอัปเดตเมื่อได้ไฟล์ปีใหม่:
//   วางไฟล์ทับที่เดิม แล้วรัน
//     npx tsx prisma/import-department-scores.ts --apply
// ============================================================================

export type QuarterKey = "1" | "2" | "3" | "4";
export const QUARTER_KEYS: QuarterKey[] = ["1", "2", "3", "4"];

export type DepartmentScoreRow = {
  /** ลำดับตามไฟล์ต้นทาง ซึ่งเรียงจากคะแนนปีมากไปน้อย */
  rank: number;
  /** รหัสส่วนงานที่ใช้ในระบบ */
  code: string;
  /** ชื่อตามที่เขียนในไฟล์ Excel (บางแห่งเขียนต่างจากรหัสในระบบ) */
  sourceName: string;
  /**
   * คะแนนรายไตรมาส เต็ม 5 — null = ไฟล์ยังไม่มีคะแนนของไตรมาสนั้น
   * ไฟล์ของแต่ละไตรมาสมีคะแนนไตรมาสแค่ไตรมาสเดียว สคริปต์นำเข้าจึงสะสมไว้ทีละไตรมาส
   */
  quarterScores: Record<QuarterKey, number | null>;
  /** คะแนนสะสมทั้งปี เต็ม 5 — เป็นตัวที่ใช้จัดลำดับ */
  yearScore: number | null;
  /** ชื่อสายบังคับบัญชาที่สังกัด — null = ไฟล์ไม่ได้ระบุว่าอยู่สายไหน */
  line: string | null;
  /** false = มีในไฟล์แต่ไม่มีส่วนงานนี้ในระบบแล้ว */
  inSystem: boolean;
};

export type CommandLine = {
  /** ชื่อสายบังคับบัญชา เช่น "รองผวก. (ป.)" */
  name: string;
  /** ชื่อชีตต้นทางในไฟล์ Excel — null = ปีนี้ไฟล์ยังไม่มีข้อมูลของสายนี้ */
  sheet: string | null;
  /** คะแนนปีเฉลี่ยของส่วนงานในสาย — null = สายว่าง */
  averageYearScore: number | null;
};

export type DepartmentScoreData = {
  source: string;
  sheet: string;
  fiscalYear: number;
  /** ไตรมาสล่าสุดที่นำเข้า — คะแนนปีเป็นคะแนนสะสมถึงไตรมาสนี้ */
  latestQuarter: number;
  columns: { quarterScore: string; yearScore: string };
  lines: CommandLine[];
  departments: DepartmentScoreRow[];
};

/**
 * ไฟล์เก็บคะแนนแยกเป็นรายปีบัญชี
 *
 * หน้าภาพรวมต้องเปลี่ยนตามปีบัญชีที่ใช้งานอยู่ (ตั้งที่ ตั้งค่าระบบ > ปีบัญชี)
 * ถ้าเก็บปีเดียว พอเปลี่ยนปีแล้วหน้าภาพรวมจะยังโชว์คะแนนปีเก่าโดยไม่บอกใคร
 */
const allYears = (raw as { years: DepartmentScoreData[] }).years;

/** คะแนนของปีบัญชีที่ระบุ — null = ยังไม่ได้นำเข้าไฟล์คะแนนของปีนั้น */
export function departmentScoresFor(fiscalYear: number | null): DepartmentScoreData | null {
  if (fiscalYear === null) return null;
  return allYears.find((y) => y.fiscalYear === fiscalYear) ?? null;
}

/** ปีบัญชีที่มีไฟล์คะแนนแล้ว เรียงจากปีล่าสุด */
export function yearsWithScores(): number[] {
  return allYears.map((y) => y.fiscalYear).sort((a, b) => b - a);
}

export type ScoreLineGroup = {
  name: string;
  /** ส่วนงานในสาย เรียงจากคะแนนปีมากไปน้อย ส่วนงานที่ไม่มีคะแนนต่อท้าย */
  departments: DepartmentScoreRow[];
  /** คะแนนปีเฉลี่ยของทุกส่วนงานในสายที่มีคะแนน — null = ไม่มีคะแนนเลย */
  averageYearScore: number | null;
};

/**
 * จัดกลุ่มคะแนนตามสายบังคับบัญชาที่ส่วนกลางกำหนดในระบบ (ตาราง CommandLine)
 *
 * เดิมอ่านการแบ่งสายจากไฟล์ Excel ตอนนี้ย้ายมาอยู่ในฐานข้อมูลให้แก้ไขเองได้
 * ไฟล์คะแนนจึงใช้แค่ตัวเลขคะแนน ส่วนงานไหนอยู่สายไหนดูจากฐานข้อมูลเสมอ
 *
 * `lines` = สายเรียงตามลำดับที่ตั้งไว้ พร้อมรหัสส่วนงานในสาย
 * `visibleCodes` = รหัสส่วนงานที่ผู้ใช้คนนี้มีสิทธิ์เห็น (null = เห็นทุกส่วนงาน)
 * ค่าเฉลี่ยของสายคิดจากทุกส่วนงานในสาย ไม่ขึ้นกับสิทธิ์การมองเห็น
 * ส่วนงานที่ยังไม่ระบุสาย รวมไว้กลุ่ม "ยังไม่ระบุสาย" ท้ายสุด (เฉพาะเมื่อมี)
 */
export function groupScoresByLines(
  scores: DepartmentScoreData,
  lines: { name: string; codes: string[] }[],
  unassignedCodes: string[],
  visibleCodes: Set<string> | null = null
): ScoreLineGroup[] {
  const byCode = new Map(scores.departments.map((d) => [d.code, d]));

  const build = (name: string, codes: string[]): ScoreLineGroup => {
    // ส่วนงานที่อยู่ในสายแต่ไม่มีคะแนนในไฟล์ปีนี้ ยังแสดงไว้ (คะแนนเป็น –) จะได้เห็นว่าอยู่สายนี้
    const rows = codes.map(
      (code): DepartmentScoreRow =>
        byCode.get(code) ?? {
          rank: 0,
          code,
          sourceName: code,
          quarterScores: { "1": null, "2": null, "3": null, "4": null },
          yearScore: null,
          line: name,
          inSystem: true,
        }
    );
    const withScore = rows.filter((r) => r.yearScore !== null);
    const averageYearScore =
      withScore.length === 0
        ? null
        : withScore.reduce((sum, r) => sum + (r.yearScore ?? 0), 0) / withScore.length;

    return {
      name,
      averageYearScore,
      departments: rows
        .filter((r) => visibleCodes === null || visibleCodes.has(r.code))
        .sort((x, y) => (y.yearScore ?? -1) - (x.yearScore ?? -1)),
    };
  };

  const groups = lines.map((l) => build(l.name, l.codes));
  if (unassignedCodes.length > 0) {
    const extra = build("ยังไม่ระบุสาย", unassignedCodes);
    if (extra.departments.length > 0) groups.push(extra);
  }
  return groups;
}

/** คะแนนปีเฉลี่ยของรายการส่วนงาน — null = ไม่มีส่วนงานไหนมีคะแนน */
export function averageYearScore(rows: DepartmentScoreRow[]): number | null {
  const values = rows.map((r) => r.yearScore).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** คะแนนเต็มของ MOU คือ 5 ใช้เป็นฐานของแถบเปรียบเทียบ */
export const MOU_SCORE_MAX = 5;
