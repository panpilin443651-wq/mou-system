import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/session";
import {
  canManageIndicators,
  canManageMouScores,
  departmentScope,
  indicatorsMenuLabel,
  isDepartmentRole,
} from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  visibleDepartments,
  filterDepartments,
  selectedDepartment,
} from "@/lib/department-picker";
import {
  departmentMouScores,
  latestTotalsByDepartment,
  MOU_QUARTERS,
  type DepartmentMouScores,
} from "@/lib/mou-scores";
import { formatThaiDateTime } from "@/lib/datetime";
import { DepartmentFilters } from "../department-filters";
import { DepartmentList, BackToDepartments, type DepartmentRow } from "../department-list";
import { IndicatorScoreTable } from "./indicator-score-table";
import { MouScoreForm } from "./mou-score-form";

export const dynamic = "force-dynamic";
// ชื่อแท็บต้องตรงกับชื่อเมนูของแต่ละ role จึงต้องสร้างตามผู้ใช้ที่ login อยู่
export async function generateMetadata() {
  const user = await requireUser();
  const title =
    isDepartmentRole(user.role)
      ? indicatorsMenuLabel(user)
      : "ส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน";
  return { title: `${title} | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน` };
}

export default async function IndicatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; edit?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const fiscalYear = await db.fiscalYear.findFirst({ where: { isActive: true } });
  const canManage = canManageIndicators(user);

  const departments = await visibleDepartments(user);
  const matched = filterDepartments(departments, sp.q);
  const current = selectedDepartment(matched, sp.dept);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {isDepartmentRole(user.role)
              ? indicatorsMenuLabel(user)
              : "ส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {fiscalYear ? `ปีบัญชี ${fiscalYear.year}` : "ยังไม่ได้ตั้งปีบัญชี"}
            {current ? ` · ${current.code} ${current.name}` : ` · ${matched.length} ส่วนงาน`}
          </p>
        </div>

        {canManage && (
          <Link
            href="/indicators/new"
            className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            + เพิ่มตัวชี้วัด
          </Link>
        )}
      </div>

      <DepartmentFilters
        basePath="/indicators"
        show={departments.length > 1}
        departments={matched.map((d) => ({ value: d.id, label: `${d.code} ${d.name}` }))}
      />

      {!fiscalYear ? (
        <p className="rounded-xl border border-slate-200 bg-surface p-6 text-sm text-slate-600">
          ยังไม่ได้ตั้งปีบัญชีที่ใช้งานอยู่ ตั้งได้ที่เมนู ตั้งค่าระบบ
        </p>
      ) : current === null ? (
        <DepartmentSummary
          fiscalYearId={fiscalYear.id}
          user={user}
          departments={matched}
        />
      ) : (
        <DepartmentScores
          fiscalYearId={fiscalYear.id}
          department={current}
          showBack={departments.length > 1}
          canEdit={canManageMouScores(user)}
          editQuarter={parseQuarter(sp.edit)}
          searchQuery={sp.q}
        />
      )}
    </div>
  );
}

/** อ่านไตรมาสจาก ?edit= - คืน null ถ้าไม่ได้สั่งแก้ไขหรือเลขไม่ถูกต้อง */
function parseQuarter(raw: string | undefined): number | null {
  const n = Number(raw);
  return MOU_QUARTERS.includes(n as (typeof MOU_QUARTERS)[number]) ? n : null;
}

/** ชั้นที่ 1 - รายชื่อส่วนงาน พร้อมจำนวนตัวชี้วัด น้ำหนักรวม และคะแนนงวดล่าสุด */
async function DepartmentSummary({
  fiscalYearId,
  user,
  departments,
}: {
  fiscalYearId: number;
  user: Parameters<typeof departmentScope>[0];
  departments: { id: string; code: string; name: string }[];
}) {
  const where: Prisma.IndicatorWhereInput = { fiscalYearId, ...departmentScope(user) };

  // นับทีเดียวทุกหน่วย แทนการยิงคำถามทีละส่วนงาน 30 รอบ
  const [grouped, latestTotals] = await Promise.all([
    db.indicator.groupBy({
      by: ["departmentId"],
      where,
      _count: { _all: true },
      _sum: { weight: true },
    }),
    latestTotalsByDepartment(fiscalYearId),
  ]);

  const byDepartment = new Map(grouped.map((g) => [g.departmentId, g]));

  const rows: DepartmentRow[] = departments.map((d) => {
    const g = byDepartment.get(d.id);
    const total = latestTotals.get(d.id);

    return {
      id: d.id,
      code: d.code,
      name: d.name,
      stats: [
        { label: "ตัวชี้วัด", value: (g?._count._all ?? 0).toLocaleString("th-TH") },
        { label: "น้ำหนักรวม", value: `${g?._sum.weight ?? 0}%` },
        {
          label: "คะแนนล่าสุด",
          value: total ? `${total.value.toFixed(3)} (${total.label})` : "–",
        },
      ],
    };
  });

  return (
    <DepartmentList
      rows={rows}
      hrefFor={(id) => `/indicators?dept=${id}`}
      emptyText="ไม่พบส่วนงานหรือหน่วยงานตามคำค้น"
    />
  );
}

