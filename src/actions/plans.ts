"use server";

import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import type { PlanSection, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManagePlan } from "@/lib/permissions";
import {
  planHeaderSchema,
  planLevelReportText,
  planRowSchema,
  planNumber,
  firstError,
} from "@/lib/validation";
import { MONTH_COUNT, PLAN_SECTION_ITEM_LABEL } from "@/lib/plan";
import { writeAudit } from "@/lib/audit";

// ============================================================================
// Server Action สำหรับแผนดำเนินงาน (แบบฟอร์มเอกสารแนบ 4)
// ============================================================================
// แบบฟอร์มนี้เป็นตารางทั้งหน้า ไม่ใช่ฟอร์มทีละกิจกรรมเหมือนเดิม
// คนกรอกจะไล่พิมพ์ตัวเลขทั้งตารางแล้วค่อยกดบันทึกครั้งเดียว
// ทั้งหน้าจึงเป็นฟอร์มเดียวและมี Action เดียวที่รับทุกอย่าง
//
// ปุ่มต่าง ๆ แยกกันด้วยช่อง intent:
//   save               บันทึกทั้งตาราง
//   add:TARGET         บันทึกทั้งตาราง แล้วเพิ่มบรรทัดว่างต่อท้ายตารางเป้าหมาย
//   add:STEP:<ระดับ>   บันทึกทั้งตาราง แล้วเพิ่มขั้นตอนต่อท้ายค่าเกณฑ์ระดับนั้น
//   delete:<rowId>     บันทึกทั้งตาราง แล้วลบบรรทัดนั้น
//
// ตารางขั้นตอนการดำเนินงานแบ่งตามค่าเกณฑ์ระดับ 1-5 ของตัวชี้วัด
// ระดับเป็นของตายตัวจาก MOU แก้จากหน้านี้ไม่ได้ เพิ่มได้แค่ขั้นตอนใต้แต่ละระดับ
// และมีช่อง "รายงานผลการดำเนินงาน" ของแต่ละระดับ (ตาราง PlanLevelReport)
// ทุก intent บันทึกก่อนเสมอ คนกรอกจึงไม่เสียสิ่งที่พิมพ์ค้างไว้เมื่อกดเพิ่ม/ลบ
//
// ตรวจสิทธิ์ 2 ชั้นเหมือนเดิม: login แล้วหรือยัง และแก้แผนของส่วนงานนี้ได้ไหม
// ไม่พึ่งการซ่อนปุ่ม เพราะ Server Action ถูกเรียกตรงได้โดยไม่ผ่านหน้าเว็บ
// ============================================================================

export type FormState = {
  error: string | null;
  success?: boolean;
  message?: string;
};

/** อ่านช่องตัวเลขรายเดือน 12 ช่องของแถวหนึ่ง (`p0_<id>` = แผนเดือนแรก) */
function readMonths(formData: FormData, prefix: string, rowId: string) {
  const months: (number | null)[] = [];
  for (let i = 0; i < MONTH_COUNT; i++) {
    const raw = formData.get(`${prefix}${i}_${rowId}`);
    const parsed = planNumber.safeParse(typeof raw === "string" ? raw : "");
    if (!parsed.success) return null;
    months.push(parsed.data);
  }
  return months;
}

/**
 * บันทึกทั้งแบบฟอร์ม
 *
 * รายชื่อแถวที่จะบันทึกอ่านจากฐานข้อมูล ไม่ได้อ่านจากฟอร์ม
 * เบราว์เซอร์จึงแอบเติม id ของแถวที่เป็นของตัวชี้วัดอื่นเข้ามาไม่ได้
 */
