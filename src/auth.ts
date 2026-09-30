import type { User as AuthUser } from "@supabase/supabase-js";
import { db } from "@/lib/db";

// ============================================================================
// ระบบ Login - ใช้ Supabase Auth (อีเมล + รหัสผ่าน)
// ============================================================================
// ผู้ใช้สมัครเองไม่ได้ ADMIN เป็นผู้สร้างบัญชีให้เท่านั้น (actions/users.ts)
//
// แบ่งหน้าที่กันแบบนี้:
//   Supabase Auth  เก็บรหัสผ่าน ตรวจรหัสผ่าน ออก session (เก็บในคุกกี้)
//   ตาราง User     เก็บสิทธิ์ (role) สังกัด (departmentId) และสถานะเปิด/ปิดใช้งาน
// ผูกกันด้วย User.authId = auth.users.id ของ Supabase
//
// สิทธิ์อ่านจากฐานข้อมูลทุกครั้งที่เปิดหน้า (ไม่ได้ฝังไว้ใน token เหมือนระบบเดิม)
// ส่วนกลางปิดบัญชีหรือเปลี่ยนสิทธิ์เมื่อไร ก็มีผลทันทีโดยไม่ต้องรอให้ผู้ใช้ logout
// ============================================================================

/**
 * เปิดโหมดจำลองสิทธิ์หรือไม่ - เลือกผู้ใช้จากรายชื่อแล้วเข้าได้เลยโดยไม่ต้องใช้รหัสผ่าน
 *
 * ใช้ระหว่างทดลองระบบ ก่อนเชื่อมต่อระบบยืนยันตัวตนขององค์กร
 * ต้องตั้ง DEMO_LOGIN="true" เองเท่านั้น ถ้าไม่ได้ตั้งจะปิดเสมอ
 * เพราะเปิดไว้บนเว็บจริงเมื่อไร ใครก็เข้าเป็นผู้ดูแลระบบได้
 */
export function isDemoLoginEnabled(): boolean {
  return process.env.DEMO_LOGIN === "true";
}

/**
 * หาผู้ใช้ในระบบที่ตรงกับบัญชี Supabase
 *
 * หาจาก authId ก่อน ถ้าไม่เจอให้หาจากอีเมลของผู้ใช้ที่ยังไม่ได้ผูกบัญชี แล้วผูกให้เลย
 * (กรณีส่วนกลางสร้างบัญชีใน Supabase Dashboard เอง หรือบัญชีเก่าก่อนย้ายมา Supabase)
 * คืน null ถ้าไม่มีผู้ใช้ในระบบที่ตรงกัน
 */
export async function findAppUser(authUser: AuthUser) {
  const linked = await db.user.findUnique({ where: { authId: authUser.id } });
  if (linked) return linked;

  // ผูกด้วยอีเมลเฉพาะบัญชีที่ยืนยันอีเมลแล้ว
  // anon key เปิดให้ใครก็สมัครบัญชี Supabase ได้ ถ้าไม่ตรวจตรงนี้ คนอื่นจะสมัครด้วยอีเมล
  // ของผู้ใช้ที่ยังไม่ได้ผูกบัญชี แล้วได้สิทธิ์ของคนนั้นไปทันที
  // (บัญชีที่ส่วนกลางสร้างให้ตั้ง email_confirm: true ไว้แล้ว จึงผ่านเงื่อนไขนี้)
  if (!authUser.email_confirmed_at) return null;

  const email = authUser.email?.toLowerCase().trim();
  if (!email) return null;

  const byEmail = await db.user.findUnique({ where: { email } });
  if (!byEmail || byEmail.authId !== null) return null;

  return db.user.update({
    where: { id: byEmail.id },
    data: { authId: authUser.id },
  });
}
