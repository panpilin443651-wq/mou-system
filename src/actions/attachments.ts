"use server";

import { revalidatePath } from "next/cache";
import { head, del } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canSubmitReport } from "@/lib/permissions";
import {
  formatBytes,
  isAllowedMimeType,
  isBlobUrl,
  MAX_FILE_BYTES,
  MAX_PLAN_FILES_PER_ROW,
} from "@/lib/attachments";
import { writeAudit } from "@/lib/audit";
import { getWindowStatus } from "@/lib/submission-window";

// ============================================================================
// Server Action สำหรับไฟล์แนบหลักฐาน
// ============================================================================
// ไฟล์ถูกอัปโหลดตรงจากเบราว์เซอร์ไปที่ Blob แล้ว
// หน้าที่ของไฟล์นี้คือบันทึกข้อมูลของไฟล์ลงฐานข้อมูล และลบไฟล์
//
// ห้ามเชื่อข้อมูลที่เบราว์เซอร์ส่งมา (ขนาด ชนิดไฟล์)
// ต้องไปถาม Blob เองว่าไฟล์จริงมีขนาดและชนิดอะไร
// ============================================================================

export type FormState = { error: string | null; success?: boolean };

/** บันทึกข้อมูลไฟล์ลงฐานข้อมูล หลังเบราว์เซอร์อัปโหลดขึ้น Blob สำเร็จแล้ว */
export async function recordAttachmentAction(
  indicatorId: string,
  quarter: number,
  criteriaLevel: number,
  blobUrl: string,
  originalName: string
): Promise<FormState> {
  const user = await requireUser();

  if (![1, 2, 3, 4].includes(quarter)) return { error: "ไตรมาสไม่ถูกต้อง" };
  if (![1, 2, 3, 4, 5].includes(criteriaLevel)) return { error: "ระดับคะแนนไม่ถูกต้อง" };
  if (!isBlobUrl(blobUrl)) return { error: "ที่อยู่ไฟล์ไม่ถูกต้อง" };

  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    select: { id: true, departmentId: true, code: true, fiscalYearId: true },
  });
  if (!indicator) return { error: "ไม่พบตัวชี้วัดนี้" };

  if (!canSubmitReport(user, indicator.departmentId)) {
    return { error: "คุณไม่มีสิทธิ์แนบไฟล์ของส่วนงานนี้" };
  }

  // ตรวจช่วงเวลาซ้ำอีกชั้น เผื่อกรณีที่ช่วงเวลาปิดลงระหว่างที่กำลังอัปโหลดอยู่
  const window = await getWindowStatus({
    fiscalYearId: indicator.fiscalYearId,
    quarter,
    departmentId: indicator.departmentId,
    actor: user,
  });
  if (!window.canWrite) {
    await del(blobUrl).catch(() => {});
    return { error: `แนบไฟล์ไม่ได้ — ${window.message}` };
  }

  // ถาม Blob เองว่าไฟล์จริงเป็นอย่างไร ไม่เชื่อค่าที่เบราว์เซอร์บอก
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

  // ต้องมีรายงานของไตรมาสนั้นก่อน ไฟล์แนบจึงจะผูกได้
  // ถ้ายังไม่มี ให้สร้างเป็นร่างเปล่าไว้ก่อน เพื่อให้แนบไฟล์ก่อนกรอกตัวเลขได้
  const report = await db.quarterlyReport.upsert({
    where: { indicatorId_quarter: { indicatorId, quarter } },
    update: {},
    create: { indicatorId, quarter, status: "DRAFT" },
    select: { id: true },
  });

  // ตรวจซ้ำตอนบันทึก เพราะอัปโหลดพร้อมกันหลายไฟล์จะผ่านด่านออกบัตรผ่านไปได้ทั้งหมด
  const existing = await db.attachment.count({
    where: { reportId: report.id, criteriaLevel },
  });
  if (existing >= MAX_PLAN_FILES_PER_ROW) {
    await del(blobUrl).catch(() => {});
    return { error: `แนบไฟล์ได้ไม่เกิน ${MAX_PLAN_FILES_PER_ROW} ไฟล์ต่อระดับ` };
  }

  const created = await db.attachment.create({
    data: {
      reportId: report.id,
      criteriaLevel,
      originalName: originalName.slice(0, 255),
      storagePath: blobUrl,
      mimeType: info.contentType,
      sizeBytes: info.size,
      uploadedById: user.id,
    },
  });

  await writeAudit({
    userId: user.id,
    action: "ATTACHMENT_UPLOAD",
    entity: "Attachment",
    entityId: created.id,
    detail: {
      indicatorCode: indicator.code,
      quarter,
      criteriaLevel,
      originalName,
      sizeBytes: info.size,
    },
  });

  revalidatePath(`/reports/${indicatorId}/${quarter}`);
  return { error: null, success: true };
}

/** ลบไฟล์แนบ ทั้งข้อมูลในฐานข้อมูลและตัวไฟล์บน Blob */
export async function deleteAttachmentAction(
  attachmentId: string,
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const user = await requireUser();

  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      report: {
        select: {
          quarter: true,
          indicator: {
            select: { id: true, departmentId: true, code: true, fiscalYearId: true },
          },
        },
      },
    },
  });
  if (!attachment) return { error: "ไม่พบไฟล์แนบนี้" };

  if (!canSubmitReport(user, attachment.report.indicator.departmentId)) {
    return { error: "คุณไม่มีสิทธิ์ลบไฟล์แนบของส่วนงานนี้" };
  }

  // ปิดรับข้อมูลแล้วก็ลบหลักฐานที่ส่งไปแล้วไม่ได้เช่นกัน
  const window = await getWindowStatus({
    fiscalYearId: attachment.report.indicator.fiscalYearId,
    quarter: attachment.report.quarter,
    departmentId: attachment.report.indicator.departmentId,
    actor: user,
  });
  if (!window.canWrite) {
    return { error: `ลบไฟล์ไม่ได้ — ${window.message}` };
  }

  // ลบข้อมูลในฐานข้อมูลก่อน แล้วค่อยลบไฟล์จริง
  // ถ้าลบไฟล์จริงไม่สำเร็จ อย่างน้อยระบบจะไม่ค้างรายการที่กดเปิดแล้วเจอ error
  await db.attachment.delete({ where: { id: attachmentId } });
  await del(attachment.storagePath).catch((error) => {
    console.error("ลบไฟล์บน Blob ไม่สำเร็จ:", error);
  });

  await writeAudit({
    userId: user.id,
    action: "ATTACHMENT_DELETE",
    entity: "Attachment",
    entityId: attachmentId,
    detail: {
      indicatorCode: attachment.report.indicator.code,
      quarter: attachment.report.quarter,
      criteriaLevel: attachment.criteriaLevel,
      originalName: attachment.originalName,
    },
  });

  revalidatePath(
    `/reports/${attachment.report.indicator.id}/${attachment.report.quarter}`
  );
  return { error: null, success: true };
}
