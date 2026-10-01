import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { departmentScope } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatPlanNumber } from "@/lib/plan";
import { formatThaiDateTime } from "@/lib/datetime";
import { compareCode } from "@/lib/mou-scores";
import {
  visibleDepartments,
  filterDepartments,
  selectedDepartment,
} from "@/lib/department-picker";
import { DepartmentFilters } from "../department-filters";
import { DepartmentList, BackToDepartments, type DepartmentRow } from "../department-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "แผนการดำเนินงาน | ระบบรายงานผล MOU" };

// เมนู "แผนการดำเนินงาน" (ขั้นตอนที่ 1) แยกจากเมนู "รายงานผลการดำเนินงาน" (ขั้นตอนที่ 2)
// ชั้นที่ 1 รายชื่อส่วนงาน + จำนวนตัวชี้วัดที่ยืนยันแผนแล้ว · ชั้นที่ 2 ตัวชี้วัดของส่วนงาน + สถานะแผน
// หน้ากรอกแผนของแต่ละตัวชี้วัดอยู่ที่ /plans/[id]

const PAGE_SIZE = 50;

export default async function PlansPage({
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
        <h1 className="text-xl font-bold sm:text-2xl">แผนการดำเนินงาน</h1>
        <p className="mt-1 text-sm text-slate-600">
          {fiscalYear ? `ปีบัญชี ${fiscalYear.year}` : "ยังไม่ได้ตั้งปีบัญชี"}
          {current
            ? ` · ${current.code} ${current.name} · กดชื่อตัวชี้วัดเพื่อกรอกแผน`
            : " · เลือกส่วนงานเพื่อกรอกแผนการดำเนินงาน"}
        </p>
      </div>

      <DepartmentFilters
        basePath="/plans"
        show={departments.length > 1}
        departments={matched.map((d) => ({ value: d.id, label: `${d.code} ${d.name}` }))}
      />

      {current === null ? (
        <DepartmentSummary baseWhere={baseWhere} departments={matched} />
      ) : (
        <PlanList
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

/** ชั้นที่ 1 - รายชื่อส่วนงาน พร้อมจำนวนตัวชี้วัดที่วางแผน/ยืนยันแผนแล้ว */
async function DepartmentSummary({
  baseWhere,
  departments,
}: {
  baseWhere: Prisma.IndicatorWhereInput;
  departments: { id: string; code: string; name: string }[];
}) {
  const [totals, planned, confirmed] = await Promise.all([
    db.indicator.groupBy({
      by: ["departmentId"],
      where: baseWhere,
      _count: { _all: true },
    }),
    db.indicator.groupBy({
      by: ["departmentId"],
      where: { ...baseWhere, plans: { some: {} } },
      _count: { _all: true },
    }),
    db.indicator.groupBy({
      by: ["departmentId"],
      where: { ...baseWhere, planHeader: { confirmedAt: { not: null } } },
      _count: { _all: true },
    }),
  ]);

  const totalBy = new Map(totals.map((g) => [g.departmentId, g._count._all]));
  const plannedBy = new Map(planned.map((g) => [g.departmentId, g._count._all]));
  const confirmedBy = new Map(confirmed.map((g) => [g.departmentId, g._count._all]));

  const rows: DepartmentRow[] = departments.map((d) => {
    const total = totalBy.get(d.id) ?? 0;
    const fraction = (n: number) => (total === 0 ? "–" : `${n}/${total}`);
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      stats: [
        { label: "ตัวชี้วัด", value: total.toLocaleString("th-TH") },
        { label: "วางแผนแล้ว", value: fraction(plannedBy.get(d.id) ?? 0) },
        { label: "ยืนยันแผนแล้ว", value: fraction(confirmedBy.get(d.id) ?? 0) },
      ],
    };
  });

  return (
    <DepartmentList
      rows={rows}
      hrefFor={(id) => `/plans?dept=${id}`}
      emptyText="ไม่พบส่วนงานหรือหน่วยงานตามคำค้น"
    />
  );
}

/** ชั้นที่ 2 - ตัวชี้วัดของส่วนงานที่เลือก พร้อมสถานะแผน */
async function PlanList({
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
        plans: { select: { section: true } },
        planHeader: { select: { budget: true, confirmedAt: true } },
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
    return `/plans?${next.toString()}`;
  }

  return (
    <div className="space-y-4">
      {showBack && <BackToDepartments href="/plans" />}

      <p className="text-sm text-slate-600">พบ {total.toLocaleString("th-TH")} ตัวชี้วัด</p>

      {indicators.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-surface p-6 text-sm text-slate-600">
          ส่วนงานนี้ยังไม่มีตัวชี้วัดในปีบัญชีที่ใช้งานอยู่
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="px-4 py-2.5 font-medium">ข้อ</th>
                  <th className="px-3 py-2.5 font-medium">ชื่อตัวชี้วัด</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">เป้าหมาย</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">ขั้นตอน</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">งบประมาณ</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">สถานะแผน</th>
                </tr>
              </thead>
              <tbody>
                {/* เรียงเลขข้อแบบตัวเลข ฐานข้อมูลเรียงแบบตัวอักษรทำให้ "10" มาก่อน "2" */}
                {[...indicators].sort((a, b) => compareCode(a.code, b.code)).map((ind) => {
                  const targets = ind.plans.filter((p) => p.section === "TARGET").length;
                  const steps = ind.plans.length - targets;
                  const confirmedAt = ind.planHeader?.confirmedAt ?? null;
                  return (
                    <tr
                      key={ind.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{ind.code}</td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/plans/${ind.id}`}
                          className="-my-2.5 block py-3 text-brand-ink underline-offset-2 hover:underline"
                        >
                          {ind.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {formatPlanNumber(targets)}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {formatPlanNumber(steps)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {ind.planHeader?.budget || <span className="text-slate-300">–</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs font-medium">
                        {confirmedAt ? (
                          <span
                            className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-ink"
                            title={`ยืนยันเมื่อ ${formatThaiDateTime(confirmedAt)}`}
                          >
                            ✓ ยืนยันแผนแล้ว
                          </span>
                        ) : ind.plans.length === 0 ? (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                            ยังไม่วางแผน
                          </span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                            ร่างแผน (ยังไม่ยืนยัน)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            กรอกแผนการดำเนินงานแล้วกดบันทึกร่างแผนไว้ก่อนได้ · กรอกครบแล้วกดยืนยันแผน
            จึงรายงานผลการดำเนินงานได้ (เมนูรายงานผลการดำเนินงาน) · ยืนยันแล้วแผนถูกล็อก ติดต่อส่วนกลางหากต้องแก้
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
