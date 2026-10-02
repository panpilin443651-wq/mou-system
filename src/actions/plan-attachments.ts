"use server";

import { revalidatePath } from "next/cache";
import { head, del } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManagePlan } from "@/lib/permissions";
import {
  isAllowedMimeType,
  isBlobUrl,
  formatBytes,
  MAX_FILE_BYTES,
  MAX_PLAN_FILES_PER_ROW,
} from "@/lib/attachments";
import { writeAudit } from "@/lib/audit";
import {
  RETURNED_RESULT_MESSAGE,
  planRowSectionKey,
  returnedResultSectionsFor,
  submittedLockMessage,
  submittedResultsLockFor,
} from "@/lib/report-lock";

// ============================================================================
// ไฟล์ "หลักฐานประกอบผลการดำเนินงาน" ของบรรทัดในแผนดำเนินงาน
// ============================================================================
// ทำงานแบบเดียวกับไฟล์แนบของรายงาน (src/actions/attachments.ts)
//   เบราว์เซอร์อัปโหลดตรงไป Blob ก่อน แล้วค่อยเรียกที่นี่ให้บันทึกข้อมูลไฟล์
//   ห้ามเชื่อขนาดและชนิดไฟล์ที่เบราว์เซอร์บอก ต้องถาม Blob เอง
// ต่างกันตรงที่ใช้สิทธิ์แก้แผน และไม่ผูกกับช่วงเวลาเปิด-ปิดรับผลรายไตรมาส
// ============================================================================

export type FormState = { error: string | null; success?: boolean };

function revalidatePlan(indicatorId: string) {
  revalidatePath("/reports/[indicatorId]/[quarter]", "page");
  revalidatePath(`/plans/${indicatorId}`);
  revalidatePath(`/indicators/${indicatorId}`);
}

/** บันทึกข้อมูลไฟล์ลงฐานข้อมูล หลังเบราว์เซอร์อัปโหลดขึ้น Blob สำเร็จแล้ว */
export async function recordPlanAttachmentAction(
  actionPlanId: string,
  blobUrl: string,
  originalName: string,
): Promise<FormState> {
  const user = await requireUser();
  if (!isBlobUrl(blobUrl)) return { error: "ที่อยู่ไฟล์ไม่ถูกต้อง" };

  const plan = await db.actionPlan.findUnique({
    where: { id: actionPlanId },
    select: {
      id: true,
      section: true,
      criteriaLevel: true,
      _count: { select: { attachments: true } },
      indicator: {
        select: {
          id: true,
          code: true,
          departmentId: true,
          fiscalYearId: true,
          planHeader: { select: { confirmedAt: true } },
        },
      },
    },
  });
  if (!plan) {
    await del(blobUrl).catch(() => {});
    return { error: "ไม่พบบรรทัดแผนนี้ อาจถูกลบไปแล้ว" };
  }

  if (!canManagePlan(user, plan.indicator.departmentId)) {
    await del(blobUrl).catch(() => {});
    return { error: "คุณไม่มีสิทธิ์แนบไฟล์ในแผนของส่วนงานนี้" };
  }

  if (user.role !== "ADMIN" && !plan.indicator.planHeader?.confirmedAt) {
    await del(blobUrl).catch(() => {});
    return { error: "ต้องส่งแผนการดำเนินงานก่อน จึงแนบหลักฐานได้" };
  }

  // ส่งผลแล้ว หลักฐานล็อกจนกว่าส่วนกลางจะตีกลับ
  const lockedQuarter = await submittedResultsLockFor(plan.indicator, user);
  if (lockedQuarter !== null) {
    await del(blobUrl).catch(() => {});
    return { error: submittedLockMessage(lockedQuarter) };
  }
  // ผลถูกตีกลับ: แนบหลักฐานได้เฉพาะบรรทัดในส่วนที่มีข้อสังเกต
  const returnedSections = await returnedResultSectionsFor(plan.indicator, user);
  if (returnedSections && !returnedSections.has(planRowSectionKey(plan))) {
    await del(blobUrl).catch(() => {});
    return { error: RETURNED_RESULT_MESSAGE };
  }

  // ตรวจซ้ำตอนบันทึก เพราะอัปโหลดสองไฟล์พร้อมกันจะผ่านด่านออกบัตรผ่านไปได้ทั้งคู่
  if (plan._count.attachments >= MAX_PLAN_FILES_PER_ROW) {
    await del(blobUrl).catch(() => {});
    return { error: `แนบหลักฐานได้ไม่เกิน ${MAX_PLAN_FILES_PER_ROW} ไฟล์ต่อขั้นตอน` };
  }

  let info;
  try {
    info = await head(blobUrl);
  } catch {
    return { error: "หาไฟล์ที่อัปโหลดไม่พบ กรุณาลองใหม่อีกครั้ง" };
  }
  if (!isAllowedMimeType(info.contentType)) {
    await del(blobUrl).catch(() => {});
    return { error: "ชนิดไฟล์นี้ไม่อนุญาต" };
  }
  if (info.size > MAX_FILE_BYTES) {
    await del(blobUrl).catch(() => {});
    return { error: `ไฟล์ใหญ่เกิน ${formatBytes(MAX_FILE_BYTES)}` };
  }

  const created = await db.planAttachment.create({
    data: {
      actionPlanId,
      originalName: originalName.slice(0, 255),
      storagePath: blobUrl,
      mimeType: info.contentType,
      sizeBytes: info.size,
      uploadedById: user.id,
    },
  });

  await writeAudit({
    userId: user.id,
    action: "PLAN_ATTACHMENT_UPLOAD",
    entity: "PlanAttachment",
    entityId: created.id,
    detail: {
      indicatorCode: plan.indicator.code,
      actionPlanId,
      originalName,
      sizeBytes: info.size,
    },
  });

  revalidatePlan(plan.indicator.id);
  return { error: null, success: true };
}

