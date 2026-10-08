import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  canReturnSubmission,
  canSendForDepartment,
  canSubmitReport,
  canViewDepartment,
} from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  saveReportAction,
  reopenReportAction,
  returnReportAction,
} from "@/actions/reports";
import { QUARTERS, QUARTER_MONTHS } from "@/lib/plan";
import { PlanTable } from "../../../plans/[indicatorId]/plan-table";
import { planInclude, planTableProps } from "../../../plans/[indicatorId]/plan-data";
import {
  isPlaceholderCriteria,
  scoreClass,
  scoreLabel,
  targetLabel,
} from "@/lib/scoring";
import { formatThaiDateTime } from "@/lib/datetime";
import { getQuarterStatuses } from "@/lib/submission-window";
import { ReportForm } from "./report-form";
import { ReopenButton } from "./reopen-button";
import { RETURN_FORM_ID, ReturnButton } from "./return-button";
import { loadComments } from "@/lib/review-comments";
import { StepTracker } from "@/components/step-tracker";
import {
  returnedResultSections,
  returnedResultSectionsNow,
  submittedLockMessage,
  submittedResultsLock,
} from "@/lib/report-lock";
import { commentSectionLabel } from "@/lib/review-comments";
import { returnDueText } from "@/lib/return-due";
import { DueBadge } from "@/components/return-due-input";

