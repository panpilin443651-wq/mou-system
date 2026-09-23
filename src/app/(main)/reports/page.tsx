import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { departmentScope } from "@/lib/permissions";
import { db } from "@/lib/db";
import { QUARTERS } from "@/lib/plan";
import { scoreClass, weightedScore } from "@/lib/scoring";
import { formatPct, summarizeSection, toMonths } from "@/lib/plan";
import { compareCode } from "@/lib/mou-scores";
import {
  visibleDepartments,
  filterDepartments,
  selectedDepartment,
} from "@/lib/department-picker";
import { DepartmentFilters } from "../department-filters";
import { DepartmentList, BackToDepartments, type DepartmentRow } from "../department-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "รายงานผลการดำเนินงาน | ระบบรายงานผล MOU" };

// หน้านี้รวมเมนู "รายงานผล" กับ "แผนดำเนินงาน" ไว้ที่เดียว
// เพราะทั้งสองทำงานกับตัวชี้วัดชุดเดียวกันของส่วนงานเดียวกัน ผู้ใช้จะได้ไม่ต้องสลับเมนูไปมา
// หน้ากรอกยังแยกกันเหมือนเดิม: /reports/[id]/[ไตรมาส] กับ /plans/[id]

const PAGE_SIZE = 50;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; page?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const fiscalYear = await db.fiscalYear.findFirst({ where: { isActive: true } });
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const departments = await visibleDepartments(user);
  const matched = filterDepartments(departments, sp.q);
  const current = selectedDepartment(matched, sp.dept);

  // departmentScope บังคับให้ DEPT_USER เห็นเฉพาะของตัวเองเสมอ
  const baseWhere: Prisma.IndicatorWhereInput = {
    ...(fiscalYear ? { fiscalYearId: fiscalYear.id } : {}),
    status: { not: "ARCHIVED" },
    ...departmentScope(user),
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">รายงานผลการดำเนินงาน</h1>
        <p className="mt-1 text-sm text-slate-600">
          {fiscalYear ? `ปีบัญชี ${fiscalYear.year}` : "ยังไม่ได้ตั้งปีบัญชี"}
          {current
            ? ` · ${current.code} ${current.name} · กดช่องไตรมาสเพื่อกรอกผล หรือกดช่องแผนเพื่อวางแผน`
            : ` · เลือกส่วนงานเพื่อกรอกผลและวางแผน`}
        </p>
      </div>

      <DepartmentFilters
        basePath="/reports"
        show={departments.length > 1}
        departments={matched.map((d) => ({ value: d.id, label: `${d.code} ${d.name}` }))}
      />

      {current === null ? (
        <DepartmentSummary baseWhere={baseWhere} departments={matched} />
      ) : (
        <ReportTable
          baseWhere={baseWhere}
          departmentId={current.id}
          page={page}
          showBack={departments.length > 1}
          searchQuery={sp.q}
        />
      )}
    </div>
  );
}

/** ชั้นที่ 1 - รายชื่อส่วนงาน พร้อมความคืบหน้าการส่งผลของแต่ละหน่วย */
async function DepartmentSummary({
  baseWhere,
  departments,
}: {
  baseWhere: Prisma.IndicatorWhereInput;
  departments: { id: string; code: string; name: string }[];
}) {
  // นับทีเดียวทุกหน่วย แทนการยิงคำถามทีละส่วนงาน
  const [totals, submitted, planned] = await Promise.all([
    db.indicator.groupBy({
      by: ["departmentId"],
      where: baseWhere,
      _count: { _all: true },
    }),
    db.indicator.groupBy({
      by: ["departmentId"],
      where: { ...baseWhere, reports: { some: { status: "SUBMITTED" } } },
      _count: { _all: true },
    }),
    db.indicator.groupBy({
      by: ["departmentId"],
      where: { ...baseWhere, plans: { some: {} } },
      _count: { _all: true },
    }),
  ]);

  const totalBy = new Map(totals.map((g) => [g.departmentId, g._count._all]));
  const submittedBy = new Map(submitted.map((g) => [g.departmentId, g._count._all]));
  const plannedBy = new Map(planned.map((g) => [g.departmentId, g._count._all]));

  const rows: DepartmentRow[] = departments.map((d) => {
    const total = totalBy.get(d.id) ?? 0;
    const done = submittedBy.get(d.id) ?? 0;
    const plannedCount = plannedBy.get(d.id) ?? 0;
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      stats: [
        { label: "ตัวชี้วัด", value: total.toLocaleString("th-TH") },
        { label: "วางแผนแล้ว", value: total === 0 ? "–" : `${plannedCount}/${total}` },
        { label: "ส่งผลแล้ว", value: total === 0 ? "–" : `${done}/${total}` },
      ],
    };
  });

  return (
    <DepartmentList
      rows={rows}
      hrefFor={(id) => `/reports?dept=${id}`}
      emptyText="ไม่พบส่วนงานหรือหน่วยงานตามคำค้น"
    />
  );
}

