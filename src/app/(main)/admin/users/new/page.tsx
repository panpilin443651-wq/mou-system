import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { createUserAction } from "@/actions/users";
import { UserForm } from "../user-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "เพิ่มผู้ใช้ | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน" };

export default async function NewUserPage() {
  await requireAdmin();

  const departments = await db.department.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/users" className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline">
          ← กลับไปหน้าจัดการผู้ใช้
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">เพิ่มผู้ใช้</h1>
      </div>

      <UserForm
        action={createUserAction}
        submitLabel="สร้างบัญชี"
        cancelHref="/admin/users"
        departments={departments}
        withPassword
        initial={{
          email: "",
          name: "",
          role: "DEPT_USER",
          departmentId: "",
          isActive: true,
        }}
      />
    </div>
  );
}
