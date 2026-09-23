"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageMouScores } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { MOU_QUARTERS } from "@/lib/mou-scores";

// ============================================================================
// Server Action สำหรับคะแนนประเมินรายตัวชี้วัด
// ============================================================================
// ตรวจสิทธิ์เองที่บรรทัดแรกเสมอ ไม่พึ่งการซ่อนปุ่มบนหน้าจอ
// เพราะ Server Action ถูกยิงตรงได้โดยไม่ต้องผ่านหน้าเว็บ
// ============================================================================

export type MouScoreFormState = { error: string | null; savedAt?: string };

/** คะแนนเต็ม 5 ทุกช่อง ทั้งแผน ผล และคะแนนของไตรมาส */
const MAX_SCORE = 5;

/**
 * อ่านตัวเลขจากช่องกรอก
 *
 * ช่องว่าง = "ยังไม่ประเมิน" ซึ่งต่างจาก 0 ที่แปลว่าได้ศูนย์คะแนนจริง
 * จึงคืน null ไม่ใช่ 0 เพื่อให้ตารางแสดงเป็นขีดกลางเหมือนเดิม
 */
function readNumber(raw: FormDataEntryValue | null): { value: number | null; error?: string } {
  const text = String(raw ?? "").trim();
  if (text === "") return { value: null };

  const n = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(n)) return { value: null, error: `"${text}" ไม่ใช่ตัวเลข` };
  if (n < 0) return { value: null, error: "คะแนนติดลบไม่ได้" };
  if (n > MAX_SCORE) return { value: null, error: `คะแนนเกิน ${MAX_SCORE} ไม่ได้ (กรอก ${n})` };

  // เก็บแค่ 4 ตำแหน่ง เท่ากับความละเอียดของไฟล์ Excel ต้นฉบับ
  return { value: Math.round(n * 10000) / 10000 };
}

/**
 * บันทึกคะแนนของทั้งส่วนงาน ในไตรมาสเดียว
 *
 * ฟอร์มส่งมาทีละไตรมาส เพราะคะแนนมาเป็นรอบไตรมาสอยู่แล้ว
 * และทำให้ไม่เผลอไปทับไตรมาสอื่นที่ไม่ได้ตั้งใจแก้
 */
export async function saveMouScores(
  _prev: MouScoreFormState,
  formData: FormData
): Promise<MouScoreFormState> {
  const user = await requireUser();
  if (!canManageMouScores(user)) {
    return { error: "คุณไม่มีสิทธิ์แก้คะแนนประเมิน เฉพาะส่วนกลางเท่านั้นที่ทำได้" };
  }

  const departmentId = String(formData.get("departmentId") ?? "");
  const quarter = Number(formData.get("quarter"));
  if (!departmentId) return { error: "ไม่พบส่วนงานที่จะบันทึก" };
  if (!MOU_QUARTERS.includes(quarter as (typeof MOU_QUARTERS)[number])) {
    return { error: "ไตรมาสไม่ถูกต้อง" };
  }

  const fiscalYear = await db.fiscalYear.findFirst({ where: { isActive: true } });
  if (!fiscalYear) return { error: "ยังไม่ได้ตั้งปีบัญชีที่ใช้งานอยู่" };

  // ดึงตัวชี้วัดของส่วนงานนี้มาก่อน แล้วรับเฉพาะ id ที่อยู่ในรายการนี้เท่านั้น
  // กันไม่ให้ยิงตรงมาแก้คะแนนของส่วนงานอื่นด้วยการปลอม indicatorId
  const indicators = await db.indicator.findMany({
    where: { fiscalYearId: fiscalYear.id, departmentId },
    select: { id: true, code: true, name: true },
  });
  if (indicators.length === 0) return { error: "ส่วนงานนี้ยังไม่มีตัวชี้วัดในปีบัญชีที่ใช้งานอยู่" };

  const existing = await db.mouScore.findMany({
    where: { quarter, indicatorId: { in: indicators.map((i) => i.id) } },
  });
  const before = new Map(existing.map((e) => [e.indicatorId, e]));

  type Change = {
    indicatorId: string;
    code: string;
    plan: number | null;
    actual: number | null;
    score: number | null;
    note: string | null;
  };
  const changes: Change[] = [];

  for (const ind of indicators) {
    const plan = readNumber(formData.get(`plan-${ind.id}`));
    const actual = readNumber(formData.get(`actual-${ind.id}`));
    const score = readNumber(formData.get(`score-${ind.id}`));

    const firstError = plan.error ?? actual.error ?? score.error;
    if (firstError) return { error: `ข้อ ${ind.code} ${ind.name}: ${firstError}` };

    const note = String(formData.get(`note-${ind.id}`) ?? "").trim() || null;
    const old = before.get(ind.id);

    const unchanged =
      old !== undefined &&
      old.plan === plan.value &&
      old.actual === actual.value &&
      old.score === score.value &&
      old.note === note;
    // ไม่มีของเดิม และกรอกมาว่างทั้งแถว = ไม่ต้องสร้างแถวเปล่าไว้ในฐานข้อมูล
    const emptyAndNew =
      old === undefined &&
      plan.value === null &&
      actual.value === null &&
      score.value === null &&
      note === null;

    if (unchanged || emptyAndNew) continue;

    changes.push({
      indicatorId: ind.id,
      code: ind.code,
      plan: plan.value,
      actual: actual.value,
      score: score.value,
      note,
    });
  }

  if (changes.length === 0) {
    return { error: null, savedAt: new Date().toISOString() };
  }

  try {
    await db.$transaction(
      changes.map((c) =>
        db.mouScore.upsert({
          where: { indicatorId_quarter: { indicatorId: c.indicatorId, quarter } },
          create: {
            indicatorId: c.indicatorId,
            quarter,
            plan: c.plan,
            actual: c.actual,
            score: c.score,
            note: c.note,
            updatedById: user.id,
          },
          update: {
            plan: c.plan,
            actual: c.actual,
            score: c.score,
            note: c.note,
            updatedById: user.id,
          },
        })
      )
    );
  } catch (error) {
    console.error("บันทึกคะแนนประเมินไม่สำเร็จ:", error);
    return { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  await writeAudit({
    userId: user.id,
    action: "MOU_SCORE_SAVE",
    entity: "MouScore",
    entityId: departmentId,
    detail: {
      quarter,
      // เก็บค่าก่อน-หลังของทุกข้อที่เปลี่ยน จะได้ตามย้อนหลังได้ว่าตัวเลขไหนถูกแก้
      changed: changes.map((c) => {
        const old = before.get(c.indicatorId);
        return {
          code: c.code,
          from: {
            plan: old?.plan ?? null,
            actual: old?.actual ?? null,
            score: old?.score ?? null,
            note: old?.note ?? null,
          },
          to: { plan: c.plan, actual: c.actual, score: c.score, note: c.note },
        };
      }),
    },
  });

  revalidatePath("/indicators");
  revalidatePath("/dashboard");

  return { error: null, savedAt: new Date().toISOString() };
}
