"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { findAppUser, isDemoLoginEnabled } from "@/auth";
import { db } from "@/lib/db";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

// ============================================================================
// Server Action - โค้ดส่วนนี้ทำงานบนเซิร์ฟเวอร์เท่านั้น
// หน้าเว็บเรียกใช้ผ่านฟอร์มได้เลย โดยไม่ต้องเขียน API แยก
// ============================================================================

export type LoginState = { error: string | null };

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** บันทึกเวลาเข้าใช้ล่าสุด */
async function touchLastLogin(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    // บอกแค่ว่าไม่ถูกต้อง ไม่แยกว่าอีเมลผิดหรือรหัสผิด คนเดาจะได้ไม่รู้ว่ามีอีเมลนี้ในระบบ
    if (error?.code === "invalid_credentials" || error?.status === 400) {
      return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
    }
    console.error("Supabase login ไม่สำเร็จ:", error);
    return { error: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  // รหัสผ่านถูก แต่ต้องมีบัญชีในระบบที่ยังเปิดใช้งานอยู่ด้วย
  // ไม่งั้นใครที่มีบัญชีใน Supabase project เดียวกันก็เข้าได้
  const user = await findAppUser(data.user);
  if (!user || !user.isActive) {
    await supabase.auth.signOut();
    return {
      error: "บัญชีนี้ยังไม่มีสิทธิ์ใช้งานระบบหรือถูกปิดใช้งาน กรุณาติดต่อส่วนกลาง",
    };
  }

  await touchLastLogin(user.id);

  // ตอนนี้ยังไม่รู้ role จึงส่งไปหน้าภาพรวมก่อน
  // ผู้รับผิดชอบส่วนงานจะถูกส่งต่อไปหน้ารายงานผลเองจากหน้านั้น
  redirect("/dashboard");
}

/**
 * โหมดจำลองสิทธิ์ - เข้าสู่ระบบเป็นผู้ใช้ที่เลือกจากรายชื่อ โดยไม่ต้องใช้รหัสผ่าน
 *
 * ใช้ service_role ออกลิงก์เข้าระบบ (magic link) ให้ผู้ใช้คนนั้น แล้วยืนยันลิงก์ทันทีที่เซิร์ฟเวอร์
 * จึงได้ session ของ Supabase จริงเหมือน login ปกติ โดยไม่ต้องส่งอีเมลออกไป
 */
export async function demoLoginAction(formData: FormData) {
  // ตรวจสวิตช์ที่นี่เสมอ ไม่พึ่งแค่การซ่อนรายชื่อบนหน้า login
  // ไม่งั้นใครรู้ว่ามี Action นี้ก็ยิงตรงมาเข้าได้แม้ปิดโหมดแล้ว
  if (!isDemoLoginEnabled()) redirect("/login");

  const userId = String(formData.get("userId") ?? "");
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  // บัญชีถูกปิดหรือถูกลบไปก่อนกด - กลับไปหน้าเลือกผู้ใช้ใหม่
  if (!user || !user.isActive) redirect("/login");

  const admin = createSupabaseAdminClient();

  // ผู้ใช้ที่ยังไม่มีบัญชีใน Supabase (เช่น ข้อมูลตั้งต้นที่ยังไม่ได้ย้าย) สร้างให้ก่อน
  // ไม่ตั้งรหัสผ่าน เข้าได้เฉพาะโหมดจำลอง จนกว่าส่วนกลางจะตั้งรหัสผ่านให้
  if (!user.authId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("สร้างบัญชี Supabase ให้โหมดจำลองไม่สำเร็จ:", error);
      redirect("/login");
    }
    await db.user.update({ where: { id: user.id }, data: { authId: data.user.id } });
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  if (linkError || !link.properties?.hashed_token) {
    console.error("ออกลิงก์เข้าระบบโหมดจำลองไม่สำเร็จ:", linkError);
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (error) {
    console.error("ยืนยันลิงก์เข้าระบบโหมดจำลองไม่สำเร็จ:", error);
    redirect("/login");
  }

  await touchLastLogin(user.id);
  // ส่งไปหน้าภาพรวมก่อน ผู้บันทึกข้อมูลจะถูกส่งต่อไปหน้ารายงานผลเอง
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