/** ลบไฟล์หลักฐานของแผน ทั้งข้อมูลในฐานข้อมูลและตัวไฟล์บน Blob */
export async function deletePlanAttachmentAction(
  attachmentId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const attachment = await db.planAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      actionPlan: {
        select: {
          section: true,
          criteriaLevel: true,
          indicator: { select: { id: true, code: true, departmentId: true, fiscalYearId: true } },
        },
      },
    },
  });
  if (!attachment) return { error: "ไม่พบไฟล์แนบนี้" };

  const indicator = attachment.actionPlan.indicator;
  if (!canManagePlan(user, indicator.departmentId)) {
    return { error: "คุณไม่มีสิทธิ์ลบไฟล์ในแผนของส่วนงานนี้" };
  }
  const lockedQuarter = await submittedResultsLockFor(indicator, user);
  if (lockedQuarter !== null) return { error: submittedLockMessage(lockedQuarter) };
  const returnedSections = await returnedResultSectionsFor(indicator, user);
  if (returnedSections && !returnedSections.has(planRowSectionKey(attachment.actionPlan))) {
    return { error: RETURNED_RESULT_MESSAGE };
  }

  // ลบข้อมูลก่อน แล้วค่อยลบไฟล์จริง ถ้าลบไฟล์ไม่สำเร็จจะไม่ค้างรายการที่กดแล้วเปิดไม่ได้
  await db.planAttachment.delete({ where: { id: attachmentId } });
  await del(attachment.storagePath).catch((error) => {
    console.error("ลบไฟล์บน Blob ไม่สำเร็จ:", error);
  });

  await writeAudit({
    userId: user.id,
    action: "PLAN_ATTACHMENT_DELETE",
    entity: "PlanAttachment",
    entityId: attachmentId,
    detail: {
      indicatorCode: indicator.code,
      originalName: attachment.originalName,
    },
  });

  revalidatePlan(indicator.id);
  return { error: null, success: true };
}
