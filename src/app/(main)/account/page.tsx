import { requireUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "บัญชีของฉัน | ระบบรายงานผล MOU" };

export default async function AccountPage() {
  const user = await requireUser();

  const department = user.departmentId
    ? await db.department.findUnique({
        where: { id: user.departmentId },
        select: { code: true, name: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold sm:text-2xl">บัญชีของฉัน</h1>

      <section className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-6">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">ชื่อ</dt>
            <dd className="font-medium">{user.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">อีเมล</dt>
            <dd className="break-all font-medium">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">สิทธิ์</dt>
            <dd className="font-medium">{ROLE_LABEL[user.role]}</dd>
          </div>
          {department && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">สังกัด</dt>
              <dd className="text-right font-medium">
                {department.code} {department.name}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold">เปลี่ยนรหัสผ่าน</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">
          รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร
        </p>
        <PasswordForm />
      </section>
    </div>
  );
}
