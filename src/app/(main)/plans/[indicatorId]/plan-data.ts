import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/session";
import { canManagePlan, canReturnSubmission, canSendForDepartment } from "@/lib/permissions";
import { currentFiscalMonthIndex, planLevelGroups, toMonths } from "@/lib/plan";
import { monthLocks, type WindowStatus } from "@/lib/submission-window";
import { formatThaiDateTime } from "@/lib/datetime";
import { savePlanAction } from "@/actions/plans";
import type { PlanTable } from "./plan-table";

// ข้อมูลของตารางแผน ใช้ร่วมกันสองหน้า: หน้าแผนดำเนินงาน และหน้ารายงานผล
// แยกไว้ที่นี่ สองหน้าจะได้ดึงและแปลงข้อมูลชุดเดียวกัน ไม่ต้องเขียนซ้ำแล้วแก้ไม่ทั่ว

/** ส่วนที่ต้อง include ตอนดึงตัวชี้วัด เพื่อสร้างตารางแผน */
export const planInclude = {
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
} satisfies Prisma.IndicatorInclude;

type IndicatorWithPlan = Prisma.IndicatorGetPayload<{ include: typeof planInclude }>;

export function planTableProps({
  indicator,
  user,
  statuses,
  mode,
}: {
  indicator: IndicatorWithPlan;
  user: CurrentUser;
  statuses: WindowStatus[];
  mode: "plan" | "report";
}): React.ComponentProps<typeof PlanTable> {
  const isAdmin = user.role === "ADMIN";
  const confirmedAt = indicator.planHeader?.confirmedAt ?? null;
  const canEdit = canManagePlan(user, indicator.departmentId);

  return {
    mode,
    action: savePlanAction.bind(null, indicator.id),
    canEdit,
    header: {
      owner: indicator.planHeader?.owner ?? "",
      budget: indicator.planHeader?.budget ?? "",
    },
    rows: indicator.plans.map((p) => ({
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
    })),
    criteria: planLevelGroups(indicator.criteria, indicator.unit, indicator.conditions),
    levelReports: Object.fromEntries(
      indicator.planLevelReports.map((r) => [r.level, r.text]),
    ),
    locks: monthLocks(statuses),
    confirmedLabel: confirmedAt ? formatThaiDateTime(confirmedAt) : null,
    structureLocked: confirmedAt !== null && !isAdmin,
    canUnlock: canReturnSubmission(user) && confirmedAt !== null,
    canSend: canSendForDepartment(user, indicator.departmentId),
    returned:
      indicator.planHeader?.returnedAt && indicator.planHeader.returnNote
        ? {
            label: formatThaiDateTime(indicator.planHeader.returnedAt),
            note: indicator.planHeader.returnNote,
          }
        : null,
    monthsElapsed: currentFiscalMonthIndex(indicator.fiscalYear.year),
    fiscalYear: indicator.fiscalYear.year,
    indicatorId: indicator.id,
  };
}
