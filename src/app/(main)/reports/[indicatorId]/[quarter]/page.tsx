import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  canManagePlan,
  canSubmitReport,
  canViewDepartment,
} from "@/lib/permissions";
import { db } from "@/lib/db";
import { saveReportAction, reopenReportAction } from "@/actions/reports";
import {
  QUARTERS,
  QUARTER_MONTHS,
  currentFiscalMonthIndex,
  toMonths,
} from "@/lib/plan";
import { savePlanAction } from "@/actions/plans";
import { PlanTable } from "../../../plans/[indicatorId]/plan-table";
import {
  isPlaceholderCriteria,
  scoreClass,
  scoreLabel,
  targetLabel,
} from "@/lib/scoring";
import { formatThaiDateTime } from "@/lib/datetime";
import { getWindowStatus } from "@/lib/submission-window";
import { ReportForm } from "./report-form";
import { ReopenButton } from "./reopen-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "กรอกผลการดำเนินงาน | ระบบรายงานผล MOU" };

export default async function ReportPage({
  params,
}: {
  params: Promise<{ indicatorId: string; quarter: string }>;
}) {
  const user = await requireUser();
  const { indicatorId, quarter: quarterParam } = await params;

  const quarter = Number(quarterParam);
  if (!QUARTERS.includes(quarter as (typeof QUARTERS)[number])) notFound();

  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    include: {
      department: { select: { code: true, name: true } },
      fiscalYear: { select: { year: true } },
      criteria: { orderBy: { level: "asc" } },
      planHeader: true,
      plans: {
        orderBy: [{ section: "asc" }, { criteriaLevel: "asc" }, { sortOrder: "asc" }],
        include: {
          attachments: {
            orderBy: { uploadedAt: "asc" },
            select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
          },
        },
      },
      planLevelReports: { select: { level: true, text: true } },
      reports: { where: { quarter } },
    },
  });

  if (!indicator) notFound();

  // ตรวจสิทธิ์การมองเห็นที่เซิร์ฟเวอร์ก่อนเสมอ
  if (!canViewDepartment(user, indicator.departmentId)) notFound();

  // สิทธิ์ + ช่วงเวลา ต้องผ่านทั้งคู่จึงจะแก้ไขได้
  // (ส่วนกลางผ่านช่วงเวลาเสมอ เพราะเป็นคนคุมการเปิด-ปิดเอง)
  const window = await getWindowStatus({
    fiscalYearId: indicator.fiscalYearId,
    quarter,
    departmentId: indicator.departmentId,
    actor: user,
  });
  const hasPermission = canSubmitReport(user, indicator.departmentId);
  const canEdit = hasPermission && window.canWrite;
  const report = indicator.reports[0] ?? null;
  const isSubmitted = report?.status === "SUBMITTED";

  // แผนดำเนินงานของตัวชี้วัดเดียวกัน แสดงในหน้านี้เลย ไม่ต้องสลับไปอีกหน้า
  // สิทธิ์แก้แผนแยกจากสิทธิ์กรอกผล และไม่ผูกกับช่วงเวลาเปิด-ปิดรับผลรายไตรมาส
  const canEditPlan = canManagePlan(user, indicator.departmentId);
  const planSection = (
    // key จำเป็น: ส่วนนี้ถูกส่งเข้า ReportForm เป็น prop ถ้าไม่มี key React จะเตือนเรื่อง key ในโหมด dev
    <section key="plan" id="plan" className="scroll-mt-4">
      <PlanTable
        action={savePlanAction.bind(null, indicator.id)}
        canEdit={canEditPlan}
        header={{
          owner: indicator.planHeader?.owner ?? "",
          budget: indicator.planHeader?.budget ?? "",
        }}
        rows={indicator.plans.map((p) => ({
          id: p.id,
          section: p.section,
          sortOrder: p.sortOrder,
          criteriaLevel: p.criteriaLevel,
          title: p.title,
          targetValue: p.targetValue,
          unit: p.unit,
          planMonths: toMonths(p.planMonths),
          actualMonths: toMonths(p.actualMonths),
          causeNote: p.causeNote,
          correctiveAction: p.correctiveAction,
          attachments: p.attachments,
        }))}
        criteria={indicator.criteria.map((c) => ({ level: c.level }))}
        levelReports={Object.fromEntries(
          indicator.planLevelReports.map((r) => [r.level, r.text])
        )}
        monthsElapsed={currentFiscalMonthIndex(indicator.fiscalYear.year)}
        fiscalYear={indicator.fiscalYear.year}
        indicatorId={indicator.id}
      />
    </section>
  );

  const submitter = report?.submittedById
    ? await db.user.findUnique({
        where: { id: report.submittedById },
        select: { name: true },
      })
    : null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/reports?dept=${indicator.departmentId}`}
          className="inline-flex min-h-11 items-center text-sm text-brand-800 hover:underline"
        >
          ← กลับไปรายการรายงานผลและแผนดำเนินงาน
        </Link>

        <h1 className="mt-2 text-xl font-bold sm:text-2xl">
          <span className="text-slate-500">ข้อ {indicator.code}</span>{" "}
          {indicator.name}
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          {indicator.department.code} {indicator.department.name} · ปีบัญชี{" "}
          {indicator.fiscalYear.year}
        </p>

        {/* แยกออกมาเป็นปุ่มแทนลิงก์กลางประโยค เพื่อให้กดถูกง่ายบนมือถือ */}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href={`/indicators/${indicator.id}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            ดูรายละเอียดตัวชี้วัด
          </Link>
          {/* แผนดำเนินงานอยู่ในหน้านี้แล้ว ปุ่มนี้พาเลื่อนลงไปที่หัวข้อแผน */}
          <Link
            href="#plan"
            className="inline-flex min-h-11 items-center rounded-lg border border-brand-600 bg-white px-4 text-sm font-medium text-brand-800 transition hover:bg-brand-50"
          >
            แผนดำเนินงาน
          </Link>
          <Link
            href={`/reports/${indicator.id}/${quarter}/print`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            พิมพ์ / บันทึกเป็น PDF
          </Link>
          <a
            href={`/api/export/report/${indicator.id}/${quarter}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            ดาวน์โหลดเป็น Word
          </a>
        </div>
      </div>

      {/* สลับไตรมาสได้จากตรงนี้ ไม่ต้องย้อนกลับไปหน้ารายการ */}
      <nav className="flex flex-wrap gap-2" aria-label="เลือกไตรมาส">
        {QUARTERS.map((q) => (
          <Link
            key={q}
            href={`/reports/${indicator.id}/${q}`}
            aria-current={q === quarter ? "page" : undefined}
            className={
              q === quarter
                ? "inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white"
                : "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium transition hover:bg-slate-50"
            }
          >
            ไตรมาส {q}
            <span className="ml-1 text-xs opacity-75">
              ({QUARTER_MONTHS[q]})
            </span>
          </Link>
        ))}
      </nav>

      {/* สถานะช่วงเวลาเปิด-ปิดของไตรมาสนี้ (ข้อ 9) */}
      <div
        className={
          window.state === "OPEN"
            ? "rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900"
            : "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        }
      >
        <p className="font-medium">
          {window.state === "OPEN" ? "เปิดรับข้อมูล" : "ปิดรับข้อมูล"} ·{" "}
          {window.message}
        </p>
        {window.originalCloseAt && (
          <p className="mt-0.5">
            ส่วนงานนี้ได้รับการขยายเวลาเป็นกรณีพิเศษ (เดิมปิด{" "}
            {formatThaiDateTime(window.originalCloseAt)})
            {window.extensionReason && ` — ${window.extensionReason}`}
          </p>
        )}
        {window.isAdminOverride && (
          <p className="mt-0.5">
            คุณยังแก้ไขได้เพราะเป็นส่วนกลาง
            แต่ผู้รับผิดชอบส่วนงานบันทึกอะไรไม่ได้แล้ว
          </p>
        )}
        {!window.canWrite && hasPermission && (
          <p className="mt-0.5">
            ช่วงนี้จึงกรอกผล แนบไฟล์ หรือลบไฟล์ไม่ได้
            ติดต่อส่วนกลางหากต้องการขยายเวลา
          </p>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">ค่าเป้าหมาย (ระดับ 3)</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">
              {targetLabel(indicator)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">ทิศทาง</dt>
            <dd className="mt-0.5 text-sm font-medium">
              {indicator.direction === "LOWER_IS_BETTER"
                ? "ค่าน้อยยิ่งดี"
                : "ค่ามากยิ่งดี"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">น้ำหนัก</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">
              {indicator.weight}%
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">สถานะรายงาน</dt>
            <dd className="mt-0.5 text-sm font-medium">
              {report === null
                ? "ยังไม่ได้กรอก"
                : isSubmitted
                  ? "ส่งแล้ว"
                  : "ร่าง (ยังไม่ได้ส่ง)"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                {indicator.criteria.map((c) => (
                  <th key={c.id} className="px-3 py-2 text-center font-medium">
                    ระดับ {c.level}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {indicator.criteria.map((c) => (
                  <td key={c.id} className="px-3 py-2 text-center tabular-nums">
                    {c.targetValue ?? "-"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          เกณฑ์คะแนนของตัวชี้วัดนี้ (หน่วย: {indicator.unit})
        </p>

        {/* ข้อความเกณฑ์จาก MOU - คนกรอกผลต้องรู้ว่าแต่ละระดับต้องทำอะไรถึงจะผ่าน
            ไม่ใช่เห็นแค่ตัวเลข โดยเฉพาะตัวชี้วัดแบบ "ระดับความสำเร็จ" */}
        {indicator.criteria.some(
          (c) => !isPlaceholderCriteria(c.description),
        ) && (
          <dl className="mt-4 space-y-2 border-t border-slate-200 pt-4">
            {indicator.criteria.map((c) =>
              isPlaceholderCriteria(c.description) ? null : (
                <div
                  key={c.id}
                  className="flex flex-col gap-1 sm:flex-row sm:gap-3"
                >
                  <dt className="shrink-0 text-sm font-medium sm:w-20">
                    ระดับ {c.level}
                  </dt>
                  <dd className="text-sm leading-relaxed text-slate-700">
                    {c.description}
                  </dd>
                </div>
              ),
            )}
          </dl>
        )}
      </section>

      {isSubmitted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="text-sm text-brand-900">
            <p className="font-medium">ส่งผลไตรมาส {quarter} แล้ว</p>
            <p className="mt-0.5">
              {report.submittedAt && formatThaiDateTime(report.submittedAt)}
              {submitter && ` โดย ${submitter.name}`} · ความก้าวหน้า{" "}
              {report.progressPct === null ? "-" : `${report.progressPct}%`} ·{" "}
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${scoreClass(report.scoreLevel)}`}
              >
                {scoreLabel(report.scoreLevel)}
              </span>
            </p>
          </div>
          {canEdit && (
            <ReopenButton
              action={reopenReportAction.bind(null, indicator.id, quarter)}
            />
          )}
        </div>
      )}

      {report?.scoreOverridden && report.scoreNote && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>คะแนนถูกปรับด้วยมือ:</strong> {report.scoreNote}
        </p>
      )}

      {canEdit ? (
          <ReportForm
            action={saveReportAction.bind(null, indicator.id, quarter)}
            unit={indicator.unit}
            targetValue={indicator.targetValue}
            direction={indicator.direction}
            criteria={indicator.criteria.map((c) => ({
              level: c.level,
              targetValue: c.targetValue,
            }))}
            isSubmitted={isSubmitted}
            planSection={planSection}
            initial={{
              actualValue:
                report?.actualValue === null || report === null
                  ? ""
                  : String(report.actualValue),
              scoreOverride: report?.scoreOverridden
                ? String(report.scoreLevel ?? "")
                : "",
              scoreNote: report?.scoreNote ?? "",
            }}
          />
        ) : (
          <div className="space-y-5">
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-600">
                {hasPermission
                  ? `ตอนนี้แก้ไขไม่ได้เพราะ${window.message} ข้อมูลที่เคยบันทึกไว้ยังอยู่ครบ`
                  : `คุณเปิดดูรายงานนี้ได้อย่างเดียว การกรอกผลทำได้โดยผู้รับผิดชอบส่วนงาน ${indicator.department.code} และส่วนกลาง`}
              </p>
              {report === null ? (
                <p className="text-sm text-slate-600">
                  ยังไม่มีการกรอกผลของไตรมาสนี้
                </p>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-500">ผลงานที่ทำได้</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums">
                      {report.actualValue ?? "-"} {indicator.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">ความก้าวหน้า</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums">
                      {report.progressPct === null
                        ? "-"
                        : `${report.progressPct}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">คะแนน</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {scoreLabel(report.scoreLevel)}
                    </dd>
                  </div>
                </dl>
              )}
            </section>
            {planSection}
          </div>
        )}
    </div>
  );
}
