"use server";

import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import type { PlanSection, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  canManagePlan,
  canReturnSubmission,
  canSendForDepartment,
} from "@/lib/permissions";
import { notifyDepartmentUsers } from "@/lib/notifications";
import {
  planHeaderSchema,
  planLevelReportText,
  planRowSchema,
  planNumber,
  firstError,
} from "@/lib/validation";
import {
  MONTH_COUNT,
  PLAN_SECTION_ITEM_LABEL,
  formatPlanNumber,
  isPlanComplete,
  planLevelGroups,
  planRowLabel,
  sumMonths,
  targetMismatch,
  toMonths,
} from "@/lib/plan";
import { getQuarterStatuses, monthLocks } from "@/lib/submission-window";
import { writeAudit } from "@/lib/audit";

// ============================================================================
// Server Action สำหรับแผนดำเนินงาน (แบบฟอร์มเอกสารแนบ 4)
// ============================================================================
// แบบฟอร์มนี้เป็นตารางทั้งหน้า ไม่ใช่ฟอร์มทีละกิจกรรมเหมือนเดิม
// คนกรอกจะไล่พิมพ์ตัวเลขทั้งตารางแล้วค่อยกดบันทึกครั้งเดียว
// ทั้งหน้าจึงเป็นฟอร์มเดียวและมี Action เดียวที่รับทุกอย่าง
//
// ฟอร์มนี้ใช้สองหน้า แยกกันด้วยช่อง mode:
//   plan    หน้าแผนดำเนินงาน (/plans/[id]) ส่วนหัว + โครงแผน + แผนรายเดือน
//   report  หน้ารายงานผล ผลรายเดือน สาเหตุ แนวทางแก้ไข และรายงานผลรายระดับ (ต้องส่งแผนก่อน)
//
// ปุ่มต่าง ๆ แยกกันด้วยช่อง intent:
//   save               บันทึกทั้งตาราง (หน้าแผนเรียกว่า "บันทึกร่างแผน")
//   add:TARGET         บันทึกทั้งตาราง แล้วเพิ่มบรรทัดว่างต่อท้ายตารางเป้าหมาย
//   add:STEP:<ระดับ>   บันทึกทั้งตาราง แล้วเพิ่มขั้นตอนต่อท้ายค่าเกณฑ์ระดับนั้น
//   delete:<rowId>     บันทึกทั้งตาราง แล้วลบบรรทัดนั้น
//   confirm            บันทึกทั้งตาราง แล้ว "ส่งแผน" (ล็อกโครงแผน เปิดให้รายงานผลได้) - หัวหน้าส่วนงาน/ส่วนกลาง
//   unlock             บันทึกทั้งตาราง แล้ว "ตีกลับแผน" พร้อมเหตุผล (returnNote) และแจ้งเตือนหัวหน้าส่วนงาน - ส่วนกลาง
//
// ส่งแผนแล้ว ผู้รับผิดชอบส่วนงานแก้ "โครงแผน" ไม่ได้อีก: แผนรายเดือน เป้าหมายตัวชี้วัด
// ค่าเป้าหมาย หน่วยนับ ขั้นตอนการดำเนินงาน และเพิ่ม/ลบบรรทัดไม่ได้
// ยังกรอกผลรายเดือน สาเหตุ แนวทางแก้ไข หลักฐาน และรายงานผลรายระดับได้ตามปกติ
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