export const dynamic = "force-dynamic";
export const metadata = { title: "กรอกผลการดำเนินงาน | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน" };

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
      ...planInclude,
      department: { select: { code: true, name: true } },
      reports: { where: { quarter } },
    },
  });

  if (!indicator) notFound();

  // ตรวจสิทธิ์การมองเห็นที่เซิร์ฟเวอร์ก่อนเสมอ
  if (!canViewDepartment(user, indicator.departmentId)) notFound();

  // สิทธิ์ + ช่วงเวลา + กรอกแผนแล้ว ต้องผ่านครบจึงจะรายงานผลได้
  // (ส่วนกลางผ่านช่วงเวลาและขั้นตอนแผนเสมอ เพราะต้องแก้ข้อมูลให้ส่วนงานได้ทุกกรณี)
  const statuses = await getQuarterStatuses({
    fiscalYearId: indicator.fiscalYearId,
    departmentId: indicator.departmentId,
    actor: user,
  });
  const window = statuses[quarter - 1];
  const isAdmin = user.role === "ADMIN";
  const hasPermission = canSubmitReport(user, indicator.departmentId);
  // ผู้รายงานกรอกและบันทึกร่างได้ แต่กดส่งผลต้องเป็นหัวหน้าส่วนงาน/หน่วยงาน (หรือส่วนกลาง)
  const canSend = canSendForDepartment(user, indicator.departmentId);

  // ขั้นตอนที่ 1: กรอกแผนดำเนินงานและกด "ส่งแผน" ก่อน จึงรายงานผลรายไตรมาสได้
  // ยืนยันแล้วโครงแผนล็อกสำหรับผู้รับผิดชอบส่วนงาน (ส่วนกลางแก้และปลดล็อกได้)
  const confirmedAt = indicator.planHeader?.confirmedAt ?? null;
  const planReady = confirmedAt !== null;
  const needsPlan = hasPermission && !isAdmin && !planReady;

  const report = indicator.reports[0] ?? null;
  const isSubmitted = report?.status === "SUBMITTED";
  // ส่งผลแล้ว หัวหน้าส่วนงานและผู้รายงานแก้ไม่ได้ จนกว่าส่วนกลางจะตีกลับ (ส่วนกลางแก้ได้เสมอ)
  const canEdit = hasPermission && window.canWrite && !needsPlan && !(isSubmitted && !isAdmin);
  // ผลรายเดือนในตารางแผนล็อกตามไตรมาสที่เปิดอยู่ (เซิร์ฟเวอร์ตรวจแบบเดียวกัน)
  const resultsLockedQuarter = await submittedResultsLock({
    indicatorId: indicator.id,
    statuses,
    isAdmin,
  });
  // ผลถูกตีกลับ: แก้ได้เฉพาะส่วนที่ส่วนกลางเขียนข้อสังเกต (เซิร์ฟเวอร์ตรวจแบบเดียวกัน)
  // ตารางผลรายเดือนดูไตรมาสที่เปิดอยู่ · ผลงานที่ทำได้จริงของไตรมาสดูไตรมาสที่กำลังดู
  const [tableSections, quarterSections] = await Promise.all([
    returnedResultSectionsNow({ indicatorId: indicator.id, statuses, isAdmin }),
    returnedResultSections(indicator.id, quarter, isAdmin),
  ]);
  // ข้อสังเกตใต้เป้าหมายตัวชี้วัด/ค่าเกณฑ์ ของผลไตรมาสนี้
  const comments = await loadComments(indicator.id, quarter);

  // ไตรมาสที่ยังไม่มีรายงาน ยกข้อมูลของไตรมาสล่าสุดก่อนหน้ามาเป็นค่าตั้งต้น
  // ผู้กรอกจะได้แก้ต่อจากของเดิม (ช่องที่ไม่อยู่ในฟอร์มยกไปตอนบันทึกใน saveReportAction)
  const carried =
    report === null && quarter > 1
      ? await db.quarterlyReport.findFirst({
          where: { indicatorId: indicator.id, quarter: { lt: quarter } },
          orderBy: { quarter: "desc" },
        })
      : null;
  const source = report ?? carried;

  // ผลการดำเนินงานตามแผน: กรอกผลรายเดือน สาเหตุ แนวทางแก้ไข หลักฐาน และรายงานรายระดับ
  // ตัวแผนกรอกที่หน้าแผนการดำเนินงาน (/plans/[id]) ซึ่งต้องยืนยันก่อนจึงรายงานผลได้
  const planSection = (
    // key จำเป็น: ส่วนนี้ถูกส่งเข้า ReportForm เป็น prop ถ้าไม่มี key React จะเตือนเรื่อง key ในโหมด dev
    <section key="plan" id="plan" className="scroll-mt-4 space-y-3">
      <h2 className="text-lg font-semibold">ผลการดำเนินงานตามแผน</h2>
      {needsPlan ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ยังไม่ได้ส่งแผนการดำเนินงาน ·{" "}
          <Link
            href={`/plans/${indicator.id}`}
            className="font-medium underline underline-offset-2"
          >
            ไปกรอกแผนการดำเนินงาน
          </Link>{" "}
          แล้วกดส่งแผน จึงจะรายงานผลได้
        </p>
      ) : (
        <PlanTable
          {...planTableProps({
            indicator,
            user,
            statuses,
            mode: "report",
            comments,
            commentFormId: RETURN_FORM_ID,
            resultsLocked: resultsLockedQuarter !== null,
            quarter,
            resultSections: tableSections ? [...tableSections] : null,
          })}
        />
      )}
      {/* ข้อสังเกต + ตีกลับผล อยู่ใต้ตารางเป้าหมายตัวชี้วัดและค่าเกณฑ์ทุกระดับ
          แสดงเสมอสำหรับส่วนกลาง ตีกลับได้เฉพาะผลที่ส่งแล้ว
          เป็นฟอร์มแยกของตัวเอง วางต่อจากฟอร์มตาราง (ไม่ซ้อนกัน) */}
      {canReturnSubmission(user) && (
        <ReturnButton
          action={returnReportAction.bind(null, indicator.id, quarter)}
          quarter={quarter}
          canReturnNow={isSubmitted}
        />
      )}
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
          className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline"
        >
          ← กลับไปรายการรายงานผลการดำเนินงาน
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
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-surface px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            ดูรายละเอียดตัวชี้วัด
          </Link>
          {/* แผนการดำเนินงานแยกเป็นหน้าของตัวเอง (ขั้นตอนที่ 1) */}
          <Link
            href={`/plans/${indicator.id}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-brand-600 bg-surface px-4 text-sm font-medium text-brand-ink transition hover:bg-brand-50"
          >
            แผนการดำเนินงาน
          </Link>
          <Link
            href={`/reports/${indicator.id}/${quarter}/print`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-surface px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            พิมพ์ / บันทึกเป็น PDF
          </Link>
          <a
            href={`/api/export/report/${indicator.id}/${quarter}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-surface px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            ดาวน์โหลดเป็น Word
          </a>
          <a
            href={`/api/export/report/${indicator.id}/${quarter}/xlsx`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-surface px-4 text-sm font-medium transition hover:bg-slate-50"
          >
            ดาวน์โหลดเป็น Excel
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
                : "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-surface px-4 text-sm font-medium transition hover:bg-slate-50"
            }
          >
            ไตรมาส {q}
            <span className="ml-1 text-xs opacity-75">
              ({QUARTER_MONTHS[q]})
            </span>
            {statuses[q - 1].state === "OPEN" ? (
              <span className="ml-1.5 text-xs font-semibold">· รายงานได้</span>
            ) : (
              <span className="ml-1.5 text-xs opacity-75">
                · {statuses[q - 1].state === "BEFORE_OPEN" ? "ยังไม่ถึง" : "ปิดแล้ว"}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* สถานะช่วงเวลาของไตรมาสนี้ (ข้อ 9) - รายงานได้เฉพาะในไตรมาสปัจจุบัน */}
      <div
        className={
          window.state === "OPEN"
            ? "rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900"
            : "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        }
      >
        <p className="font-medium">
          {window.state === "OPEN" ? "เปิดรายงานผล" : "ปิดรายงานผล"} ·{" "}
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
            รายงานผลได้เฉพาะในช่วงเวลาเปิด-ปิดระบบที่ส่วนกลางกำหนด
            ติดต่อส่วนกลางหากต้องการขยายเวลา
          </p>
        )}
      </div>

      {/* ขั้นตอนของผู้รับผิดชอบส่วนงาน: 1 กรอกแผน → 2 รายงานผลไตรมาสปัจจุบัน */}
      {hasPermission && !isAdmin && (
        <StepTracker
          steps={[
            {
              title: "กรอกแผนดำเนินงาน และหัวหน้าส่วนงานกดส่งแผน",
              state: planReady ? "done" : "current",
              detail: planReady ? (
                "ส่งแผนแล้ว (แผนถูกล็อก)"
              ) : (
                <>
                  ยังไม่ได้ส่งแผน ·{" "}
                  <Link
                    href={`/plans/${indicator.id}`}
                    className="font-medium underline underline-offset-2"
                  >
                    ไปกรอกแผน →
                  </Link>
                </>
              ),
            },
            {
              title: `รายงานผลไตรมาส ${quarter}`,
              here: true,
              state: !planReady ? "upcoming" : isSubmitted ? "done" : "current",
              detail: !planReady
                ? "ทำได้หลังส่งแผนแล้ว"
                : isSubmitted
                  ? "ส่งผลแล้ว"
                  : window.canWrite
                    ? "กรอกผลด้านล่างแล้วกดส่งผลการดำเนินงาน"
                    : "ไตรมาสนี้ไม่เปิดให้รายงาน",
            },
          ]}
        />
      )}

      {carried && canEdit && (
        <p className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600">
          ยกข้อมูลที่รายงานไว้ในไตรมาส {carried.quarter} มาให้แล้ว ·
          ตรวจสอบและแก้ให้เป็นผลของไตรมาส {quarter} แล้วกดบันทึก
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
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
        {(indicator.conditions.length > 0 ||
          indicator.criteria.some(
            (c) => !isPlaceholderCriteria(c.description),
          )) && (
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
            {/* เงื่อนไขของตัวชี้วัด ต่อท้ายระดับ 5 */}
            {indicator.conditions.length > 0 && (
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <dt className="shrink-0 text-sm font-medium sm:w-20">
                  เงื่อนไขอื่นๆ
                </dt>
                <dd className="text-sm leading-relaxed text-slate-700">
                  {indicator.conditions.length === 1 ? (
                    indicator.conditions[0]
                  ) : (
                    <ol className="list-decimal space-y-0.5 pl-5">
                      {indicator.conditions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ol>
                  )}
                </dd>
              </div>
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
            {hasPermission && !isAdmin && (
              <p className="mt-1 font-medium">
                🔒 ผลถูกล็อกแล้ว แก้ไขไม่ได้ · ถ้าต้องแก้ติดต่อส่วนกลางให้ตีกลับผล
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* ดึงกลับมาแก้ = ส่วนกลางเท่านั้น (ส่วนงานต้องให้ส่วนกลางตีกลับ) */}
            {canEdit && isAdmin && (
              <ReopenButton
                action={reopenReportAction.bind(null, indicator.id, quarter)}
              />
            )}
          </div>
        </div>
      )}

      {/* ผลถูกตีกลับ - แสดงจนกว่าหัวหน้าส่วนงานจะกดส่งผลใหม่ */}
      {report && !isSubmitted && report.returnNote && report.returnedAt && (
        <div
          id="return"
          role="alert"
          className="scroll-mt-4 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <p className="font-semibold">
            ส่วนกลางตีกลับผลไตรมาส {quarter} เมื่อ {formatThaiDateTime(report.returnedAt)}
          </p>
          {report.returnDueAt && <DueBadge text={returnDueText(report.returnDueAt)} />}
          <p className="mt-1 font-medium">ข้อสังเกตเพื่อให้ผลมีความชัดเจน (จากส่วนกลาง):</p>
          <p className="mt-0.5 whitespace-pre-line rounded-lg bg-surface px-3 py-2 text-base text-red-900">
            {report.returnNote}
          </p>
          {quarterSections && (
            <p className="mt-1 font-semibold">
              แก้ไขได้เฉพาะผลของส่วนที่มีข้อสังเกต:{" "}
              {[...quarterSections].map(commentSectionLabel).join(" · ")} · ส่วนอื่นล็อกไว้ (ช่องสีเทา)
            </p>
          )}
          <p className="mt-1">
            ผู้รายงานแก้ไขแล้วบันทึกร่าง จากนั้นหัวหน้าส่วนงาน/หัวหน้าหน่วยงานกดส่งผลการดำเนินงานใหม่
          </p>
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
            canSend={canSend}
            planSection={planSection}
            // ผลถูกตีกลับโดยไม่มีข้อสังเกตที่เป้าหมายตัวชี้วัด: ผลงานที่ทำได้จริง/คะแนนแก้ไม่ได้
            lockOverall={quarterSections !== null && !quarterSections.has("TARGET")}
            initial={{
              actualValue:
                source?.actualValue === null || source === null
                  ? ""
                  : String(source.actualValue),
              scoreOverride: source?.scoreOverridden
                ? String(source.scoreLevel ?? "")
                : "",
              scoreNote: source?.scoreNote ?? "",
            }}
          />
        ) : (
          <div className="space-y-5">
            <section className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5">
              <p className="text-sm text-slate-600">
                {needsPlan
                  ? "ยังรายงานผลไม่ได้ ต้องกรอกแผนการดำเนินงานและกดส่งแผนก่อน"
                  : hasPermission && isSubmitted && !isAdmin
                  ? submittedLockMessage(quarter)
                  : hasPermission
                  ? `ตอนนี้แก้ไขไม่ได้ — ${window.message} ข้อมูลที่เคยบันทึกไว้ยังอยู่ครบ`
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
