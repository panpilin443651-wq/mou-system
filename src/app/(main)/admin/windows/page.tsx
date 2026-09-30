import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { QUARTER_MONTHS } from "@/lib/plan";
import {
  formatThaiDateTime,
  utcToBangkokDateTimeInput,
} from "@/lib/datetime";
import {
  updateWindowAction,
  addExceptionAction,
  removeExceptionAction,
  type FormState,
} from "@/actions/windows";
import { WindowCard, type Exception } from "./window-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "ช่วงเวลาเปิด-ปิดระบบ | ระบบรายงานผล MOU" };

export default async function WindowsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const years = await db.fiscalYear.findMany({
    orderBy: { year: "desc" },
    select: { id: true, year: true, isActive: true },
  });

  const selectedYear =
    years.find((y) => String(y.year) === sp.year) ??
    years.find((y) => y.isActive) ??
    years[0] ??
    null;

  const [windows, departments] = await Promise.all([
    selectedYear
      ? db.submissionWindow.findMany({
          where: { fiscalYearId: selectedYear.id },
          orderBy: { quarter: "asc" },
          include: {
            exceptions: {
              include: { department: { select: { code: true, name: true } } },
              orderBy: { department: { sortOrder: "asc" } },
            },
          },
        })
      : Promise.resolve([]),
    db.department.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const now = new Date();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline">
          ← กลับไปหน้าตั้งค่าระบบ
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">ช่วงเวลาเปิด-ปิดระบบ</h1>
        <p className="mt-1 text-sm text-slate-600">
          กำหนดว่าแต่ละไตรมาสเปิดให้ส่วนงานกรอกผลและแนบไฟล์ได้ช่วงไหน
          เมื่อเลยเวลาปิดแล้ว ส่วนงานจะบันทึกอะไรไม่ได้เลย แม้จะพยายามข้ามหน้าเว็บก็ตาม
        </p>
        <p className="mt-1 text-sm text-slate-600">
          เวลาที่กรอกทั้งหมดเป็น <strong>เวลาประเทศไทย</strong> ·
          ส่วนกลางยังแก้ข้อมูลได้เสมอแม้เลยเวลาปิด
        </p>
      </div>

      {years.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="เลือกปีบัญชี">
          {years.map((y) => (
            <Link
              key={y.id}
              href={`/admin/windows?year=${y.year}`}
              aria-current={y.id === selectedYear?.id ? "page" : undefined}
              className={
                y.id === selectedYear?.id
                  ? "inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white"
                  : "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-surface px-4 text-sm font-medium transition hover:bg-slate-50"
              }
            >
              ปี {y.year}
              {y.isActive && <span className="ml-1 text-xs opacity-75">(กำลังใช้งาน)</span>}
            </Link>
          ))}
        </nav>
      )}

      {selectedYear === null ? (
        <p className="rounded-xl border border-slate-200 bg-surface p-6 text-sm text-slate-600">
          ยังไม่มีปีบัญชีในระบบ กรุณาเพิ่มปีบัญชีก่อนที่หน้า{" "}
          <Link href="/admin/fiscal-years" className="text-brand-ink hover:underline">
            ปีบัญชี
          </Link>
        </p>
      ) : windows.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          ปีบัญชี {selectedYear.year} ยังไม่มีช่วงเวลาเปิด-ปิด ส่วนงานจะกรอกผลไม่ได้เลย
        </p>
      ) : (
        windows.map((w) => {
          // สถานะตอนนี้ ใช้เวลาปิดเดิม (ไม่รวมการขยายเฉพาะหน่วย)
          // เพราะเป็นภาพรวมของทั้งไตรมาส ไม่ใช่ของส่วนงานใดส่วนงานหนึ่ง
          const isOpen =
            !w.isForceClosed && now >= w.openAt && now <= w.closeAt;
          const statusLabel = w.isForceClosed
            ? "ปิดฉุกเฉินอยู่"
            : now < w.openAt
              ? "ยังไม่ถึงเวลาเปิด"
              : now > w.closeAt
                ? "ปิดรับแล้ว"
                : "เปิดรับอยู่";

          const exceptions: Exception[] = w.exceptions.map((e) => ({
            id: e.id,
            departmentCode: e.department.code,
            departmentName: e.department.name,
            closeAtInput: utcToBangkokDateTimeInput(e.closeAt),
            closeAtLabel: formatThaiDateTime(e.closeAt),
            reason: e.reason,
          }));

          // ผูก id ไว้ตั้งแต่ฝั่งเซิร์ฟเวอร์ ฟอร์มในเบราว์เซอร์จึงแก้ id ไม่ได้
          const removeActions: Record<
            string,
            (prev: FormState, formData: FormData) => Promise<FormState>
          > = {};
          for (const e of w.exceptions) {
            removeActions[e.id] = removeExceptionAction.bind(null, e.id);
          }

          return (
            <WindowCard
              key={w.id}
              quarter={w.quarter}
              months={QUARTER_MONTHS[w.quarter]}
              statusLabel={statusLabel}
              statusTone={isOpen ? "open" : "closed"}
              openAtInput={utcToBangkokDateTimeInput(w.openAt)}
              closeAtInput={utcToBangkokDateTimeInput(w.closeAt)}
              isForceClosed={w.isForceClosed}
              exceptions={exceptions}
              departments={departments}
              updateAction={updateWindowAction.bind(null, w.id)}
              addExceptionAction={addExceptionAction.bind(null, w.id)}
              removeActions={removeActions}
            />
          );
        })
      )}
    </div>
  );
}