/** เดือนที่ล็อกใช้ค่าเดิมในฐานข้อมูล เดือนที่แก้ได้ใช้ค่าจากฟอร์ม */
function keepLocked(
  submitted: (number | null)[],
  saved: (number | null)[],
  locked: boolean[],
) {
  return submitted.map((v, i) => (locked[i] ? saved[i] : v));
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
      fiscalYearId: true,
      code: true,
      name: true,
      criteria: { select: { level: true }, orderBy: { level: "asc" } },
    },
  });
  if (!indicator) return { error: "ไม่พบตัวชี้วัดนี้" };

  if (!canManagePlan(user, indicator.departmentId)) {
    return { error: "คุณไม่มีสิทธิ์แก้ไขแผนของส่วนงานนี้" };
  }

  const intent = String(formData.get("intent") ?? "save");
  const isAdmin = user.role === "ADMIN";

  const planHeader = await db.planHeader.findUnique({
    where: { indicatorId },
    select: { confirmedAt: true },
  });
  // ส่งแผนแล้ว โครงแผนล็อกสำหรับผู้รับผิดชอบส่วนงาน (ส่วนกลางแก้ได้เสมอ)
  const structureLocked = planHeader?.confirmedAt != null && !isAdmin;
  if (structureLocked && (intent.startsWith("add:") || intent.startsWith("delete:"))) {
    return { error: "ส่งแผนแล้ว เพิ่มหรือลบบรรทัดไม่ได้ ติดต่อส่วนกลางหากต้องแก้แผน" };
  }
  // ส่งแผน = หัวหน้าส่วนงาน/หน่วยงาน (หรือส่วนกลาง) เท่านั้น ผู้รายงานบันทึกร่างได้อย่างเดียว
  if (intent === "confirm" && !canSendForDepartment(user, indicator.departmentId)) {
    return {
      error: "ผู้กดส่งแผนการดำเนินงานต้องเป็นหัวหน้าส่วนงาน/หัวหน้าหน่วยงาน · บันทึกร่างแผนไว้แล้วแจ้งหัวหน้าให้กดส่ง",
    };
  }
  // ตีกลับแผน (intent "unlock") = ส่วนกลางเท่านั้น และต้องบอกเหตุผล
  const returnNote = String(formData.get("returnNote") ?? "").trim().slice(0, 2000);
  if (intent === "unlock") {
    if (!canReturnSubmission(user)) {
      return { error: "เฉพาะส่วนกลางเท่านั้นที่ตีกลับแผนได้" };
    }
    if (returnNote === "") return { error: "กรุณาระบุเหตุผลที่ตีกลับแผน" };
  }

  // หน้าแผน (mode=plan) ส่งเฉพาะส่วนหัวและโครงแผน
  // หน้ารายงานผล (mode=report) ส่งเฉพาะผลรายเดือน สาเหตุ แนวทางแก้ไข และรายงานรายระดับ
  // ช่องที่ไม่ถูกส่งมาคงค่าเดิมไว้ ไม่ถูกล้างเป็นค่าว่าง
  const isReportMode = formData.get("mode") === "report";
  const confirmed = planHeader?.confirmedAt != null;
  // ต้องส่งแผนก่อน จึงรายงานผลได้ (ส่วนกลางข้ามได้)
  const resultsLocked = !confirmed && !isAdmin;
  if (isReportMode && resultsLocked) {
    return { error: "กรุณากรอกแผนดำเนินงานและกดส่งแผนก่อน จึงจะรายงานผลได้" };
  }

  // ---- ส่วนหัวของแบบฟอร์ม (เฉพาะหน้าแผน) ----
  const hasHeader = formData.has("owner");
  const header = planHeaderSchema.safeParse({
    owner: formData.get("owner") ?? "",
    budget: formData.get("budget") ?? "",
  });
  if (!header.success) return { error: firstError(header.error) };

  // ---- ทุกบรรทัดในตาราง ----
  const rows = await db.actionPlan.findMany({
    where: { indicatorId },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      section: true,
      sortOrder: true,
      criteriaLevel: true,
      title: true,
      targetValue: true,
      unit: true,
      planMonths: true,
      actualMonths: true,
    },
  });
  // ระดับ 1-5 ตามค่าเกณฑ์ + กลุ่มเงื่อนไขอื่นๆ ต่อท้าย
  const groups = planLevelGroups(
    indicator.criteria.map((c) => ({ level: c.level, targetValue: null, description: null })),
    "",
    [],
  );
  const levels = groups.map((g) => g.level);
  const groupName = (level: number) =>
    groups.find((g) => g.level === level)?.shortTitle ?? `ระดับ ${level}`;

  // เดือนของไตรมาสที่ผ่านไปแล้ว (และช่องผลของไตรมาสข้างหน้า) ล็อกไว้
  // ค่าที่ฟอร์มส่งมาสำหรับเดือนที่ล็อกถูกทิ้ง แล้วใช้ค่าเดิมในฐานข้อมูลแทนเสมอ
  // กันคนที่แก้ readOnly ในเบราว์เซอร์ออกแล้วส่งค่ามาเอง
  const locks = monthLocks(
    await getQuarterStatuses({
      fiscalYearId: indicator.fiscalYearId,
      departmentId: indicator.departmentId,
      actor: user,
    }),
  );

  /** แถวที่อยู่กลุ่มเดียวกัน (ตารางเดียวกันและระดับเดียวกัน) ใช้ไล่เลขลำดับ */
  const sameGroup =
    (a: { section: PlanSection; criteriaLevel: number | null }) =>
    (b: { section: PlanSection; criteriaLevel: number | null }) =>
      a.section === b.section && a.criteriaLevel === b.criteriaLevel;

  const updates: Prisma.PrismaPromise<unknown>[] = [];
  /** รายการที่ค่าเป้าหมายไม่ตรงกับรวมแผนทั้งปี - มีแม้แต่รายการเดียวก็ไม่บันทึกทั้งตาราง */
  const mismatches: string[] = [];

  for (const row of rows) {
    // โครงแผนส่งมาจากหน้าแผน ผลส่งมาจากหน้ารายงานผล ส่วนที่ไม่ถูกส่งมาปล่อยไว้ตามเดิม
    const hasStructure = formData.has(`title_${row.id}`) && !structureLocked;
    const hasResult = formData.has(`a0_${row.id}`) && !resultsLocked;
    if (!hasStructure && !hasResult) continue;

    const label = PLAN_SECTION_ITEM_LABEL[row.section];
    const parsed = planRowSchema.safeParse({
      title: formData.get(`title_${row.id}`) ?? "",
      targetValue: formData.get(`target_${row.id}`) ?? "",
      unit: formData.get(`unit_${row.id}`) ?? "",
      causeNote: formData.get(`cause_${row.id}`) ?? "",
      correctiveAction: formData.get(`fix_${row.id}`) ?? "",
    });
    if (!parsed.success) {
      return {
        error: `${label}ลำดับ ${row.sortOrder}: ${firstError(parsed.error)}`,
      };
    }

    const data: Prisma.ActionPlanUpdateInput = {};

    if (hasStructure) {
      const planMonths = readMonths(formData, "p", row.id);
      if (!planMonths) {
        return {
          error: `${label}ลำดับ ${row.sortOrder}: ช่องตัวเลขรายเดือนกรอกได้เฉพาะตัวเลข`,
        };
      }
      data.title = parsed.data.title;
      data.targetValue = parsed.data.targetValue;
      data.unit = parsed.data.unit;
      const finalMonths = keepLocked(planMonths, toMonths(row.planMonths), locks.plan);
      data.planMonths = finalMonths;
      if (targetMismatch(parsed.data.targetValue, finalMonths)) {
        mismatches.push(
          `${label}ลำดับ ${planRowLabel(row)}: ค่าเป้าหมาย ${formatPlanNumber(parsed.data.targetValue)} แต่รวมแผนทั้งปี ${formatPlanNumber(sumMonths(finalMonths)) || "0"}`,
        );
      }
    }

    if (hasResult) {
      const actualMonths = readMonths(formData, "a", row.id);
      if (!actualMonths) {
        return {
          error: `${label}ลำดับ ${row.sortOrder}: ช่องตัวเลขรายเดือนกรอกได้เฉพาะตัวเลข`,
        };
      }
      data.actualMonths = keepLocked(actualMonths, toMonths(row.actualMonths), locks.actual);
      data.causeNote = parsed.data.causeNote;
      data.correctiveAction = parsed.data.correctiveAction;
    }

    updates.push(db.actionPlan.update({ where: { id: row.id }, data }));
  }

  // ค่าเป้าหมายต้องเท่ากับรวมแผนทั้งปี ไม่งั้นไม่บันทึกอะไรเลย (หน้าเว็บเด้งเตือนก่อนแล้ว นี่คือด่านจริง)
  // ยกเว้นส่วนกลางกดปลดล็อกแผน เพื่อให้ส่วนงานกลับไปแก้แผนที่ไม่ตรงได้
  if (mismatches.length > 0 && intent !== "unlock") {
    return {
      error: `บันทึกแผนไม่ได้ ค่าเป้าหมายไม่ตรงกับรวมแผนทั้งปี: ${mismatches.join(" · ")}`,
    };
  }

  // ---- รายงานผลการดำเนินงานของแต่ละระดับ (เฉพาะหน้ารายงานผล) ----
  // ไล่จากระดับที่ตัวชี้วัดมีจริง ไม่เชื่อว่าฟอร์มส่งระดับอะไรมา
  for (const level of resultsLocked ? [] : levels) {
    const raw = formData.get(`levelReport_${level}`);
    if (raw === null) continue;
    const parsed = planLevelReportText.safeParse(raw);
    if (!parsed.success)
      return { error: `${groupName(level)}: ${firstError(parsed.error)}` };

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
  // ยืนยัน/ปลดล็อกต้องมีแถวส่วนหัวอยู่แล้ว จึงสร้างให้เสมอถ้ายังไม่มี (ค่าว่าง)
  await db.$transaction([
    db.planHeader.upsert({
      where: { indicatorId },
      create: { indicatorId, ...(hasHeader ? header.data : {}) },
      update: hasHeader ? header.data : {},
    }),
    ...updates,
  ]);

  let message = isReportMode
    ? "บันทึกผลการดำเนินงานเรียบร้อยแล้ว"
    : confirmed
      ? "บันทึกแผนเรียบร้อยแล้ว"
      : "บันทึกร่างแผนเรียบร้อยแล้ว ยังแก้ไขต่อได้ · กดส่งแผนเมื่อกรอกครบ";

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
        : `เพิ่มขั้นตอนการดำเนินงานของ${groupName(criteriaLevel)}แล้ว`;
  }

  // ---- ลบบรรทัด ----
  if (intent.startsWith("delete:")) {
    const rowId = intent.slice(7);
    const target = rows.find((r) => r.id === rowId);
    if (!target) return { error: "ไม่พบบรรทัดที่จะลบ" };

    // ลบบรรทัดที่มีตัวเลขอยู่ในเดือนที่ล็อกไม่ได้ ไม่งั้นจะเท่ากับแก้ผลย้อนหลังด้วยการลบทิ้ง
    const hasLockedData = (months: unknown, locked: boolean[]) =>
      toMonths(months).some((v, i) => locked[i] && v !== null);
    if (
      hasLockedData(target.planMonths, locks.plan) ||
      hasLockedData(target.actualMonths, locks.actual)
    ) {
      return {
        error: "ลบบรรทัดนี้ไม่ได้ เพราะมีข้อมูลในไตรมาสที่ปิดไปแล้ว",
      };
    }

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

  // ---- ส่งแผน ----
  // ตรวจจากข้อมูลที่เพิ่งบันทึก (อ่านใหม่จากฐานข้อมูล) ไม่ใช่จากฟอร์ม
  if (intent === "confirm") {
    const saved = await db.actionPlan.findMany({
      where: { indicatorId },
      select: { title: true, planMonths: true },
    });
    const complete = isPlanComplete(
      saved.map((r) => ({ title: r.title, planMonths: toMonths(r.planMonths) })),
    );
    if (!complete) {
      return {
        error:
          "ยังส่งแผนไม่ได้ ต้องมีอย่างน้อย 1 รายการที่ตั้งชื่อและใส่ตัวเลขแผนอย่างน้อย 1 เดือน (บันทึกสิ่งที่กรอกไว้แล้ว)",
      };
    }
    // ยืนยันแล้วลบบรรทัดไม่ได้ บรรทัดที่ไม่มีชื่อจะค้างอยู่ในแผนตลอดปี จึงให้จัดการก่อน
    if (saved.some((r) => r.title.trim() === "")) {
      return {
        error:
          "ยังส่งแผนไม่ได้ มีบรรทัดที่ยังไม่ได้ตั้งชื่อรายการ ใส่ชื่อหรือลบบรรทัดนั้นก่อน (บันทึกสิ่งที่กรอกไว้แล้ว)",
      };
    }

    await db.planHeader.update({
      where: { indicatorId },
      // ส่งใหม่หลังถูกตีกลับ ล้างเหตุผลที่ตีกลับทิ้ง
      data: { confirmedAt: new Date(), confirmedById: user.id, returnedAt: null, returnNote: null },
    });
    message = "ส่งแผนการดำเนินงานเรียบร้อยแล้ว แผนถูกล็อก และรายงานผลการดำเนินงานได้แล้ว";
  }

  // ---- ตีกลับแผน (ส่วนกลาง) ----
  // ปลดล็อกให้ส่วนงานแก้ แล้วแจ้งเตือนหัวหน้าส่วนงาน ซึ่งต้องกดส่งแผนใหม่หลังแก้เสร็จ
  if (intent === "unlock") {
    await db.planHeader.update({
      where: { indicatorId },
      data: { confirmedAt: null, confirmedById: null, returnedAt: new Date(), returnNote },
    });
    const notified = await notifyDepartmentUsers(indicator.departmentId, {
      title: `ส่วนกลางตีกลับแผนการดำเนินงาน ข้อ ${indicator.code}`,
      body: `${indicator.name} · เหตุผล: ${returnNote}`,
      link: `/plans/${indicatorId}#return`,
    });
    message =
      notified > 0
        ? `ตีกลับแผนแล้ว แจ้งเตือนผู้รายงานและหัวหน้าส่วนงานแล้ว (${notified} คน) · ส่วนงานแก้แผนได้ และหัวหน้าต้องกดส่งแผนใหม่`
        : "ตีกลับแผนแล้ว แต่ส่วนงานนี้ยังไม่มีบัญชีผู้ใช้ จึงไม่มีผู้รับแจ้งเตือน";
  }

  await writeAudit({
    userId: user.id,
    action:
      intent === "confirm" ? "PLAN_CONFIRM" : intent === "unlock" ? "PLAN_RETURN" : "PLAN_SAVE",
    entity: "ActionPlan",
    entityId: indicatorId,
    detail: {
      indicatorCode: indicator.code,
      intent,
      rows: updates.length,
      ...(intent === "unlock" ? { returnNote } : {}),
    },
  });

  revalidatePath("/reports");
  revalidatePath(`/plans/${indicatorId}`);
  // แผนแสดงในหน้ารายงานผลรายไตรมาสด้วย
  revalidatePath("/reports/[indicatorId]/[quarter]", "page");
  revalidatePath(`/indicators/${indicatorId}`);
  return { error: null, success: true, message };
}
