import { cache } from "react";
import { redirect } from "next/navigation";
import { findAppUser } from "@/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { homePath, type Actor } from "@/lib/permissions";

// ============================================================================
// ตัวช่วยดึงข้อมูลผู้ใช้ที่ login อยู่ สำหรับเรียกใช้ในหน้าเว็บฝั่งเซิร์ฟเวอร์
// ============================================================================

export type CurrentUser = Actor & {
  id: string;
  name: string;
  email: string;
};

/**
 * ดึงผู้ใช้ปัจจุบัน คืน null ถ้ายังไม่ได้ login หรือบัญชีถูกปิดใช้งาน
 *
 * ใช้ getUser() ไม่ใช่ getSession() เพราะ getUser() ถามเซิร์ฟเวอร์ Supabase ว่า token ยังใช้ได้จริง
 * ส่วน getSession() แค่อ่านคุกกี้ ซึ่งผู้ใช้ปลอมขึ้นมาเองได้
 *
 * ห่อด้วย cache() ให้ถามแค่ครั้งเดียวต่อการเปิดหน้า แม้ layout กับหน้าจะเรียกซ้ำกัน
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const user = await findAppUser(authUser);
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
  };
});

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
