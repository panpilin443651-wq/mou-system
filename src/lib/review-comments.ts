import { db } from "@/lib/db";
import type { PlanSection } from "@prisma/client";
import { PLAN_SECTION_ITEM_LABEL, planLevelGroups, planRowLabel } from "@/lib/plan";

// ============================================================================
// ข้อสังเกต กปม. ตอนตีกลับแผน/ผล - ตีกลับเป็นรายขั้นตอนการดำเนินงาน
// ============================================================================
// ส่วน (section):  "ROW_<id>" = ข้อสังเกตของบรรทัดหนึ่ง (ขั้นตอนการดำเนินงาน / รายการเป้าหมาย)
//                  บรรทัดที่ไม่มีข้อสังเกต = ไม่ถูกตีกลับ ล็อกไว้ (ช่องสีเทา) ระหว่างแก้
//                  แบบเดิม (ก่อนตีกลับรายขั้นตอน) ยังอ่านได้ ข้อมูลเก่าจะไม่พัง:
//                  "TARGET" = ทั้งตารางเป้าหมายตัวชี้วัด · "L1".."L6" = ทั้งค่าเกณฑ์ระดับนั้น
// quarter:         0 = ข้อสังเกตต่อแผน · 1-4 = ข้อสังเกตต่อผลของไตรมาสนั้น
// ช่องในฟอร์มชื่อ comment_<section> เช่น comment_ROW_ck123
// ============================================================================

export const PLAN_COMMENT_QUARTER = 0;

/** หัวกล่องข้อสังเกต (หน้าแผนและหน้ารายงานผล) */
export const COMMENT_HEADING = {
  plan: "ข้อสังเกต กปม.",
  report: "ข้อสังเกต กปม.",
} as const;
export const COMMENT_MAX_LENGTH = 2000;

export function levelCommentKey(level: number): string {
  return `L${level}`;
}

const ROW_PREFIX = "ROW_";

/** key ของข้อสังเกตรายบรรทัด (ขั้นตอนการดำเนินงาน / รายการเป้าหมาย) */
export function rowCommentKey(rowId: string): string {
  return `${ROW_PREFIX}${rowId}`;
}

type PlanRowRef = { id: string; section: string; criteriaLevel: number | null };

/** ส่วนของบรรทัด: "TARGET" หรือ "L<ระดับ>" */
export function rowSectionKey(row: { section: string; criteriaLevel: number | null }): string {
  return row.section === "TARGET" ? "TARGET" : levelCommentKey(row.criteriaLevel ?? -1);
}

/**
 * ระหว่างถูกตีกลับ บรรทัดนี้แก้ได้ไหม = ถูกตีกลับรายบรรทัด (หรือทั้งส่วน แบบเดิม)
 * keys = null คือไม่จำกัด
 */
export function canEditReturnedRow(
  keys: ReadonlySet<string> | readonly string[] | null,
  row: PlanRowRef,
): boolean {
  if (keys === null) return true;
  const has = (k: string) => ("has" in keys ? keys.has(k) : keys.includes(k));
  return has(rowSectionKey(row)) || has(rowCommentKey(row.id));
}

/**
 * ส่วนนี้มีอะไรถูกตีกลับไหม (ทั้งส่วน หรือบรรทัดใดบรรทัดหนึ่งในส่วน)
 * ใช้กับช่องที่เป็นของทั้งส่วน: รายงานผลรายระดับ และผลงานที่ทำได้จริงของไตรมาส (TARGET)
 */
export function returnedSectionTouched(
  keys: ReadonlySet<string> | readonly string[] | null,
  section: string,
  rows: PlanRowRef[],
): boolean {
  if (keys === null) return true;
  const has = (k: string) => ("has" in keys ? keys.has(k) : keys.includes(k));
  return has(section) || rows.some((r) => rowSectionKey(r) === section && has(rowCommentKey(r.id)));
}

/** ชื่อของแต่ละบรรทัดสำหรับแจ้งเตือน เช่น "ขั้นตอนการดำเนินงาน 3.1" - key = ROW_<id> */
export function rowCommentLabels(
  rows: (PlanRowRef & { sortOrder: number })[],
): Record<string, string> {
  return Object.fromEntries(
    rows.map((r) => {
      const section = r.section as PlanSection;
      const label = planRowLabel({ section, criteriaLevel: r.criteriaLevel, sortOrder: r.sortOrder });
      return [rowCommentKey(r.id), `${PLAN_SECTION_ITEM_LABEL[section]} ${label}`];
    }),
  );
}

