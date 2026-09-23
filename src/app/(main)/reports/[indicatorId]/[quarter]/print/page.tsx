import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canViewDepartment } from "@/lib/permissions";
import { QUARTERS } from "@/lib/plan";
import { isPlaceholderCriteria } from "@/lib/scoring";
import {
  getReportDocument,
} from "@/lib/report-document";
import { Logo } from "@/components/logo";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "พิมพ์รายงานผล | ระบบรายงานผล MOU" };

// ============================================================================
// หน้าสำหรับพิมพ์ / บันทึกเป็น PDF
// ============================================================================
// ทำไมไม่สร้างไฟล์ PDF จากเซิร์ฟเวอร์โดยตรง?
//   ภาษาไทยมีสระและวรรณยุกต์ซ้อนกันหลายชั้น ไลบรารีสร้าง PDF ทั่วไป
//   วางตำแหน่งสระบนล่างไม่ถูก ทำให้เอกสารราชการอ่านเพี้ยน
//   การให้เบราว์เซอร์พิมพ์เองใช้กลไกจัดวางตัวอักษรของระบบปฏิบัติการ
//   ซึ่งวางภาษาไทยได้ถูกต้องเสมอ แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์
// ============================================================================

export default async function PrintReportPage({
  params,
}: {
  params: Promise<{ indicatorId: string; quarter: string }>;
}) {
  const user = await requireUser();
  const { indicatorId, quarter: quarterParam } = await params;

  const quarter = Number(quarterParam);
  if (!QUARTERS.includes(quarter as (typeof QUARTERS)[number])) notFound();

  const doc = await getReportDocument(indicatorId, quarter);
  if (!doc) notFound();
  if (!canViewDepartment(user, doc.indicator.departmentId)) notFound();

  const { indicator: ind, report: r } = doc;

  return (
    <div className="mx-auto max-w-4xl">
      {/* แถบเครื่องมือนี้ไม่ถูกพิมพ์ลงกระดาษ (print:hidden) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <a
          href={`/reports/${ind.id}/${quarter}`}
          className="inline-flex min-h-11 items-center text-sm text-brand-800 hover:underline"
        >
          ← กลับไปหน้ากรอกผล
        </a>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/export/report/${ind.id}/${quarter}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            ดาวน์โหลดเป็น Word
          </a>
          <PrintButton />
        </div>
      </div>

      <p className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900 print:hidden">
        กดปุ่ม &quot;พิมพ์ / บันทึกเป็น PDF&quot; แล้วเลือกปลายทางเป็น
        &quot;บันทึกเป็น PDF&quot; ในหน้าต่างที่เปิดขึ้น จะได้ไฟล์ PDF ที่ภาษาไทยถูกต้องทุกตัว
      </p>

      {/* ---------- ตัวเอกสาร ---------- */}
      <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="text-center">
          <Logo variant="full" size={96} className="mx-auto mb-3 h-24 w-24" />
          <h1 className="text-lg font-bold">{doc.title}</h1>
          <p className="mt-1 text-sm text-slate-700">{doc.subtitle}</p>
        </header>

        <section className="mt-6">
          <h2 className="text-base font-semibold">ข้อมูลตัวชี้วัด</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                {["ตัวชี้วัด", "หน่วยวัด", "น้ำหนัก (%)", "ค่าเป้าหมาย", `ผลไตรมาส ${quarter}`].map(
                  (h) => (
                    <th key={h} className="border border-slate-300 px-2 py-1.5 text-left font-medium">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5">
                  ข้อ {ind.code} {ind.name}
                </td>
                <td className="border border-slate-300 px-2 py-1.5">{ind.unit}</td>
                <td className="border border-slate-300 px-2 py-1.5 tabular-nums">{ind.weight}</td>
                <td className="border border-slate-300 px-2 py-1.5 tabular-nums">
                  {ind.targetValue ?? ind.targetText ?? "-"}
                </td>
                <td className="border border-slate-300 px-2 py-1.5 tabular-nums">
                  {r?.actualValue ?? "-"}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-5">
          <h2 className="text-base font-semibold">ค่าเกณฑ์วัด 5 ระดับ</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="w-20 border border-slate-300 px-2 py-1.5 text-left font-medium">
                  ระดับ
                </th>
                <th className="w-28 border border-slate-300 px-2 py-1.5 text-left font-medium">
                  ค่าเกณฑ์ ({ind.unit})
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left font-medium">
                  เกณฑ์ตาม MOU
                </th>
              </tr>
            </thead>
            <tbody>
              {ind.criteria.map((c) => (
                <tr key={c.id}>
                  <td className="border border-slate-300 px-2 py-1.5">ระดับ {c.level}</td>
                  <td className="border border-slate-300 px-2 py-1.5 tabular-nums">
                    {c.targetValue ?? "-"}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5">
                    {isPlaceholderCriteria(c.description) ? "-" : c.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ind.conditions.length > 0 && (
            <div className="mt-2 break-inside-avoid text-sm">
              <p className="font-medium">เงื่อนไข</p>
              <ol className="list-decimal pl-5">
                {ind.conditions.map((cond, i) => (
                  <li key={i}>{cond}</li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section className="mt-5">
          <h2 className="text-base font-semibold">สรุปผล</h2>
          <p className="mt-1 text-sm">
            ความก้าวหน้า {r?.progressPct === null || r === null ? "-" : `${r.progressPct}%`} ·
            คะแนนที่ได้ {doc.scoreText} · {doc.submittedText}
          </p>
          {r?.scoreOverridden && r.scoreNote && (
            <p className="mt-1 text-sm">หมายเหตุ: คะแนนถูกปรับด้วยมือ — {r.scoreNote}</p>
          )}
        </section>

      </article>
    </div>
  );
}
