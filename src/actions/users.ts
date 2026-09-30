"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageSystem } from "@/lib/permissions";
import { userSchema, initialPasswordSchema, firstError } from "@/lib/validation";
import { writeAudit, diffFields } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// ============================================================================
// Server Action สำหรับจัดการบัญชีผู้ใช้ (เฉพาะ ADMIN)
// ============================================================================
// ผู้ใช้สมัครเองไม่ได้ ส่วนกลางเป็นคนสร้างบัญชีให้ 30 ส่วนงาน
//
// รหัสผ่านเก็บที่ Supabase Auth ส่วนสิทธิ์และสังกัดเก็บในตาราง User (ผูกกันด้วย authId)
// งานที่แตะบัญชีของคนอื่นใน Supabase ต้องใช้ service_role key (createSupabaseAdminClient)
//
// ทุกฟังก์ชันตรวจสิทธิ์เองที่บรรทัดแรกเสมอ ไม่พึ่งการซ่อนเมนู
// เพราะ Server Action ถูกเรียกตรงจากภายนอกได้โดยไม่ผ่านหน้าเว็บของเรา
// ============================================================================

export type FormState = { error: string | null; success?: boolean };

/** อ่านค่าจากฟอร์มผู้ใช้แล้วตรวจด้วย Zod */
function parseUserForm(formData: FormData) {
  return userSchema.safeParse({
    email: formData.get("email") ?? "",
    name: formData.get("name") ?? "",
    role: formData.get("role") ?? "DEPT_USER",
    departmentId: formData.get("departmentId") ?? "",
    isActive: formData.get("isActive") ?? "true",
  });
}

/**
 * ตรวจว่าส่วนงานที่เลือกมีอยู่จริง
 * ถ้าไม่ตรวจ ฐานข้อมูลจะโยน error ดิบๆ ที่ผู้ใช้อ่านไม่รู้เรื่อง
 */
async function departmentExists(departmentId: string | null): Promise<boolean> {
  if (departmentId === null) return true;
  const found = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  return Boolean(found);
}

/** จำนวน ADMIN ที่ยังเปิดใช้งานอยู่ ไม่นับคนที่ระบุใน exceptId */
async function countOtherActiveAdmins(exceptId: string): Promise<number> {
  return db.user.count({
    where: { role: "ADMIN", isActive: true, id: { not: exceptId } },
  });
}

export async function createUserAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) {
    return { error: "คุณไม่มีสิทธิ์สร้างบัญชีผู้ใช้ เฉพาะส่วนกลางเท่านั้นที่ทำได้" };
  }

  const parsed = parseUserForm(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const input = parsed.data;

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const parsedPassword = initialPasswordSchema.safeParse(password);
  if (!parsedPassword.success) return { error: firstError(parsedPassword.error) };
  if (password !== confirmPassword) return { error: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" };

  if (!(await departmentExists(input.departmentId))) {
    return { error: "ไม่พบส่วนงานที่เลือก" };
  }

  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    return { error: `อีเมล "${input.email}" ถูกใช้ไปแล้ว` };
  }

  // สร้างบัญชีใน Supabase ก่อน (เก็บรหัสผ่าน) แล้วค่อยสร้างในตาราง User (เก็บสิทธิ์)
  // email_confirm: true = ไม่ต้องให้ผู้ใช้กดยืนยันอีเมล เพราะส่วนกลางเป็นคนสร้างให้เอง
  const admin = createSupabaseAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    if (authError?.code === "email_exists") {
      return {
        error: `อีเมล "${input.email}" มีบัญชีใน Supabase อยู่แล้ว (แต่ยังไม่มีในระบบนี้) ลบบัญชีนั้นที่ Supabase Dashboard ก่อน หรือใช้อีเมลอื่น`,
      };
    }
    console.error("สร้างบัญชี Supabase ไม่สำเร็จ:", authError);
    return { error: "สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  let newId: string;
  try {
    const created = await db.user.create({
      data: {
        authId: authData.user.id,
        email: input.email,
        name: input.name,
        role: input.role,
        // ADMIN และ EXECUTIVE ดูได้ทุกส่วนงานอยู่แล้ว จึงไม่ผูกสังกัด
        departmentId: input.role === "DEPT_USER" ? input.departmentId : null,
        isActive: input.isActive,
      },
    });
    newId = created.id;
  } catch (error) {
    // สร้างในตาราง User ไม่ได้ ลบบัญชีใน Supabase ทิ้ง ไม่ให้เหลือบัญชีที่ไม่มีเจ้าของ
    await admin.auth.admin.deleteUser(authData.user.id).catch(() => {});
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: `อีเมล "${input.email}" ถูกใช้ไปแล้ว` };
    }
    throw error;
  }

  // ไม่บันทึกรหัสผ่านลงประวัติเด็ดขาด เก็บแค่ว่าใครสร้างบัญชีให้ใคร
  await writeAudit({
    userId: actor.id,
    action: "USER_CREATE",
    entity: "User",
    entityId: newId,
    detail: { email: input.email, name: input.name, role: input.role },
  });

  revalidatePath("/admin/users");
  redirect("/admin/users?created=1");
}

