import { db } from "@/lib/db";
import { planLevelGroups } from "@/lib/plan";

// ============================================================================
// ข้อสังเกต แยกตามส่วนของตารางแผน (ตอนตีกลับแผน/ผล)
// ============================================================================
// ส่วน (section):  "TARGET" = ใต้ตารางเป้าหมายตัวชี้วัด
//                  "L1".."L6" = ใต้ค่าเกณฑ์ระดับ 1-5 และกลุ่มเงื่อนไขอื่นๆ (ระดับ 6)
// quarter:         0 = ข้อสังเกตต่อแผน · 1-4 = ข้อสังเกตต่อผลของไตรมาสนั้น
// ช่องในฟอร์มชื่อ comment_<section> เช่น comment_TARGET, comment_L3
// ============================================================================

export const PLAN_COMMENT_QUARTER = 0;

/** หัวกล่องข้อสังเกต: หน้าแผนพูดถึงแผน หน้ารายงานผลพูดถึงผล */
export const COMMENT_HEADING = {
  plan: "ข้อสังเกตเพื่อให้แผนมีความชัดเจน",
  report: "ข้อสังเกตเพื่อให้ผลมีความชัดเจน",
} as const;
export const COMMENT_MAX_LENGTH = 2000;

export function levelCommentKey(level: number): string {
  return `L${level}`;
}

/** ชื่อส่วนสำหรับแสดงในแจ้งเตือนและแถบสรุป เช่น "เป้าหมายตัวชี้วัด", "ค่าเกณฑ์ระดับ 3" */
export function commentSectionLabel(section: string): string {
  if (section === "TARGET") return "เป้าหมายตัวชี้วัด";
  const level = Number(section.slice(1));
  return level === 6 ? "เงื่อนไขอื่นๆ" : `ค่าเกณฑ์ระดับ ${level}`;
}

/** ส่วนทั้งหมดที่ตัวชี้วัดนี้มีกล่องข้อสังเกตได้ (ไล่จากค่าเกณฑ์ที่มีจริง ไม่เชื่อฟอร์ม) */
export function commentSections(criteriaLevels: number[]): string[] {
  const groups = planLevelGroups(
    criteriaLevels.map((level) => ({ level, targetValue: null, description: null })),
    "",
    [],
  );
  return ["TARGET", ...groups.map((g) => levelCommentKey(g.level))];
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
export function combineComments(comments: { section: string; text: string }[]): string {
  return comments.map((c) => `${commentSectionLabel(c.section)}: ${c.text}`).join("\n");
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
