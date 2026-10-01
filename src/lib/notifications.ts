import { db } from "@/lib/db";

// ============================================================================
// การแจ้งเตือน (กระดิ่งบนแถบเมนู)
// ============================================================================
// ตอนนี้ใช้กับเรื่องเดียว: ส่วนกลางตีกลับแผน/ผลการดำเนินงาน
// ผู้รับคือหัวหน้าส่วนงาน/หัวหน้าหน่วยงานที่ไม่สังกัดส่วนงาน เพราะเป็นผู้กดส่ง
// และต้องกดส่งใหม่หลังผู้รายงานแก้ไขเสร็จ
// ============================================================================

/**
 * ส่งแจ้งเตือนถึงหัวหน้าส่วนงานทุกคน (ที่ยังเปิดใช้งาน) ของส่วนงานนี้
 * คืนจำนวนคนที่ได้รับ - 0 = ส่วนงานนี้ยังไม่มีบัญชีหัวหน้าส่วนงาน
 */
export async function notifyDepartmentHeads(
  departmentId: string,
  message: { title: string; body?: string | null; link?: string | null },
): Promise<number> {
  const heads = await db.user.findMany({
    where: { departmentId, role: "DEPT_HEAD", isActive: true },
    select: { id: true },
  });
  if (heads.length === 0) return 0;

  await db.notification.createMany({
    data: heads.map((h) => ({
      userId: h.id,
      title: message.title,
      body: message.body ?? null,
      link: message.link ?? null,
    })),
  });
  return heads.length;
}

/** จำนวนแจ้งเตือนที่ยังไม่อ่าน - ใช้แต้มตัวเลขบนกระดิ่ง */
export function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
