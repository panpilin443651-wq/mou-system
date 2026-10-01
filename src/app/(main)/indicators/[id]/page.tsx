import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  canManageIndicators,
  canManagePlan,
  canSubmitReport,
  canViewDepartment,
  indicatorsMenuLabel,
} from "@/lib/permissions";
import { db } from "@/lib/db";
import { PLAN_SECTION_ITEM_LABEL, summarizeRow, toMonths } from "@/lib/plan";
import { defaultQuarter } from "@/lib/submission-window";
import { isPlaceholderCriteria, targetLabel } from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const metadata = { title: "รายละเอียดตัวชี้วัด | ระบบรายงานผล MOU" };

const QUARTER_LABEL = ["ไตรมาส 1", "ไตรมาส 2", "ไตรมาส 3", "ไตรมาส 4"];

export default async function IndicatorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const indicator = await db.indicator.findUnique({
    where: { id },
    include: {
      department: true,
      fiscalYear: true,
      criteria: { orderBy: { level: "asc" } },
      plans: { orderBy: [{ section: "asc" }, { sortOrder: "asc" }] },
      reports: { orderBy: { quarter: "asc" } },
    },
  });

  if (!indicator) notFound();

  // ตรวจสิทธิ์การมองเห็นที่เซิร์ฟเวอร์
  // ถ้า DEPT_USER เดา URL ของตัวชี้วัดส่วนงานอื่น จะเจอหน้า 404 แทน
  if (!canViewDepartment(user, indicator.departmentId)) notFound();

  const canManage = canManageIndicators(user);
  const isLowerBetter = indicator.direction === "LOWER_IS_BETTER";

  // แสดงคอลัมน์เกณฑ์ตาม MOU เฉพาะเมื่อมีข้อความจริงอย่างน้อยหนึ่งระดับ
  const hasCriteriaText = indicator.criteria.some((c) => !isPlaceholderCriteria(c.description));

  const facts = [
    { label: "ส่วนงาน", value: `${indicator.department.code} ${indicator.department.name}` },
    { label: "ปีบัญชี", value: String(indicator.fiscalYear.year) },
    { label: "มิติ", value: indicator.dimension ?? "-" },
    { label: "หน่วยวัด", value: indicator.unit },
    { label: "น้ำหนัก", value: `${indicator.weight}%` },
    {
      label: "Base line",
      value: indicator.baselineValue === null ? "-" : String(indicator.baselineValue),
    },
    { label: "ค่าเป้าหมาย (ระดับ 3)", value: targetLabel(indicator) },
    { label: "ทิศทาง", value: isLowerBetter ? "ค่าน้อยยิ่งดี" : "ค่ามากยิ่งดี" },
    { label: "การปรับค่าเกณฑ์วัด", value: indicator.adjustmentNote ?? "-" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/indicators" className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline">
          ← กลับไป{user.role === "DEPT_USER" ? indicatorsMenuLabel(user) : "รายการส่วนงานและหน่วยงาน"}
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">
              <span className="text-slate-500">ข้อ {indicator.code}</span> {indicator.name}
            </h1>
            {indicator.groupName && (
              <p className="mt-1 text-sm text-slate-600">อยู่ใต้หัวข้อ: {indicator.groupName}</p>
            )}
            {indicator.status !== "ACTIVE" && (
              <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                {indicator.status === "DRAFT" ? "สถานะ: ร่าง" : "สถานะ: เก็บเข้าคลัง"}
              </span>
            )}
          </div>

          {canManage && (
            <Link
              href={`/indicators/${indicator.id}/edit`}
              className="shrink-0 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50"
            >
              แก้ไข
            </Link>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-slate-500">{f.label}</dt>
              <dd className="mt-0.5 text-sm font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {indicator.description && (
        <section className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold">คำจำกัดความ / สูตรการคำนวณ</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {indicator.description}
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-surface shadow-sm">
        <h2 className="border-b border-slate-200 px-4 py-3 font-semibold sm:px-5">
          ค่าเกณฑ์วัด 5 ระดับ
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="whitespace-nowrap px-4 py-2.5 font-medium sm:px-5">ระดับคะแนน</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                  ค่าเกณฑ์ ({indicator.unit})
                </th>
                {hasCriteriaText && (
                  <th className="px-4 py-2.5 font-medium sm:px-5">เกณฑ์ตาม MOU</th>
                )}
              </tr>
            </thead>
            <tbody>
              {indicator.criteria.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 sm:px-5">
                    ระดับ {c.level}
                    {c.level === 5 && (
                      <span className="ml-2 rounded bg-accent-100 px-1.5 py-0.5 text-xs font-medium text-accent-800">คะแนนเต็ม</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {c.targetValue ?? "-"}
                  </td>
                  {hasCriteriaText && (
                    <td className="px-4 py-2.5 text-slate-700 sm:px-5">
                      {isPlaceholderCriteria(c.description) ? (
                        <span className="text-slate-400">ไม่มีข้อความกำกับใน MOU</span>
                      ) : (
                        c.description
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* เงื่อนไขของตัวชี้วัด ต่อท้ายค่าเกณฑ์ระดับ 5 */}
        {indicator.conditions.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
            <h3 className="text-sm font-semibold">เงื่อนไข</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {indicator.conditions.map((cond, i) => (
                <li key={i}>{cond}</li>
              ))}
            </ol>
          </div>
        )}
        {/* ตัวชี้วัดบางตัวใน MOU ไม่ได้เขียนเกณฑ์เป็นระดับ 1-5
            แต่ให้คะแนนย่อยตามกิจกรรมที่ทำได้ จึงแสดงแยกไว้ตรงนี้ */}
        {indicator.criteriaNote && (
          <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
            <h3 className="text-sm font-semibold">ตารางให้คะแนนย่อยตาม MOU</h3>
            <ul className="mt-2 space-y-1.5">
              {indicator.criteriaNote.split("\n").map((line, i) => {
                const [text, points] = line.split(" — ");
                return (
                  <li key={i} className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-3">
                    <span className="min-w-0 flex-1 text-slate-700">{text}</span>
                    {points && (
                      <span className="shrink-0 rounded bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-900">
                        {points}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-5">
          {isLowerBetter
            ? "ตัวชี้วัดนี้ค่าน้อยยิ่งดี ผลงานที่ต่ำกว่าจะได้คะแนนสูงกว่า"
            : "ตัวชี้วัดนี้ค่ามากยิ่งดี ผลงานที่สูงกว่าจะได้คะแนนสูงกว่า"}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="font-semibold">ผลการดำเนินงานรายไตรมาส</h2>
          <Link
            href={`/reports/${indicator.id}/${defaultQuarter(indicator.fiscalYear.year)}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium transition hover:bg-slate-50"
          >
            {canSubmitReport(user, indicator.departmentId) ? "กรอกผล" : "ดูผลทั้งหมด"}
          </Link>
        </div>
        {indicator.reports.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600 sm:px-5">ยังไม่มีการรายงานผล</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="px-4 py-2.5 font-medium sm:px-5">ไตรมาส</th>
                  <th className="px-3 py-2.5 text-right font-medium">ผลงานจริง</th>
                  <th className="px-3 py-2.5 text-right font-medium">ความก้าวหน้า</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">คะแนน</th>
                </tr>
              </thead>
              <tbody>
                {indicator.reports.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 sm:px-5">{QUARTER_LABEL[r.quarter - 1]}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.actualValue ?? "-"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.progressPct === null ? "-" : `${r.progressPct}%`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums sm:px-5">
                      {r.scoreLevel ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="font-semibold">แผนดำเนินงาน</h2>
          <Link
            href={`/plans/${indicator.id}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium transition hover:bg-slate-50"
          >
            {canManagePlan(user, indicator.departmentId) ? "จัดการแผน" : "ดูแผนทั้งหมด"}
          </Link>
        </div>
        {indicator.plans.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600 sm:px-5">
            ยังไม่มีแผนดำเนินงาน
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {indicator.plans.map((p) => {
              // แสดงความก้าวหน้าทั้งปี (ผลรวม 12 เดือน เทียบแผนรวม 12 เดือน)
              // ไม่ใช่ยอดสะสมถึงเดือนนี้ เพราะหน้านี้เป็นภาพรวมของตัวชี้วัด
              const s = summarizeRow(
                { planMonths: toMonths(p.planMonths), actualMonths: toMonths(p.actualMonths) },
                12
              );
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-slate-500">{PLAN_SECTION_ITEM_LABEL[p.section]}</span> ·{" "}
                    {p.title || "(ยังไม่ได้ตั้งชื่อรายการ)"}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {s.actualYear.toLocaleString("th-TH")} / {s.planYear.toLocaleString("th-TH")}{" "}
                    {p.unit ?? ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
