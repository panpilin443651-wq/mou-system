import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canManagePlan, canViewDepartment } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getQuarterStatuses, defaultQuarter } from "@/lib/submission-window";
import { PlanTable } from "./plan-table";
import { planInclude, planTableProps } from "./plan-data";
import { PLAN_COMMENT_QUARTER, loadComments } from "@/lib/review-comments";
import { StepTracker } from "@/components/step-tracker";

export const dynamic = "force-dynamic";
export const metadata = { title: "แผนการดำเนินงาน | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน" };

// หน้าแผนการดำเนินงาน (ขั้นตอนที่ 1) แยกจากหน้ารายงานผลการดำเนินงาน (ขั้นตอนที่ 2)
// กรอกส่วนหัว เป้าหมาย ขั้นตอน และแผนรายเดือน · บันทึกร่างแผนไว้ก่อนได้ · ส่งแผนแล้วจึงรายงานผลได้
export default async function IndicatorPlanPage({
  params,
}: {
  params: Promise<{ indicatorId: string }>;
}) {
  const user = await requireUser();
  const { indicatorId } = await params;

  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    include: {
      ...planInclude,
      department: { select: { code: true, name: true } },
    },
  });
  if (!indicator) notFound();
  if (!canViewDepartment(user, indicator.departmentId)) notFound();

  const statuses = await getQuarterStatuses({
    fiscalYearId: indicator.fiscalYearId,
    departmentId: indicator.departmentId,
    actor: user,
  });
  const quarter = defaultQuarter(indicator.fiscalYear.year);
  const confirmed = indicator.planHeader?.confirmedAt != null;
  const canEdit = canManagePlan(user, indicator.departmentId);
  const comments = await loadComments(indicator.id, PLAN_COMMENT_QUARTER);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/plans?dept=${indicator.departmentId}`}
          className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline"
        >
          ← กลับไปรายการแผนการดำเนินงาน
        </Link>

        <p className="mt-2 text-sm font-medium text-brand-ink">แผนการดำเนินงาน</p>
        <h1 className="text-xl font-bold sm:text-2xl">
          <span className="text-slate-500">ข้อ {indicator.code}</span>{" "}
          {indicator.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {indicator.department.code} {indicator.department.name} · ปีบัญชี{" "}
          {indicator.fiscalYear.year}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href={`/indicators/${indicator.id}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-surface px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            ดูรายละเอียดตัวชี้วัด
          </Link>
          <Link
            href={`/reports/${indicator.id}/${quarter}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-brand-600 bg-surface px-4 text-sm font-medium text-brand-ink transition hover:bg-brand-50"
          >
            ไปรายงานผลการดำเนินงาน →
          </Link>
        </div>
      </div>

      {/* ขั้นตอน: 1 กรอกแผน (หน้านี้) → 2 รายงานผล (หน้ารายงานผล) */}
      {canEdit && (
        <StepTracker
          steps={[
            {
              title: "กรอกและส่งแผนการดำเนินงาน",
              here: true,
              state: confirmed ? "done" : "current",
              detail: confirmed
                ? "ส่งแผนแล้ว"
                : "บันทึกร่างแผนไว้ก่อนได้ · กรอกครบแล้วหัวหน้าส่วนงาน/หัวหน้าหน่วยงานกดส่งแผน",
            },
            {
              title: "รายงานผลการดำเนินงาน",
              state: confirmed ? "current" : "upcoming",
              detail: confirmed ? (
                <Link
                  href={`/reports/${indicator.id}/${quarter}`}
                  className="font-medium underline underline-offset-2"
                >
                  ไปรายงานผลไตรมาส {quarter} →
                </Link>
              ) : (
                "ทำได้หลังส่งแผนแล้ว"
              ),
            },
          ]}
        />
      )}

      <PlanTable
        {...planTableProps({ indicator, user, statuses, mode: "plan", comments })}
      />
    </div>
  );
}
