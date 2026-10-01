"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// ทำเครื่องหมายว่าอ่านแล้ว - ทำได้เฉพาะแจ้งเตือนของตัวเอง (where มี userId เสมอ)

/** กดแจ้งเตือนหนึ่งรายการ: อ่านแล้ว แล้วพาไปหน้าที่เกี่ยวข้อง */
export async function openNotificationAction(notificationId: string) {
  const user = await requireUser();
  const n = await db.notification.findFirst({
    where: { id: notificationId, userId: user.id },
    select: { id: true, link: true, readAt: true },
  });
  if (!n) redirect("/notifications");

  if (n.readAt === null) {
    await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  }
  revalidatePath("/", "layout");
  // ลิงก์มาจากระบบเองเสมอ แต่กันไว้ไม่ให้พาออกนอกเว็บ
  redirect(n.link && n.link.startsWith("/") ? n.link : "/notifications");
}

/** อ่านทั้งหมดแล้ว */
export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
