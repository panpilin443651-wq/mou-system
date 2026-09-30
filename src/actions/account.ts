"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { passwordSchema, firstError } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import {
  createSupabaseAdminClient,
  createSupabaseStatelessClient,
} from "@/lib/supabase/server";

export type PasswordState = { error: string | null; success: boolean };

export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const user = await requireUser();

  const parsed = passwordSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) return { error: firstError(parsed.error), success: false };

  const record = await db.user.findUnique({ where: { id: user.id } });
  if (!record?.authId) return { error: "ไม่พบบัญชีผู้ใช้", success: false };

  // ต้องยืนยันรหัสผ่านเดิมก่อนเสมอ
  // กันกรณีมีคนมาใช้เครื่องที่เปิดค้างไว้แล้วเปลี่ยนรหัสผ่านของเจ้าของ
  // ใช้ตัวเชื่อมต่อที่ไม่จำ session จะได้ไม่ไปทับคุกกี้ของ session ที่ใช้อยู่
  const { error: signInError } = await createSupabaseStatelessClient().auth.signInWithPassword({
    email: record.email,
    password: parsed.data.currentPassword,
  });
  if (signInError) return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง", success: false };

  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(record.authId, {
    password: parsed.data.newPassword,
  });
  if (error) {
    console.error("เปลี่ยนรหัสผ่านใน Supabase ไม่สำเร็จ:", error);
    return { error: "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", success: false };
  }

  await writeAudit({
    userId: user.id,
    action: "PASSWORD_CHANGE",
    entity: "User",
    entityId: user.id,
  });

  return { error: null, success: true };
}
