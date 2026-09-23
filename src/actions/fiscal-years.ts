"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageSystem } from "@/lib/permissions";
import { fiscalYearSchema, firstError } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import { bangkokDateToUtc, defaultSubmissionWindows } from "@/lib/datetime";

// ============================================================================
// Server Action สำหรับจัดการปีบัญชี (เฉพาะ ADMIN)
// ============================================================================
// ปีบัญชีคือ "กล่อง" ที่แยกข้อมูลของแต่ละปีออกจากกัน
// ตัวชี้วัด รายงานผล และช่วงเวลาเปิด-ปิด ทั้งหมดผูกกับปีบัญชีเสมอ
// เพิ่มปี 2570 แล้วข้อมูลปี 2569 จะยังอยู่ครบ ไม่ถูกทับ
// ============================================================================

export type FormState = { error: string | null; message?: string | null };

export async function createFiscalYearAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) {
    return { error: "คุณไม่มีสิทธิ์เพิ่มปีบัญชี เฉพาะส่วนกลางเท่านั้นที่ทำได้" };
  }

  const parsed = fiscalYearSchema.safeParse({
    year: formData.get("year") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const input = parsed.data;

  // ฟอร์มส่งวันที่มาเป็นเวลาไทย ต้องแปลงเป็น UTC ก่อนเก็บเสมอ
  // วันสิ้นสุดใช้ 23:59:59 เพื่อให้นับรวมทั้งวันสุดท้าย
  const startDate = bangkokDateToUtc(input.startDate);
  const endDate = bangkokDateToUtc(input.endDate, true);
  if (!startDate || !endDate) return { error: "รูปแบบวันที่ไม่ถูกต้อง" };

  try {
    await db.$transaction(async (tx) => {
      const created = await tx.fiscalYear.create({
        data: { year: input.year, startDate, endDate, isActive: false },
      });

      // สร้างช่วงเวลาเปิด-ปิดรับรายงานตั้งต้นให้ครบ 4 ไตรมาส
      // เป็นค่าคาดการณ์ ส่วนกลางแก้ให้ตรงปฏิทินจริงได้ภายหลังใน Phase 8
      await tx.submissionWindow.createMany({
        data: defaultSubmissionWindows(input.year).map((w) => ({
          fiscalYearId: created.id,
          ...w,
        })),
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: `ปีบัญชี ${input.year} มีอยู่ในระบบแล้ว` };
    }
    throw error;
  }

  await writeAudit({
    userId: actor.id,
    action: "FISCAL_YEAR_CREATE",
    entity: "FiscalYear",
    detail: { year: input.year },
  });

  revalidatePath("/admin/fiscal-years");
  return {
    error: null,
    message: `เพิ่มปีบัญชี ${input.year} แล้ว พร้อมช่วงเวลาเปิด-ปิด 4 ไตรมาส`,
  };
}

/**
 * สลับปีที่ระบบกำลังใช้งานอยู่
 *
 * ระบบต้องมีปีที่ใช้งานได้ทีละปีเดียว เพราะหน้าตัวชี้วัดและ Dashboard
 * ใช้ปีนี้เป็นตัวกรองหลัก ถ้ามีสองปีพร้อมกันข้อมูลจะปนกัน
 */
export async function activateFiscalYearAction(
  fiscalYearId: number,
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) {
    return { error: "คุณไม่มีสิทธิ์เปลี่ยนปีบัญชีที่ใช้งาน" };
  }

  const target = await db.fiscalYear.findUnique({ where: { id: fiscalYearId } });
  if (!target) return { error: "ไม่พบปีบัญชีนี้" };

  // ปิดปีอื่นและเปิดปีนี้ในคำสั่งชุดเดียวกัน
  // ถ้าแยกทำสองครั้งแล้วพังกลางทาง อาจเหลือระบบที่ไม่มีปีใช้งานเลย
  await db.$transaction([
    db.fiscalYear.updateMany({
      where: { isActive: true, id: { not: fiscalYearId } },
      data: { isActive: false },
    }),
    db.fiscalYear.update({ where: { id: fiscalYearId }, data: { isActive: true } }),
  ]);

  await writeAudit({
    userId: actor.id,
    action: "FISCAL_YEAR_ACTIVATE",
    entity: "FiscalYear",
    entityId: String(fiscalYearId),
    detail: { year: target.year },
  });

  revalidatePath("/admin/fiscal-years");
  revalidatePath("/indicators");
  revalidatePath("/dashboard");
  return { error: null, message: `เปลี่ยนมาใช้ปีบัญชี ${target.year} แล้ว` };
}

/**
 * คัดลอกตัวชี้วัดทั้งชุดจากปีหนึ่งไปอีกปีหนึ่ง (พร้อมเกณฑ์คะแนน 1-5)
 *
 * ปีถัดไปมักใช้ตัวชี้วัดชุดเดิมแล้วปรับตัวเลขเป้าหมาย การพิมพ์ใหม่ 301 รายการ
 * เสียเวลาและพลาดง่าย จึงคัดลอกมาก่อนแล้วค่อยแก้เฉพาะที่เปลี่ยน
 *
 * ตัวชี้วัดที่มีรหัสซ้ำกับที่มีอยู่แล้วในปีปลายทางจะถูกข้าม
 * ทำให้กดซ้ำได้โดยไม่เกิดข้อมูลซ้ำซ้อน
 */
export async function copyIndicatorsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) {
    return { error: "คุณไม่มีสิทธิ์คัดลอกตัวชี้วัด" };
  }

  const sourceId = Number(formData.get("sourceYearId") ?? "");
  const targetId = Number(formData.get("targetYearId") ?? "");
  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId)) {
    return { error: "กรุณาเลือกปีต้นทางและปีปลายทาง" };
  }
  if (sourceId === targetId) {
    return { error: "ปีต้นทางและปีปลายทางต้องไม่ใช่ปีเดียวกัน" };
  }

  const [source, target] = await Promise.all([
    db.fiscalYear.findUnique({ where: { id: sourceId }, select: { id: true, year: true } }),
    db.fiscalYear.findUnique({ where: { id: targetId }, select: { id: true, year: true } }),
  ]);
  if (!source || !target) return { error: "ไม่พบปีบัญชีที่เลือก" };

  const [sourceIndicators, existingInTarget] = await Promise.all([
    db.indicator.findMany({
      where: { fiscalYearId: sourceId, status: { not: "ARCHIVED" } },
      include: { criteria: { orderBy: { level: "asc" } } },
    }),
    db.indicator.findMany({
      where: { fiscalYearId: targetId },
      select: { departmentId: true, code: true },
    }),
  ]);

  if (sourceIndicators.length === 0) {
    return { error: `ปีบัญชี ${source.year} ยังไม่มีตัวชี้วัดให้คัดลอก` };
  }

  const alreadyThere = new Set(existingInTarget.map((i) => `${i.departmentId}|${i.code}`));
  const toCopy = sourceIndicators.filter(
    (i) => !alreadyThere.has(`${i.departmentId}|${i.code}`)
  );
  if (toCopy.length === 0) {
    return {
      error: `ตัวชี้วัดทุกรายการมีอยู่ในปีบัญชี ${target.year} แล้ว ไม่มีอะไรต้องคัดลอก`,
    };
  }

  // สร้าง id เองล่วงหน้า เพื่อให้ใส่ตัวชี้วัดและเกณฑ์คะแนนได้ด้วยคำสั่งชุดเดียว
  // ถ้าวนสร้างทีละรายการ 301 ครั้ง จะช้ามากเพราะต้องคุยกับฐานข้อมูลทุกครั้ง
  const newIndicators = toCopy.map((ind) => ({ id: randomUUID(), source: ind }));

  await db.$transaction([
    db.indicator.createMany({
      data: newIndicators.map(({ id, source: ind }) => ({
        id,
        fiscalYearId: targetId,
        departmentId: ind.departmentId,
        code: ind.code,
        name: ind.name,
        description: ind.description,
        dimension: ind.dimension,
        groupName: ind.groupName,
        unit: ind.unit,
        targetValue: ind.targetValue,
        targetText: ind.targetText,
        conditions: ind.conditions,
        baselineValue: ind.baselineValue,
        weight: ind.weight,
        direction: ind.direction,
        adjustmentNote: ind.adjustmentNote,
        status: ind.status,
      })),
    }),
    db.scoreCriteria.createMany({
      data: newIndicators.flatMap(({ id, source: ind }) =>
        ind.criteria.map((c) => ({
          indicatorId: id,
          level: c.level,
          description: c.description,
          targetValue: c.targetValue,
          minValue: c.minValue,
          maxValue: c.maxValue,
        }))
      ),
    }),
  ]);

  await writeAudit({
    userId: actor.id,
    action: "INDICATOR_COPY_YEAR",
    entity: "FiscalYear",
    entityId: String(targetId),
    detail: { from: source.year, to: target.year, copied: toCopy.length },
  });

  revalidatePath("/admin/fiscal-years");
  revalidatePath("/indicators");
  revalidatePath("/dashboard");

  const skipped = sourceIndicators.length - toCopy.length;
  return {
    error: null,
    message:
      `คัดลอกตัวชี้วัด ${toCopy.length.toLocaleString("th-TH")} รายการ ` +
      `จากปี ${source.year} ไปปี ${target.year} แล้ว` +
      (skipped > 0 ? ` (ข้าม ${skipped.toLocaleString("th-TH")} รายการที่มีอยู่แล้ว)` : ""),
  };
}