export async function savePlanAction(
  indicatorId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    select: {
      id: true,
      departmentId: true,
      code: true,
      criteria: { select: { level: true }, orderBy: { level: "asc" } },
    },
  });
  if (!indicator) return { error: "ไม่พบตัวชี้วัดนี้" };

  if (!canManagePlan(user, indicator.departmentId)) {
    return { error: "คุณไม่มีสิทธิ์แก้ไขแผนของส่วนงานนี้" };
  }

  const intent = String(formData.get("intent") ?? "save");

  // ---- ส่วนหัวของแบบฟอร์ม ----
  const header = planHeaderSchema.safeParse({
    owner: formData.get("owner") ?? "",
    budget: formData.get("budget") ?? "",
  });
  if (!header.success) return { error: firstError(header.error) };

  // ---- ทุกบรรทัดในตาราง ----
  const rows = await db.actionPlan.findMany({
    where: { indicatorId },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
    select: { id: true, section: true, sortOrder: true, criteriaLevel: true },
  });
  const levels = indicator.criteria.map((c) => c.level);

  /** แถวที่อยู่กลุ่มเดียวกัน (ตารางเดียวกันและระดับเดียวกัน) ใช้ไล่เลขลำดับ */
  const sameGroup =
    (a: { section: PlanSection; criteriaLevel: number | null }) =>
    (b: { section: PlanSection; criteriaLevel: number | null }) =>
      a.section === b.section && a.criteriaLevel === b.criteriaLevel;

  const updates: Prisma.PrismaPromise<unknown>[] = [];

  for (const row of rows) {
    // แถวที่ไม่ได้ถูกส่งมาในฟอร์มถือว่าไม่ได้แก้ ปล่อยไว้ตามเดิม
    if (formData.get(`title_${row.id}`) === null) continue;

    const parsed = planRowSchema.safeParse({
      title: formData.get(`title_${row.id}`) ?? "",
      targetValue: formData.get(`target_${row.id}`) ?? "",
      unit: formData.get(`unit_${row.id}`) ?? "",
      causeNote: formData.get(`cause_${row.id}`) ?? "",
      correctiveAction: formData.get(`fix_${row.id}`) ?? "",
    });
    if (!parsed.success) {
      const label = PLAN_SECTION_ITEM_LABEL[row.section];
      return {
        error: `${label}ลำดับ ${row.sortOrder}: ${firstError(parsed.error)}`,
      };
    }

    const planMonths = readMonths(formData, "p", row.id);
    const actualMonths = readMonths(formData, "a", row.id);
    if (!planMonths || !actualMonths) {
      const label = PLAN_SECTION_ITEM_LABEL[row.section];
      return {
        error: `${label}ลำดับ ${row.sortOrder}: ช่องตัวเลขรายเดือนกรอกได้เฉพาะตัวเลข`,
      };
    }

    updates.push(
      db.actionPlan.update({
        where: { id: row.id },
        data: { ...parsed.data, planMonths, actualMonths },
      }),
    );
  }

  // ---- รายงานผลการดำเนินงานของแต่ละระดับ ----
  // ไล่จากระดับที่ตัวชี้วัดมีจริง ไม่เชื่อว่าฟอร์มส่งระดับอะไรมา
  for (const level of levels) {
    const raw = formData.get(`levelReport_${level}`);
    if (raw === null) continue;
    const parsed = planLevelReportText.safeParse(raw);
    if (!parsed.success)
      return { error: `ระดับ ${level}: ${firstError(parsed.error)}` };

    updates.push(
      parsed.data === null
        ? db.planLevelReport.deleteMany({ where: { indicatorId, level } })
        : db.planLevelReport.upsert({
            where: { indicatorId_level: { indicatorId, level } },
            create: { indicatorId, level, text: parsed.data },
            update: { text: parsed.data },
          }),
    );
  }

  // เขียนทั้งหมดในธุรกรรมเดียว ถ้าแถวใดพังจะไม่เหลือตารางที่บันทึกไปครึ่งเดียว
  await db.$transaction([
    db.planHeader.upsert({
      where: { indicatorId },
      create: { indicatorId, ...header.data },
      update: header.data,
    }),
    ...updates,
  ]);

  let message = "บันทึกแผนเรียบร้อยแล้ว";

  // ---- เพิ่มบรรทัดใหม่ ----
  if (intent.startsWith("add:")) {
    const [, section, levelText] = intent.split(":");
    let criteriaLevel: number | null = null;
    if (section === "STEP") {
      criteriaLevel = Number(levelText);
      if (!levels.includes(criteriaLevel))
        return { error: "ไม่พบค่าเกณฑ์ระดับที่จะเพิ่มขั้นตอน" };
    } else if (section !== "TARGET") {
      return { error: "ไม่รู้จักตารางที่จะเพิ่มบรรทัด" };
    }

    const last = rows
      .filter(sameGroup({ section: section as PlanSection, criteriaLevel }))
      .at(-1);
    await db.actionPlan.create({
      data: {
        indicatorId,
        section: section as PlanSection,
        criteriaLevel,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        title: "",
        planMonths: Array(MONTH_COUNT).fill(null),
        actualMonths: Array(MONTH_COUNT).fill(null),
      },
    });
    message =
      criteriaLevel === null
        ? `เพิ่ม${PLAN_SECTION_ITEM_LABEL[section as PlanSection]}บรรทัดใหม่แล้ว`
        : `เพิ่มขั้นตอนการดำเนินงานของระดับ ${criteriaLevel} แล้ว`;
  }

  // ---- ลบบรรทัด ----
  if (intent.startsWith("delete:")) {
    const rowId = intent.slice(7);
    const target = rows.find((r) => r.id === rowId);
    if (!target) return { error: "ไม่พบบรรทัดที่จะลบ" };

    // ไฟล์หลักฐานของบรรทัดนี้ ข้อมูลในฐานข้อมูลลบตามไปเอง (cascade)
    // แต่ตัวไฟล์บน Blob ไม่ลบตาม จึงต้องลบเอง ไม่งั้นจะค้างอยู่โดยไม่มีใครเข้าถึงได้
    const files = await db.planAttachment.findMany({
      where: { actionPlanId: rowId },
      select: { storagePath: true },
    });
    await db.actionPlan.delete({ where: { id: rowId } });
    for (const f of files) {
      await del(f.storagePath).catch((error) =>
        console.error("ลบไฟล์บน Blob ไม่สำเร็จ:", error),
      );
    }

    // ไล่เลขลำดับใหม่ให้ต่อกัน ไม่งั้นจะเห็นเป็น 1, 2, 4 หลังลบ
    const rest = rows.filter((r) => sameGroup(target)(r) && r.id !== rowId);
    await db.$transaction(
      rest.map((r, i) =>
        db.actionPlan.update({
          where: { id: r.id },
          data: { sortOrder: i + 1 },
        }),
      ),
    );

    message = "ลบบรรทัดแล้ว";
  }

  await writeAudit({
    userId: user.id,
    action: "PLAN_SAVE",
    entity: "ActionPlan",
    entityId: indicatorId,
    detail: { indicatorCode: indicator.code, intent, rows: updates.length },
  });

  revalidatePath("/reports");
  revalidatePath(`/plans/${indicatorId}`);
  // แผนแสดงในหน้ารายงานผลรายไตรมาสด้วย
  revalidatePath("/reports/[indicatorId]/[quarter]", "page");
  revalidatePath(`/indicators/${indicatorId}`);
  return { error: null, success: true, message };
}
