import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { activateFiscalYearAction } from "@/actions/fiscal-years";
import { formatThaiDate } from "@/lib/datetime";
import { FiscalYearForm } from "./fiscal-year-form";
import { CopyIndicatorsForm } from "./copy-form";
import { ActivateButton } from "./activate-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "ปีบัญชี | ระบบรายงานผล MOU" };

export default async function FiscalYearsPage() {
  await requireAdmin();

  const years = await db.fiscalYear.findMany({
    orderBy: { year: "desc" },
    include: {
      _count: { select: { indicators: true, windows: true } },
    },
  });

  // เสนอปีถัดไปจากปีล่าสุดที่มีอยู่ ลดโอกาสพิมพ์ผิด
  const latestYear = years[0]?.year;
  const suggestedYear = latestYear ? latestYear + 1 : new Date().getFullYear() + 543;

  const yearOptions = years.map((y) => ({
    id: y.id,
    year: y.year,
    indicatorCount: y._count.indicators,
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline">
          ← กลับไปหน้าตั้งค่าระบบ
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">ปีบัญชี</h1>
        <p className="mt-1 text-sm text-slate-600">
          ปีบัญชีคือกล่องที่แยกข้อมูลของแต่ละปีออกจากกัน ตัวชี้วัด รายงานผล
          และช่วงเวลาเปิด-ปิดระบบทั้งหมดผูกกับปีบัญชีเสมอ
          เพิ่มปีใหม่แล้วข้อมูลปีเก่าจะยังอยู่ครบ
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="px-4 py-2.5 font-medium">ปีบัญชี</th>
              <th className="px-3 py-2.5 font-medium">ช่วงวันที่</th>
              <th className="px-3 py-2.5 text-right font-medium">ตัวชี้วัด</th>
              <th className="px-3 py-2.5 text-right font-medium">ช่วงเปิด-ปิด</th>
              <th className="px-4 py-2.5 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 font-medium tabular-nums">
                  {y.year}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                  {formatThaiDate(y.startDate)} – {formatThaiDate(y.endDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {y._count.indicators.toLocaleString("th-TH")}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {y._count.windows} / 4
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  {y.isActive ? (
                    <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-ink">
                      กำลังใช้งาน
                    </span>
                  ) : (
                    <ActivateButton
                      action={activateFiscalYearAction.bind(null, y.id)}
                      year={y.year}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FiscalYearForm suggestedYear={suggestedYear} />

      <CopyIndicatorsForm years={yearOptions} />
    </div>
  );
}
