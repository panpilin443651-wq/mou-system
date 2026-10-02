import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { formatThaiDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";
export const metadata = { title: "จัดการผู้ใช้ | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  // ตรวจสิทธิ์ที่ฝั่งเซิร์ฟเวอร์ ผู้ใช้ทั่วไปที่พิมพ์ URL เข้ามาจะถูกส่งกลับหน้าภาพรวม
  const admin = await requireAdmin();
  const sp = await searchParams;

  const [users, departments] = await Promise.all([
    db.user.findMany({
      include: { department: { select: { code: true, name: true } } },
      orderBy: [{ role: "asc" }, { department: { sortOrder: "asc" } }, { name: "asc" }],
    }),
    db.department.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  // ส่วนงานที่ยังไม่มีผู้รับผิดชอบ - เตือนไว้เพราะส่วนงานเหล่านี้จะกรอกผลไม่ได้เลย
  const covered = new Set(
    users.filter((u) => u.isActive && u.departmentId).map((u) => u.departmentId)
  );
  const uncovered = departments.filter((d) => !covered.has(d.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline">
            ← กลับไปหน้าตั้งค่าระบบ
          </Link>
          <h1 className="mt-2 text-xl font-bold sm:text-2xl">จัดการผู้ใช้</h1>
          <p className="mt-1 text-sm text-slate-600">
            ทั้งหมด {users.length.toLocaleString("th-TH")} บัญชี · ผู้ใช้สมัครเองไม่ได้
            ส่วนกลางเป็นผู้สร้างบัญชีให้
          </p>
        </div>

        <Link
          href="/admin/users/new"
          className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-800"
        >
          + เพิ่มผู้ใช้
        </Link>
      </div>

      {sp.created && (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-ink">
          สร้างบัญชีผู้ใช้เรียบร้อยแล้ว อย่าลืมแจ้งอีเมลและรหัสผ่านให้เจ้าตัว
        </p>
      )}
      {sp.updated && (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-ink">
          บันทึกการแก้ไขบัญชีเรียบร้อยแล้ว
        </p>
      )}

      {uncovered.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">
            ยังไม่มีผู้รับผิดชอบ {uncovered.length} ส่วนงาน
          </p>
          <p className="mt-1">
            ส่วนงานเหล่านี้จะยังกรอกผลการดำเนินงานไม่ได้จนกว่าจะมีบัญชีผู้ใช้:{" "}
            {uncovered.map((d) => d.code).join(" · ")}
          </p>
        </div>
      )}

      {/* ตารางกว้างเกินจอมือถือ จึงให้เลื่อนแนวนอนในกรอบตัวเอง */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="px-4 py-2.5 font-medium">ชื่อ-นามสกุล</th>
              <th className="px-3 py-2.5 font-medium">อีเมล</th>
              <th className="px-3 py-2.5 font-medium">สิทธิ์</th>
              <th className="px-3 py-2.5 font-medium">สังกัด</th>
              <th className="px-3 py-2.5 font-medium">เข้าใช้ล่าสุด</th>
              <th className="px-4 py-2.5 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="-my-2.5 block py-3 text-brand-ink underline-offset-2 hover:underline"
                  >
                    {u.name}
                  </Link>
                  {u.id === admin.id && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      บัญชีของคุณ
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-slate-600">{u.email}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                  {ROLE_LABEL[u.role]}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                  {u.department ? (
                    <span title={u.department.name}>{u.department.code}</span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                  {u.lastLoginAt ? formatThaiDateTime(u.lastLoginAt) : "ยังไม่เคยเข้าใช้"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  {u.isActive ? (
                    <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-ink">
                      ใช้งาน
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      ปิดใช้งาน
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
