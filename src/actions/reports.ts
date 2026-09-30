"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canSubmitReport } from "@/lib/permissions";
import { reportSchema, firstError } from "@/lib/validation";
import { calcProgressPct, calcScoreLevel } from "@/lib/scoring";
import { writeAudit, diffFields } from "@/lib/audit";
import { getWindowStatus } from "@/lib/submission-window";

// ============================================================================
// Server Action สำหรับรายงานผลรายไตรมาส (ข้อ 4, 5)
// ============================================================================
// ส่วนงานกรอกผลงานจริงเอง ระบบคำนวณ % ความก้าวหน้าและคะแนน 1-5 ให้อัตโนมัติ
// แล้วเก็บค่าที่คำนวณได้ลงฐานข้อมูล เพื่อให้ Dashboard ดึงไปสรุปได้เร็ว
// โดยไม่ต้องคำนวณใหม่ทุกครั้งที่เปิดหน้า
//
// ระบบอ่านตัวเลขจากไฟล์แนบเองไม่ได้ (เป็น PDF/Word/สแกน)
// ไฟล์แนบจึงเป็นแค่หลักฐานประกอบ ตัวเลขต้องมาจากที่ส่วนงานกรอก
// ============================================================================

export type FormState = { error: string | null; success?: boolean };

/**
 * รายงานของไตรมาสล่าสุดก่อนหน้า `quarter` ที่มีการกรอกไว้
 * ใช้ยกข้อมูลไปเป็นค่าตั้งต้นของไตรมาสใหม่ ผู้กรอกจะได้แก้ต่อจากของเดิม ไม่ต้องพิมพ์ใหม่ทั้งหมด
 */
async function previousReport(indicatorId: string, quarter: number) {
  return db.quarterlyReport.findFirst({
    where: { indicatorId, quarter: { lt: quarter } },
    orderBy: { quarter: "desc" },
    include: { criteriaProgress: { select: { level: true, text: true } } },
  });
}

