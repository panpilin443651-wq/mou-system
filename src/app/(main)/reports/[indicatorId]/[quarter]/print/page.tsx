import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canViewDepartment } from "@/lib/permissions";
import { FISCAL_MONTHS, QUARTERS, formatPct, formatPlanNumber } from "@/lib/plan";
import { isPlaceholderCriteria } from "@/lib/scoring";
import {
  getReportDocument,
  type PlanDocRow,
  type PlanDocSection,
} from "@/lib/report-document";
import { Logo } from "@/components/logo";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "พิมพ์รายงานผล | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน" };

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
    <div className="mx-auto max-w-6xl">
      {/* แถบเครื่องมือนี้ไม่ถูกพิมพ์ลงกระดาษ (print:hidden) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <a
          href={`/reports/${ind.id}/${quarter}`}
          className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline"
        >
          ← กลับไปหน้ากรอกผล
        </a>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/export/report/${ind.id}/${quarter}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-surface px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            ดาวน์โหลดเป็น Word
          </a>
          <a
            href={`/api/export/report/${ind.id}/${quarter}/xlsx`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-surface px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            ดาวน์โหลดเป็น Excel
          </a>
          <PrintButton />
        </div>
      </div>

      <p className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900 print:hidden">
        กดปุ่ม &quot;พิมพ์ / บันทึกเป็น PDF&quot; แล้วเลือกปลายทางเป็น
        &quot;บันทึกเป็น PDF&quot; ในหน้าต่างที่เปิดขึ้น จะได้ไฟล์ PDF ที่ภาษาไทยถูกต้องทุกตัว
      </p>

      {/* ---------- ตัวเอกสาร ---------- */}
      <article className="rounded-xl border border-slate-200 bg-surface p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
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
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-2 py-1.5 text-left font-medium">ทิศทาง</th>
                <th className="border border-slate-300 px-2 py-1.5 text-left font-medium">สถานะรายงาน</th>
                <th colSpan={2} className="border border-slate-300 px-2 py-1.5 text-left font-medium">
                  ส่วนงาน/หน่วยงานที่รับผิดชอบ
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left font-medium">งบประมาณ (ถ้ามี)</th>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5">{doc.directionText}</td>
                <td className="border border-slate-300 px-2 py-1.5">{doc.statusText}</td>
                <td colSpan={2} className="border border-slate-300 px-2 py-1.5">{doc.owner || "-"}</td>
                <td className="border border-slate-300 px-2 py-1.5">{doc.budget || "-"}</td>
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
          {doc.returned && (
            <div className="mt-2 text-sm">
              <p className="font-semibold text-red-700">
                ส่วนกลางตีกลับผลไตรมาส {quarter} เมื่อ {doc.returned.label}
              </p>
              {doc.returned.due && (
                <p className="font-semibold text-red-700">! {doc.returned.due}</p>
              )}
              <p className="whitespace-pre-line">
                ข้อสังเกตเพื่อให้ผลมีความชัดเจน: {doc.returned.note}
              </p>
            </div>
          )}
        </section>

        {/* ผลการดำเนินงานตามแผน - แผน/ผล 12 เดือนกว้างเกินกระดาษแนวตั้ง
            จึงขึ้นหน้าใหม่เป็นแนวนอน (@page plan ด้านล่าง) */}
        <section className="mt-8 print:mt-0 print:break-before-page [page:plan]">
          <h2 className="text-base font-semibold">ผลการดำเนินงานตามแผน</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            {doc.uptoText}
            {!doc.planConfirmed && " · ยังไม่ได้ส่งแผนการดำเนินงาน"}
          </p>
          {doc.planSections.map((s) => (
            <PlanSectionTable key={s.section} section={s} />
          ))}
        </section>
      </article>
      <style>{`@page plan { size: A4 landscape; margin: 10mm; }`}</style>
    </div>
  );
}

const td = "border border-slate-300 px-1 py-0.5";

