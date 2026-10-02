import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { updateUserAction, resetUserPasswordAction } from "@/actions/users";
import { formatThaiDateTime } from "@/lib/datetime";
import { UserForm } from "../user-form";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "แก้ไขผู้ใช้ | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน" };

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const [target, departments] = await Promise.all([
    db.user.findUnique({ where: { id } }),
    db.department.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!target) notFound();

  // ผูก id เข้ากับ action ตั้งแต่ฝั่งเซิร์ฟเวอร์
  // ทำให้ id ไม่ถูกส่งมาจากฟอร์มฝั่งเบราว์เซอร์ ซึ่งแก้ค่าได้
  const updateAction = updateUserAction.bind(null, target.id);
  const resetAction = resetUserPasswordAction.bind(null, target.id);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/users" className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline">
          ← กลับไปหน้าจัดการผู้ใช้
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">แก้ไขผู้ใช้</h1>
        <p className="mt-1 text-sm text-slate-600">
          สร้างเมื่อ {formatThaiDateTime(target.createdAt)} · เข้าใช้ล่าสุด{" "}
          {target.lastLoginAt ? formatThaiDateTime(target.lastLoginAt) : "ยังไม่เคยเข้าใช้"}
        </p>
      </div>

      <UserForm
        action={updateAction}
        submitLabel="บันทึกการแก้ไข"
        cancelHref="/admin/users"
        departments={departments}
        withPassword={false}
        isSelf={target.id === admin.id}
        initial={{
          email: target.email,
          name: target.name,
          role: target.role,
          departmentId: target.departmentId ?? "",
          isActive: target.isActive,
        }}
      />

      <ResetPasswordForm action={resetAction} userName={target.name} />
    </div>
  );
}