export async function updateUserAction(
  userId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) {
    return { error: "คุณไม่มีสิทธิ์แก้ไขบัญชีผู้ใช้ เฉพาะส่วนกลางเท่านั้นที่ทำได้" };
  }

  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing) return { error: "ไม่พบบัญชีผู้ใช้นี้" };

  const parsed = parseUserForm(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const input = parsed.data;

  if (!(await departmentExists(input.departmentId))) {
    return { error: "ไม่พบส่วนงานที่เลือก" };
  }

  // กันไม่ให้ผู้ดูแลระบบล็อกตัวเองออกจากระบบโดยไม่ตั้งใจ
  if (existing.id === actor.id) {
    if (!input.isActive) return { error: "ปิดใช้งานบัญชีของตัวเองไม่ได้" };
    if (input.role !== "ADMIN") return { error: "ลดสิทธิ์ของตัวเองไม่ได้" };
  }

  // กันไม่ให้เหลือระบบที่ไม่มีผู้ดูแลเลย
  const losesAdmin =
    existing.role === "ADMIN" && existing.isActive && (input.role !== "ADMIN" || !input.isActive);
  if (losesAdmin && (await countOtherActiveAdmins(existing.id)) === 0) {
    return { error: "ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 บัญชีเสมอ" };
  }

  const departmentId = input.role === "DEPT_USER" ? input.departmentId : null;

  // เปลี่ยนอีเมล ต้องเปลี่ยนที่ Supabase ด้วย เพราะผู้ใช้ login ด้วยอีเมลที่อยู่ใน Supabase
  if (input.email !== existing.email) {
    const taken = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (taken) return { error: `อีเมล "${input.email}" ถูกใช้ไปแล้ว` };

    if (existing.authId) {
      const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(
        existing.authId,
        { email: input.email, email_confirm: true },
      );
      if (error) {
        console.error("เปลี่ยนอีเมลใน Supabase ไม่สำเร็จ:", error);
        return {
          error:
            error.code === "email_exists"
              ? `อีเมล "${input.email}" มีบัญชีใน Supabase อยู่แล้ว`
              : "เปลี่ยนอีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        };
      }
    }
  }

  try {
    await db.user.update({
      where: { id: userId },
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        departmentId,
        isActive: input.isActive,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: `อีเมล "${input.email}" ถูกใช้ไปแล้ว` };
    }
    throw error;
  }

  const changes = diffFields(
    {
      email: existing.email,
      name: existing.name,
      role: existing.role,
      departmentId: existing.departmentId,
      isActive: existing.isActive,
    },
    {
      email: input.email,
      name: input.name,
      role: input.role,
      departmentId,
      isActive: input.isActive,
    }
  );

  await writeAudit({
    userId: actor.id,
    action: "USER_UPDATE",
    entity: "User",
    entityId: userId,
    detail: changes,
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  redirect("/admin/users?updated=1");
}

/**
 * ตั้งรหัสผ่านใหม่ให้ผู้ใช้ (กรณีลืมรหัสผ่าน)
 *
 * ส่วนกลางตั้งรหัสชั่วคราวให้ แล้วแจ้งเจ้าตัวไปเปลี่ยนเองที่หน้า /account
 * ระบบไม่มีทางกู้รหัสผ่านเดิมได้ เพราะ Supabase เก็บไว้แบบเข้ารหัสทางเดียว
 */
export async function resetUserPasswordAction(
  userId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) {
    return { error: "คุณไม่มีสิทธิ์ตั้งรหัสผ่านให้ผู้อื่น" };
  }

  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, authId: true },
  });
  if (!existing) return { error: "ไม่พบบัญชีผู้ใช้นี้" };

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const parsed = initialPasswordSchema.safeParse(password);
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (password !== confirmPassword) return { error: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" };

  const admin = createSupabaseAdminClient();
  let authId = existing.authId;

  if (authId) {
    const { error } = await admin.auth.admin.updateUserById(authId, { password });
    if (error) {
      console.error("ตั้งรหัสผ่านใน Supabase ไม่สำเร็จ:", error);
      return { error: "ตั้งรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }
  } else {
    // ผู้ใช้เก่าที่ยังไม่มีบัญชีใน Supabase - สร้างให้พร้อมรหัสผ่านใหม่เลย
    const { data, error } = await admin.auth.admin.createUser({
      email: existing.email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("สร้างบัญชี Supabase ไม่สำเร็จ:", error);
      return { error: "ตั้งรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }
    authId = data.user.id;
  }

  // ล้างรหัสผ่านของระบบเดิมทิ้ง ไม่ให้สคริปต์ย้ายบัญชีเอารหัสเก่ามาทับรหัสใหม่
  await db.user.update({
    where: { id: userId },
    data: { authId, passwordHash: null },
  });

  await writeAudit({
    userId: actor.id,
    action: "USER_PASSWORD_RESET",
    entity: "User",
    entityId: userId,
    detail: { email: existing.email },
  });

  return { error: null, success: true };
}