/** ชั้นที่ 2 - คะแนนรายตัวชี้วัดของส่วนงานที่เลือก (และโหมดแก้ไขของส่วนกลาง) */
async function DepartmentScores({
  fiscalYearId,
  department,
  showBack,
  canEdit,
  editQuarter,
  searchQuery,
}: {
  fiscalYearId: number;
  department: { id: string; code: string; name: string };
  showBack: boolean;
  canEdit: boolean;
  editQuarter: number | null;
  searchQuery: string | undefined;
}) {
  const scores = await departmentMouScores(fiscalYearId, department.id);

  function link(params: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    if (searchQuery) next.set("q", searchQuery);
    next.set("dept", department.id);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) next.set(key, value);
    }
    return `/indicators?${next.toString()}`;
  }

  if (scores.rows.length === 0) {
    return (
      <div className="space-y-4">
        {showBack && <BackToDepartments href="/indicators" />}
        <p className="rounded-xl border border-slate-200 bg-surface p-6 text-sm text-slate-600">
          ส่วนงานนี้ยังไม่มีตัวชี้วัดในปีบัญชีที่ใช้งานอยู่
        </p>
      </div>
    );
  }

  // โหมดแก้ไข - เฉพาะส่วนกลาง และต้องระบุไตรมาสมาด้วย
  if (editQuarter !== null && canEdit) {
    return (
      <div className="space-y-4">
        <Link
          href={link({})}
          className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline"
        >
          ← กลับไปหน้าคะแนน
        </Link>

        <div>
          <h2 className="text-base font-semibold">กรอกคะแนนไตรมาส {editQuarter}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {department.code} {department.name} · {scores.rows.length} ตัวชี้วัด
          </p>
        </div>

        <QuarterTabs current={editQuarter} link={link} />

        <MouScoreForm
          departmentId={department.id}
          quarter={editQuarter}
          rows={scores.rows}
          backHref={link({})}
        />
      </div>
    );
  }

  // ถ้ายังไม่มีข้อมูลสักไตรมาส ให้แสดงไตรมาส 2-4 ไว้เป็นโครงตาม MOU ปีนี้
  const quarters = scores.quartersWithData.length > 0 ? scores.quartersWithData : [2, 3, 4];

  // งวดท้ายสุดที่มีตัวเลข - งวดที่ยังไม่ถึงกำหนดประเมินจะว่างไว้
  const latest = [...scores.totals.cumulative]
    .reverse()
    .find((c): c is { label: string; value: number } => c.value !== null);

  return (
    <div className="space-y-4">
      {showBack && <BackToDepartments href="/indicators" />}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">คะแนนรายตัวชี้วัด</h2>
        {latest && (
          <p className="text-sm text-slate-600">
            คะแนนรวมงวด {latest.label}{" "}
            <span className="font-semibold text-brand-ink">{latest.value.toFixed(3)}</span> จาก 5
          </p>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-surface p-3">
          <span className="px-1 text-sm text-slate-600">กรอก / แก้คะแนน:</span>
          <QuarterTabs current={null} link={link} />
        </div>
      )}

      <IndicatorScoreTable scores={scores} quarters={quarters} />

      <p className="text-xs text-slate-500">
        คะแนนชุดนี้เป็นคะแนนที่ส่วนกลางประเมิน คนละชุดกับผลที่ส่วนงานกรอกในเมนู
        &quot;รายงานผล&quot; · ช่องว่างคือยังไม่ประเมิน ไม่ใช่ได้ 0 คะแนน ·
        คะแนนถ่วงน้ำหนักสะสมคำนวณจาก ผล × น้ำหนัก ÷ 100
        {scores.lastEdit && (
          <>
            {" · แก้ล่าสุด "}
            {formatThaiDateTime(scores.lastEdit.at)}
            {scores.lastEdit.by ? ` โดย ${scores.lastEdit.by}` : ""}
          </>
        )}
      </p>
    </div>
  );
}

/** ปุ่มเลือกไตรมาสที่จะกรอก */
function QuarterTabs({
  current,
  link,
}: {
  current: number | null;
  link: (params: Record<string, string | undefined>) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {MOU_QUARTERS.map((q) => (
        <Link
          key={q}
          href={link({ edit: String(q) })}
          className={
            q === current
              ? "inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white"
              : "inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium transition hover:bg-slate-50"
          }
        >
          ไตรมาส {q}
        </Link>
      ))}
    </div>
  );
}

export type { DepartmentMouScores };
