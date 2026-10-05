import { db } from "@/lib/db";

// ============================================================================
// การแจ้งเตือน (กระดิ่งบนแถบเมนู)
// ============================================================================
// 1) ส่วนกลางตีกลับแผน/ผลการดำเนินงาน
//    ผู้รับคือทุกคนของส่วนงาน: ผู้รายงาน (เป็นคนแก้) และหัวหน้าส่วนงาน/หน่วยงาน (เป็นคนกดส่งใหม่)
// 2) หัวหน้าส่วนงานส่งแผน/ผลการดำเนินงาน (ส่งปกติ หรือส่งแก้ไขหลังถูกตีกลับ)
//    ผู้รับคือส่วนกลาง (ADMIN) ทุกคน
// ============================================================================

/**
 * ส่งแจ้งเตือนถึงผู้รายงานและหัวหน้าส่วนงานทุกคน (ที่ยังเปิดใช้งาน) ของส่วนงานนี้
 * คืนจำนวนคนที่ได้รับ - 0 = ส่วนงานนี้ยังไม่มีบัญชีผู้ใช้ของส่วนงาน
 */
export async function notifyDepartmentUsers(
  departmentId: string,
  message: { title: string; body?: string | null; link?: string | null; dueAt?: Date | null },
): Promise<number> {
  const heads = await db.user.findMany({
    where: { departmentId, role: { in: ["DEPT_USER", "DEPT_HEAD"] }, isActive: true },
    select: { id: true },
  });
  if (heads.length === 0) return 0;

  await db.notification.createMany({
    data: heads.map((h) => ({
      userId: h.id,
      title: message.title,
      body: message.body ?? null,
      link: message.link ?? null,
      dueAt: message.dueAt ?? null,
    })),
  });
  return heads.length;
}

/**
 * ส่งแจ้งเตือนถึงส่วนกลาง (ADMIN) ทุกคนที่ยังเปิดใช้งาน
 * ไม่ส่งถึงตัวผู้กดเอง (กรณีส่วนกลางกดส่งแทนส่วนงาน)
 */
export async function notifyAdmins(
  message: { title: string; body?: string | null; link?: string | null },
  exceptUserId?: string,
): Promise<number> {
  const admins = await db.user.findMany({
    where: {
      role: "ADMIN",
      isActive: true,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  if (admins.length === 0) return 0;

  await db.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: message.title,
      body: message.body ?? null,
      link: message.link ?? null,
    })),
  });
  return admins.length;
}

/** จำนวนแจ้งเตือนที่ยังไม่อ่าน - ใช้แต้มตัวเลขบนกระดิ่ง */
export function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
