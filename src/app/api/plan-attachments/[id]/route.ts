import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canViewDepartment } from "@/lib/permissions";

// ============================================================================
// ดาวน์โหลดไฟล์หลักฐานของแผนดำเนินงาน ผ่านการตรวจสิทธิ์ก่อนเสมอ
// ============================================================================
// หลักการเดียวกับ /api/attachments/[id]: ไม่ส่ง URL จริงบน Blob ให้เบราว์เซอร์เห็น
// ตรวจสิทธิ์แล้วดึงไฟล์มาส่งต่อ
// ============================================================================

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("กรุณาเข้าสู่ระบบ", { status: 401 });

  const { id } = await params;

  const attachment = await db.planAttachment.findUnique({
    where: { id },
    include: { actionPlan: { select: { indicator: { select: { departmentId: true } } } } },
  });
  if (!attachment) return new Response("ไม่พบไฟล์แนบนี้", { status: 404 });

  if (!canViewDepartment(user, attachment.actionPlan.indicator.departmentId)) {
    return new Response("ไม่พบไฟล์แนบนี้", { status: 404 });
  }

  const upstream = await fetch(attachment.storagePath);
  if (!upstream.ok || !upstream.body) {
    return new Response("เปิดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", { status: 502 });
  }

  const encodedName = encodeURIComponent(attachment.originalName);
  return new Response(upstream.body, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
    },
  });
}