export async function saveReportAction(
  indicatorId: string,
  quarter: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();

  if (![1, 2, 3, 4].includes(quarter)) return { error: "ไตรมาสไม่ถูกต้อง" };

  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    include: { criteria: { orderBy: { level: "asc" } } },
  });
  if (!indicator) return { error: "ไม่พบตัวชี้วัดนี้" };

  if (!canSubmitReport(user, indicator.departmentId)) {
    return { error: "คุณไม่มีสิทธิ์กรอกผลการดำเนินงานของส่วนงานนี้" };
  }

  // ตรวจช่วงเวลาเปิด-ปิดก่อนบันทึกเสมอ (ข้อ 9)
  // ตรวจที่นี่ ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ เพราะ Server Action ถูกเรียกตรงได้
  const window = await getWindowStatus({
    fiscalYearId: indicator.fiscalYearId,
    quarter,
    departmentId: indicator.departmentId,
    actor: user,
  });
  if (!window.canWrite) {
    return { error: `บันทึกไม่ได้ — ${window.message}` };
  }

  // ขั้นตอนแรกต้องกรอกแผนดำเนินงานและกด "ยืนยันแผน" ก่อน จึงรายงานผลรายไตรมาสได้
  // ส่วนกลางข้ามได้ เพราะต้องแก้ข้อมูลให้ส่วนงานได้ทุกกรณี
  if (user.role !== "ADMIN") {
    const planHeader = await db.planHeader.findUnique({
      where: { indicatorId },
      select: { confirmedAt: true },
    });
    if (!planHeader?.confirmedAt) {
      return { error: "กรุณากรอกแผนดำเนินงานและกดยืนยันแผนก่อน จึงจะรายงานผลรายไตรมาสได้" };
    }
  }

  const parsed = reportSchema.safeParse({
    intent: formData.get("intent") ?? "draft",
    actualValue: formData.get("actualValue") ?? "",
    scoreOverride: formData.get("scoreOverride") ?? "",
    scoreNote: formData.get("scoreNote") ?? "",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const input = parsed.data;

  // คำนวณจากตัวเลขที่กรอก โดยดู "ทิศทาง" ของตัวชี้วัดเสมอ
  const progressPct = calcProgressPct(
    input.actualValue,
    indicator.targetValue,
    indicator.direction
  );
  const autoScore = calcScoreLevel(input.actualValue, indicator.criteria, indicator.direction);

  // ถ้าผู้ประเมินปรับคะแนนด้วยมือ ให้ใช้ค่าที่ปรับ แต่ยังจำไว้ว่าปรับมา
  const overridden = input.scoreOverride !== null;
  const scoreLevel = overridden ? input.scoreOverride : autoScore;

  const existing = await db.quarterlyReport.findUnique({
    where: { indicatorId_quarter: { indicatorId, quarter } },
  });

  const submitting = input.intent === "submit";

  const data = {
    actualValue: input.actualValue,
    progressPct,
    scoreLevel,
    scoreOverridden: overridden,
    scoreNote: input.scoreNote,
    status: submitting ? ("SUBMITTED" as const) : ("DRAFT" as const),
    submittedAt: submitting ? new Date() : null,
    submittedById: submitting ? user.id : null,
  };

  // ช่องปัญหาอุปสรรค ปัจจัย และผลรายค่าเกณฑ์ ถูกเอาออกจากฟอร์มแล้ว (17 ก.ย. 2569)
  // ไม่เขียนทับคอลัมน์และตาราง CriteriaProgress เดิม ข้อมูลที่เคยกรอกจึงไม่หาย
  if (existing) {
    await db.quarterlyReport.update({ where: { id: existing.id }, data });
  } else {
    // รายงานไตรมาสใหม่ ยกข้อมูลทั้งหมดของไตรมาสก่อนหน้ามาด้วย
    // (ช่องที่อยู่ในฟอร์มยกไปตั้งแต่ตอนเปิดหน้าแล้ว ตรงนี้ยกช่องที่ไม่อยู่ในฟอร์ม)
    const previous = await previousReport(indicatorId, quarter);
    await db.quarterlyReport.create({
      data: {
        indicatorId,
        quarter,
        ...data,
        ...(previous
          ? {
              narrative: previous.narrative,
              responsible: previous.responsible,
              objective: previous.objective,
              keyProjects: previous.keyProjects,
              problems: previous.problems,
              supportFactors: previous.supportFactors,
              obstacleFactors: previous.obstacleFactors,
              criteriaProgress: {
                create: previous.criteriaProgress.map((c) => ({ level: c.level, text: c.text })),
              },
            }
          : {}),
      },
    });
  }

  await writeAudit({
    userId: user.id,
    action: submitting ? "REPORT_SUBMIT" : "REPORT_SAVE_DRAFT",
    entity: "QuarterlyReport",
    entityId: existing?.id ?? null,
    detail: existing
      ? diffFields(
          {
            actualValue: existing.actualValue,
            scoreLevel: existing.scoreLevel,
            status: existing.status,
          },
          { actualValue: input.actualValue, scoreLevel, status: data.status }
        )
      : {
          indicatorCode: indicator.code,
          quarter,
          actualValue: input.actualValue,
          scoreLevel,
        },
  });

  revalidatePath("/reports");
  revalidatePath(`/reports/${indicatorId}/${quarter}`);
  revalidatePath(`/indicators/${indicatorId}`);
  revalidatePath("/dashboard");
  return { error: null, success: true };
}

/**
 * ดึงรายงานกลับมาแก้ไข (จากส่งแล้วเป็นร่าง)
 *
 * ไม่มีขั้นตอนอนุมัติในระบบนี้ การส่งจึงไม่ใช่การล็อกถาวร
 * แต่ต้องกดปุ่มนี้ก่อนแก้ เพื่อให้เห็นชัดว่ากำลังแก้ของที่ส่งไปแล้ว
 */
export async function reopenReportAction(
  indicatorId: string,
  quarter: number,
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const user = await requireUser();

  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    select: { id: true, departmentId: true, code: true, fiscalYearId: true },
  });
  if (!indicator) return { error: "ไม่พบตัวชี้วัดนี้" };

  if (!canSubmitReport(user, indicator.departmentId)) {
    return { error: "คุณไม่มีสิทธิ์แก้ไขผลการดำเนินงานของส่วนงานนี้" };
  }

  const window = await getWindowStatus({
    fiscalYearId: indicator.fiscalYearId,
    quarter,
    departmentId: indicator.departmentId,
    actor: user,
  });
  if (!window.canWrite) {
    return { error: `ดึงกลับมาแก้ไม่ได้ — ${window.message}` };
  }

  const existing = await db.quarterlyReport.findUnique({
    where: { indicatorId_quarter: { indicatorId, quarter } },
  });
  if (!existing) return { error: "ยังไม่มีรายงานของไตรมาสนี้" };
  if (existing.status !== "SUBMITTED") return { error: "รายงานนี้เป็นร่างอยู่แล้ว" };

  await db.quarterlyReport.update({
    where: { id: existing.id },
    data: { status: "DRAFT", submittedAt: null, submittedById: null },
  });

  await writeAudit({
    userId: user.id,
    action: "REPORT_REOPEN",
    entity: "QuarterlyReport",
    entityId: existing.id,
    detail: { indicatorCode: indicator.code, quarter },
  });

  revalidatePath("/reports");
  revalidatePath(`/reports/${indicatorId}/${quarter}`);
  revalidatePath("/dashboard");
  return { error: null, success: true };
}
