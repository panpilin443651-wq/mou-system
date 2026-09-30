"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { isDemoLoginEnabled, signIn, signOut } from "@/auth";

// ============================================================================
// Server Action - โค้ดส่วนนี้ทำงานบนเซิร์ฟเวอร์เท่านั้น
// หน้าเว็บเรียกใช้ผ่านฟอร์มได้เลย โดยไม่ต้องเขียน API แยก
// ============================================================================

export type LoginState = { error: string | null };

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      // ตอนนี้ยังไม่รู้ role จึงส่งไปหน้าภาพรวมก่อน
      // ผู้รับผิดชอบส่วนงานจะถูกส่งต่อไปหน้ารายงานผลเองจากหน้านั้น
      redirectTo: "/dashboard",
    });
    return { error: null };
  } catch (error) {
    // next/navigation ใช้การโยน error เพื่อสั่ง redirect
    // ถ้าดักไว้เองจะทำให้ redirect ไม่ทำงาน จึงต้องโยนต่อ
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;

    if (error instanceof AuthError) {
      return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
    }
    return { error: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
}

/** โหมดจำลองสิทธิ์ - เข้าสู่ระบบเป็นผู้ใช้ที่เลือกจากรายชื่อ โดยไม่ต้องใช้รหัสผ่าน */
export async function demoLoginAction(formData: FormData) {
  // provider "demo" ตรวจสวิตช์ซ้ำอีกชั้น ตรงนี้กันไว้ก่อนเพื่อไม่ต้องเรียกเปล่าๆ
  if (!isDemoLoginEnabled()) redirect("/login");

  try {
    await signIn("demo", {
      userId: String(formData.get("userId") ?? ""),
      // ส่งไปหน้าภาพรวมก่อน ผู้บันทึกข้อมูลจะถูกส่งต่อไปหน้ารายงานผลเอง
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    // บัญชีถูกปิดหรือถูกลบไปก่อนกด - กลับไปหน้าเลือกผู้ใช้ใหม่
    redirect("/login");
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
