import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import {
  createCommandLineAction,
  deleteCommandLineAction,
  moveCommandLineAction,
  renameCommandLineAction,
  saveLineAssignmentsAction,
} from "@/actions/command-lines";
import { AddLineForm, AssignmentForm, LineRow } from "./line-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "สายบังคับบัญชา | ระบบรายงานผล MOU" };

export default async function CommandLinesPage() {
  await requireAdmin();

  const [lines, departments] = await Promise.all([
    db.commandLine.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { departments: true } } },
    }),
    db.department.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, commandLineId: true },
    }),
  ]);

  const unassigned = departments.filter((d) => d.commandLineId === null).length;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center text-sm text-brand-800 hover:underline"
        >
          ← กลับไปหน้าตั้งค่าระบบ
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">สายบังคับบัญชา</h1>
        <p className="mt-1 text-sm text-slate-600">
          จัดส่วนงานเข้าสายบังคับบัญชา ใช้กับหัวข้อ &quot;คะแนนภาพรวมส่วนงานแยกตามสายบังคับบัญชา&quot;
          ในหน้าภาพรวม · เปลี่ยนแล้วหน้าภาพรวมเปลี่ยนตามทันที
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="font-semibold">รายชื่อสาย</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            ลำดับตรงนี้คือลำดับที่แสดงในหน้าภาพรวม · ลบสายแล้วส่วนงานในสายไม่หาย แค่กลายเป็น
            &quot;ยังไม่ระบุสาย&quot;
          </p>
        </div>

        {lines.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-600 sm:px-5">ยังไม่มีสายบังคับบัญชา</p>
        ) : (
          lines.map((line, i) => (
            <LineRow
              key={line.id}
              name={line.name}
              departmentCount={line._count.departments}
              isFirst={i === 0}
              isLast={i === lines.length - 1}
              renameAction={renameCommandLineAction.bind(null, line.id)}
              moveUpAction={moveCommandLineAction.bind(null, line.id, "up")}
              moveDownAction={moveCommandLineAction.bind(null, line.id, "down")}
              deleteAction={deleteCommandLineAction.bind(null, line.id)}
            />
          ))
        )}

        <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
          <AddLineForm action={createCommandLineAction} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="font-semibold">จัดส่วนงานเข้าสาย</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            เลือกสายของแต่ละส่วนงาน แล้วกด &quot;บันทึกการจัดสาย&quot; ครั้งเดียว
            {unassigned > 0 && ` · ยังไม่ระบุสาย ${unassigned} ส่วนงาน (ช่องสีเหลือง)`}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <AssignmentForm
            action={saveLineAssignmentsAction}
            departments={departments}
            lines={lines.map((l) => ({ id: l.id, name: l.name }))}
          />
        </div>
      </section>
    </div>
  );
}
