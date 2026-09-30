import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { homePath, type Actor } from "@/lib/permissions";

// ============================================================================
// ตัวช่วยดึงข้อมูลผู้ใช้ที่ login อยู่ สำหรับเรียกใช้ในหน้าเว็บฝั่งเซิร์ฟเวอร์
// ============================================================================

export type CurrentUser = Actor & {
  id: string;
  name: string;
  email: string;
};

/** ดึงผู้ใช้ปัจจุบัน คืน null ถ้ายังไม่ได้ login */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    departmentId: session.user.departmentId,
  };
}

/**
 * บังคับว่าต้อง login ก่อน ถ้ายังไม่ได้ login จะเด้งไปหน้า /login
 *
 * ใช้บรรทัดแรกของทุกหน้าที่ต้องการการยืนยันตัวตน:
 *   const user = await requireUser();
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * บังคับว่าต้องเป็น ADMIN เท่านั้น
 * ผู้ใช้ทั่วไปที่พยายามเข้า URL ของหน้าผู้ดูแลระบบจะถูกส่งกลับหน้าแรก
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect(homePath(user));
  return user;
}