/** ชั้นที่ 2 - ตัวชี้วัดของส่วนงานที่เลือก พร้อมสถานะแผนและผลรายไตรมาส */
async function ReportTable({
  baseWhere,
  departmentId,
  page,
  showBack,
  searchQuery,
}: {
  baseWhere: Prisma.IndicatorWhereInput;
  departmentId: string;
  page: number;
  showBack: boolean;
  searchQuery: string | undefined;
}) {
  const where: Prisma.IndicatorWhereInput = { ...baseWhere, departmentId };

  const [total, indicators] = await Promise.all([
    db.indicator.count({ where }),
    db.indicator.findMany({
      where,
      include: {
        reports: { select: { quarter: true, status: true, scoreLevel: true } },
        plans: { select: { planMonths: true, actualMonths: true } },
      },
      orderBy: { code: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageLink(target: number) {
    const next = new URLSearchParams();
    if (searchQuery) next.set("q", searchQuery);
    next.set("dept", departmentId);
    next.set("page", String(target));
    return `/reports?${next.toString()}`;
  }

  return (
    <div className="space-y-4">
      {showBack && <BackToDepartments href="/reports" />}

      <p className="text-sm text-slate-600">พบ {total.toLocaleString("th-TH")} ตัวชี้วัด</p>

      {indicators.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          ส่วนงานนี้ยังไม่มีตัวชี้วัดในปีบัญชีที่ใช้งานอยู่
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[54rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="px-4 py-2.5 font-medium">ข้อ</th>
                  <th className="px-3 py-2.5 font-medium">ชื่อตัวชี้วัด</th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-center font-medium">แผนดำเนินงาน</th>
                  {QUARTERS.map((q) => (
                    <th key={q} className="whitespace-nowrap px-2 py-2.5 text-center font-medium">
                      ไตรมาส {q}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">คะแนนถ่วงน้ำหนัก</th>
                </tr>
              </thead>
              <tbody>
                {/* เรียงเลขข้อแบบตัวเลข ฐานข้อมูลเรียงแบบตัวอักษรทำให้ "10" มาก่อน "2" */}
                {[...indicators].sort((a, b) => compareCode(a.code, b.code)).map((ind) => {
                  // ใช้คะแนนของไตรมาสล่าสุดที่ส่งแล้ว เป็นตัวแทนคะแนนสะสมของตัวชี้วัดนี้
                  const submitted = ind.reports
                    .filter((r) => r.status === "SUBMITTED" && r.scoreLevel !== null)
                    .sort((a, b) => b.quarter - a.quarter);
                  const latest = submitted[0] ?? null;
                  const weighted = weightedScore(latest?.scoreLevel ?? null, ind.weight);
                  // สูตรเดียวกับหน้าแผนและไฟล์ Excel เทียบผลทั้งปีกับแผนทั้งปี
                  const plan = summarizeSection(
                    ind.plans.map((p) => ({
                      planMonths: toMonths(p.planMonths),
                      actualMonths: toMonths(p.actualMonths),
                    })),
                    12
                  );

                  return (
                    <tr
                      key={ind.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{ind.code}</td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/reports/${ind.id}/1`}
                          className="-my-2.5 block py-3 text-brand-800 underline-offset-2 hover:underline"
                        >
                          {ind.name}
                        </Link>
                      </td>

                      <td className="whitespace-nowrap px-2 py-2.5 text-center">
                        <Link
                          href={`/reports/${ind.id}/1#plan`}
                          className="-my-2.5 inline-flex min-h-11 items-center justify-center rounded px-2 text-xs font-medium transition hover:ring-1 hover:ring-brand-600"
                          title="วางแผนและติดตามแผนดำเนินงาน"
                        >
                          {plan.count === 0 ? (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                              ยังไม่วางแผน
                            </span>
                          ) : (
                            <span className="rounded bg-brand-50 px-1.5 py-0.5 tabular-nums text-brand-800">
                              {plan.count} รายการ · {formatPct(plan.avgYearPct)}
                            </span>
                          )}
                        </Link>
                      </td>

                      {QUARTERS.map((q) => {
                        const r = ind.reports.find((x) => x.quarter === q);
                        return (
                          <td key={q} className="whitespace-nowrap px-2 py-2.5 text-center">
                            <Link
                              href={`/reports/${ind.id}/${q}`}
                              className="-my-2.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded text-xs font-medium transition hover:ring-1 hover:ring-brand-600"
                              title={`กรอกผลไตรมาส ${q}`}
                            >
                              {r === undefined ? (
                                <span className="text-slate-300">–</span>
                              ) : r.status === "DRAFT" ? (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                                  ร่าง
                                </span>
                              ) : (
                                <span
                                  className={`rounded px-1.5 py-0.5 ${scoreClass(r.scoreLevel)}`}
                                >
                                  {r.scoreLevel ?? "-"}
                                </span>
                              )}
                            </Link>
                          </td>
                        );
                      })}

                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                        {weighted === null ? (
                          <span className="text-slate-300">–</span>
                        ) : (
                          weighted.toFixed(2)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            ช่องแผนดำเนินงานบอกจำนวนรายการในแผน และผลเทียบแผนทั้งปี · ตัวเลขในช่องไตรมาสคือคะแนน 1–5 ที่ได้ · &quot;ร่าง&quot; คือกรอกไว้แล้วแต่ยังไม่ได้ส่ง ·
            คะแนนถ่วงน้ำหนัก = คะแนนของไตรมาสล่าสุดที่ส่งแล้ว × น้ำหนัก ÷ 100
          </p>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600">
                หน้า {page} จาก {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={pageLink(page - 1)}
                    className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 transition hover:bg-slate-50"
                  >
                    ก่อนหน้า
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={pageLink(page + 1)}
                    className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 transition hover:bg-slate-50"
                  >
                    ถัดไป
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