/** ตารางผลการดำเนินงานตามแผน 1 ตาราง (เป้าหมายตัวชี้วัด หรือ ขั้นตอนการดำเนินงาน) */
function PlanSectionTable({ section: s }: { section: PlanDocSection }) {
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold">{s.title}</h3>
      <table className="mt-1 w-full border-collapse text-[10px] leading-tight">
        <thead>
          <tr className="bg-slate-50 text-center">
            <th className={`${td} w-8 font-medium`}>{s.indexLabel}</th>
            <th className={`${td} font-medium`}>{s.itemLabel}</th>
            <th className={`${td} w-14 font-medium`}>ค่าเป้าหมาย</th>
            <th className={`${td} w-8 font-medium`}>แผน/ผล</th>
            {FISCAL_MONTHS.map((m) => (
              <th key={m} className={`${td} w-9 font-medium`}>
                {m}
              </th>
            ))}
            <th className={`${td} w-10 font-medium`}>สะสม</th>
            <th className={`${td} w-14 font-medium`}>{s.cumLabel}</th>
            <th className={`${td} w-10 font-medium`}>ทั้งปี</th>
            <th className={`${td} w-14 font-medium`}>{s.yearLabel}</th>
          </tr>
        </thead>
        {s.groups.map((g, gi) => (
          <tbody key={gi} className="break-inside-avoid-page">
            {g.heading && (
              <tr className="bg-slate-50">
                <td colSpan={PLAN_COLS} className={`${td} whitespace-pre-line font-semibold`}>
                  {g.heading}
                </td>
              </tr>
            )}
            {g.rows.length === 0 && (
              <tr>
                <td colSpan={PLAN_COLS} className={`${td} text-slate-500`}>
                  ไม่มีรายการ
                </td>
              </tr>
            )}
            {g.rows.map((row) => (
              <PlanItemRows key={row.label} row={row} causeLabel={s.causeLabel} />
            ))}
            {g.levelReportLabel && (
              <tr>
                <td colSpan={PLAN_COLS} className={`${td} whitespace-pre-line`}>
                  <span className="font-medium">{g.levelReportLabel}:</span> {g.levelReport || "-"}
                </td>
              </tr>
            )}
          </tbody>
        ))}
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={17} className={td}>
              {s.avgLabel}
            </td>
            <td className={`${td} text-right tabular-nums`}>{formatPct(s.avgCumPct)}</td>
            <td className={td} />
            <td className={`${td} text-right tabular-nums`}>{formatPct(s.avgYearPct)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const PLAN_COLS = 20;

function PlanItemRows({ row, causeLabel }: { row: PlanDocRow; causeLabel: string }) {
  const num = (v: number | null, i: number) => (
    <td key={i} className={`${td} text-right tabular-nums`}>
      {formatPlanNumber(v)}
    </td>
  );
  const hasNotes = row.cause || row.fix || row.evidence.length > 0;
  return (
    <>
      <tr>
        <td rowSpan={2} className={`${td} text-center`}>{row.label}</td>
        <td rowSpan={2} className={td}>{row.title || "-"}</td>
        <td rowSpan={2} className={`${td} text-center`}>
          {[row.target, row.unit].filter(Boolean).join(" ") || "-"}
        </td>
        <td className={`${td} text-center`}>แผน</td>
        {row.planMonths.map(num)}
        {num(row.summary.planCum, -1)}
        <td rowSpan={2} className={`${td} text-right tabular-nums`}>{formatPct(row.summary.cumPct)}</td>
        {num(row.summary.planYear, -2)}
        <td rowSpan={2} className={`${td} text-right tabular-nums`}>{formatPct(row.summary.yearPct)}</td>
      </tr>
      <tr>
        <td className={`${td} text-center`}>ผล</td>
        {row.actualMonths.map(num)}
        {num(row.summary.actualCum, -1)}
        {num(row.summary.actualYear, -2)}
      </tr>
      {hasNotes && (
        <tr>
          <td colSpan={PLAN_COLS} className={`${td} space-y-0.5`}>
            {row.cause && (
              <p className="whitespace-pre-line">
                <span className="font-medium">{causeLabel}:</span> {row.cause}
              </p>
            )}
            {row.fix && (
              <p className="whitespace-pre-line">
                <span className="font-medium">แนวทางการดำเนินการแก้ไข:</span> {row.fix}
              </p>
            )}
            {row.evidence.length > 0 && (
              <p>
                <span className="font-medium">หลักฐานประกอบผลการดำเนินงาน:</span>{" "}
                {row.evidence.join(", ")}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