/** ชื่อส่วน/บรรทัดสำหรับแสดงในแจ้งเตือนและแถบสรุป เช่น "ขั้นตอนการดำเนินงาน 3.1", "ค่าเกณฑ์ระดับ 3" */
export function commentSectionLabel(section: string, labels?: Record<string, string>): string {
  if (labels?.[section]) return labels[section];
  if (section.startsWith(ROW_PREFIX)) return "ขั้นตอนการดำเนินงาน";
  if (section === "TARGET") return "เป้าหมายตัวชี้วัด";
  const level = Number(section.slice(1));
  return level === 6 ? "เงื่อนไขอื่นๆ" : `ค่าเกณฑ์ระดับ ${level}`;
}

/**
 * ทุก key ที่ตัวชี้วัดนี้มีกล่องข้อสังเกตได้ (ไล่จากค่าเกณฑ์และบรรทัดที่มีจริง ไม่เชื่อฟอร์ม)
 * ส่วนทั้งส่วน (TARGET/L<n>) ยังอยู่ ให้ส่วนกลางแก้/ล้างข้อสังเกตแบบเดิมที่ค้างอยู่ได้
 */
export function commentSections(criteriaLevels: number[], rowIds: string[] = []): string[] {
  const groups = planLevelGroups(
    criteriaLevels.map((level) => ({ level, targetValue: null, description: null })),
    "",
    [],
  );
  return ["TARGET", ...groups.map((g) => levelCommentKey(g.level)), ...rowIds.map(rowCommentKey)];
}

/** อ่านข้อสังเกตจากฟอร์ม คืนเฉพาะช่องที่มีข้อความ (ตัดยาวเกินทิ้ง) เรียงตามลำดับส่วน */
export function readComments(
  formData: FormData,
  sections: string[],
): { section: string; text: string }[] {
  return sections
    .map((section) => ({
      section,
      text: String(formData.get(`comment_${section}`) ?? "").trim().slice(0, COMMENT_MAX_LENGTH),
    }))
    .filter((c) => c.text !== "");
}

/** รวมข้อสังเกตเป็นข้อความเดียว ใช้เป็น returnNote (แถบแดงด้านบน) และเนื้อหาแจ้งเตือน */
export function combineComments(
  comments: { section: string; text: string }[],
  labels?: Record<string, string>,
): string {
  return comments.map((c) => `${commentSectionLabel(c.section, labels)}: ${c.text}`).join("\n");
}

/** แทนข้อสังเกตของตัวชี้วัด/ไตรมาสนี้ทั้งชุด (ลบของเก่าแล้วเขียนใหม่) */
export function replaceCommentsOps(
  indicatorId: string,
  quarter: number,
  comments: { section: string; text: string }[],
) {
  return [
    db.reviewComment.deleteMany({ where: { indicatorId, quarter } }),
    db.reviewComment.createMany({
      data: comments.map((c) => ({ indicatorId, quarter, section: c.section, text: c.text })),
    }),
  ];
}

/** ล้างข้อสังเกตเมื่อหัวหน้าส่วนงานส่งแผน/ส่งผลใหม่แล้ว */
export function clearComments(indicatorId: string, quarter: number) {
  return db.reviewComment.deleteMany({ where: { indicatorId, quarter } });
}

/**
 * ส่วนที่ผู้รับผิดชอบส่วนงานแก้ได้ระหว่างแผนถูกตีกลับ = ส่วนที่มีข้อสังเกตของแผน
 * (เช่น "TARGET", "L3") คืน null = ไม่จำกัด
 *
 * restricted = false (ส่วนกลาง หรือแผนไม่ได้อยู่ในสถานะถูกตีกลับ) ไม่จำกัด
 * ตีกลับแล้วแต่ไม่มีข้อสังเกตรายส่วนเลย (ตีกลับก่อนมีกล่องรายส่วน) ไม่จำกัด ไม่งั้นจะแก้อะไรไม่ได้เลย
 */
export async function returnedEditableSections(
  indicatorId: string,
  restricted: boolean,
): Promise<Set<string> | null> {
  if (!restricted) return null;
  const keys = Object.keys(await loadComments(indicatorId, PLAN_COMMENT_QUARTER));
  return keys.length === 0 ? null : new Set(keys);
}

/** ข้อสังเกตของตัวชี้วัด/ไตรมาสนี้ เป็น map section -> ข้อความ */
export async function loadComments(
  indicatorId: string,
  quarter: number,
): Promise<Record<string, string>> {
  const rows = await db.reviewComment.findMany({
    where: { indicatorId, quarter },
    select: { section: true, text: true },
  });
  return Object.fromEntries(rows.map((r) => [r.section, r.text]));
}
