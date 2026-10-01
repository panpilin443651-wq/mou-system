import { db } from "@/lib/db";
import { planLevelGroups } from "@/lib/plan";

// ============================================================================
// ความเห็นส่วนกลาง แยกตามส่วนของตารางแผน (ตอนตีกลับแผน/ผล)
// ============================================================================
// ส่วน (section):  "TARGET" = ใต้ตารางเป้าหมายตัวชี้วัด
//                  "L1".."L6" = ใต้ค่าเกณฑ์ระดับ 1-5 และกลุ่มเงื่อนไขอื่นๆ (ระดับ 6)
// quarter:         0 = ความเห็นต่อแผน · 1-4 = ความเห็นต่อผลของไตรมาสนั้น
// ช่องในฟอร์มชื่อ comment_<section> เช่น comment_TARGET, comment_L3
// ============================================================================

export const PLAN_COMMENT_QUARTER = 0;
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

/** ส่วนทั้งหมดที่ตัวชี้วัดนี้มีกล่องความเห็นได้ (ไล่จากค่าเกณฑ์ที่มีจริง ไม่เชื่อฟอร์ม) */
export function commentSections(criteriaLevels: number[]): string[] {
  const groups = planLevelGroups(
    criteriaLevels.map((level) => ({ level, targetValue: null, description: null })),
    "",
    [],
  );
  return ["TARGET", ...groups.map((g) => levelCommentKey(g.level))];
}

/** อ่านความเห็นจากฟอร์ม คืนเฉพาะช่องที่มีข้อความ (ตัดยาวเกินทิ้ง) เรียงตามลำดับส่วน */
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

/** รวมความเห็นเป็นข้อความเดียว ใช้เป็น returnNote (แถบแดงด้านบน) และเนื้อหาแจ้งเตือน */
export function combineComments(comments: { section: string; text: string }[]): string {
  return comments.map((c) => `${commentSectionLabel(c.section)}: ${c.text}`).join("\n");
}

/** แทนความเห็นของตัวชี้วัด/ไตรมาสนี้ทั้งชุด (ลบของเก่าแล้วเขียนใหม่) */
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

/** ล้างความเห็นเมื่อหัวหน้าส่วนงานส่งแผน/ส่งผลใหม่แล้ว */
export function clearComments(indicatorId: string, quarter: number) {
  return db.reviewComment.deleteMany({ where: { indicatorId, quarter } });
}

/** ความเห็นของตัวชี้วัด/ไตรมาสนี้ เป็น map section -> ข้อความ */
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
