import type { PlanSection } from "@prisma/client";
import { db } from "@/lib/db";
import { scoreLabel } from "@/lib/scoring";
import { formatThaiDateTime } from "@/lib/datetime";
import {
  FISCAL_MONTHS,
  PLAN_SECTIONS,
  PLAN_SECTION_CAUSE_LABEL,
  PLAN_SECTION_AVG_LABEL,
  PLAN_SECTION_CUM_LABEL,
  PLAN_SECTION_INDEX_LABEL,
  PLAN_SECTION_ITEM_LABEL,
  PLAN_SECTION_TITLE,
  PLAN_SECTION_YEAR_LABEL,
  QUARTER_MONTHS,
  currentFiscalMonthIndex,
  planLevelGroups,
  summarizeRow,
  summarizeSection,
  toMonths,
  type MonthValues,
  type PlanRowSummary,
} from "@/lib/plan";
import { planSheetInclude } from "@/lib/plan-sheet";
import { returnDueText } from "@/lib/return-due";

// ============================================================================
// รวบรวมข้อมูลของรายงานหนึ่งฉบับ ตามแบบฟอร์มรายงานผลของ กยท. (เอกสารแนบ 3)
// ============================================================================
// ใช้ร่วมกันทั้งไฟล์ Word, Excel และหน้าพิมพ์ PDF
// ถ้าแยกกันดึงข้อมูล เอกสารแต่ละแบบจะไม่ตรงกันเมื่อมีการแก้ทีหลัง
//
// เนื้อหาตรงกับหน้ารายงานผล: ข้อมูลตัวชี้วัด ค่าเกณฑ์ สรุปผล
// และ "ผลการดำเนินงานตามแผน" (แผน/ผลรายเดือน สาเหตุ แนวทางแก้ไข หลักฐาน
// และรายงานผลการดำเนินงานของแต่ละระดับ)
// ============================================================================

export type ReportDocument = NonNullable<Awaited<ReturnType<typeof getReportDocument>>>;

/** 1 รายการในตารางผลการดำเนินงานตามแผน (แถวแผน + แถวผล) */
export type PlanDocRow = {
  label: string;
  title: string;
  target: string;
  unit: string;
  planMonths: MonthValues;
  actualMonths: MonthValues;
  summary: PlanRowSummary;
  cause: string;
  fix: string;
  /** หลักฐานประกอบ: รายชื่อไฟล์แนบ (+ ข้อความหลักฐานของแถวเก่า ถ้ามี) */
  evidence: string[];
};

/** กลุ่มของรายการ - ตารางเป้าหมายมีกลุ่มเดียวไม่มีหัว ตารางขั้นตอนแบ่งตามค่าเกณฑ์ระดับ */
export type PlanDocGroup = {
  heading: string | null;
  rows: PlanDocRow[];
  /** หัวข้อช่องรายงานผลรายระดับ เช่น "รายงานผลการดำเนินงานของระดับ 3" - null = ไม่มีช่องนี้ */
  levelReportLabel: string | null;
  levelReport: string;
};

export type PlanDocSection = {
  section: PlanSection;
  title: string;
  indexLabel: string;
  itemLabel: string;
  avgLabel: string;
  cumLabel: string;
  yearLabel: string;
  causeLabel: string;
  groups: PlanDocGroup[];
  avgCumPct: number;
  avgYearPct: number;
};

export async function getReportDocument(indicatorId: string, quarter: number) {
  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    include: {
      ...planSheetInclude,
      reports: {
        where: { quarter },
        include: { submittedBy: { select: { name: true } } },
      },
    },
  });
  if (!indicator) return null;

  const report = indicator.reports[0] ?? null;

  // ยอดสะสมคิดถึงเดือนปัจจุบันของปีบัญชี เหมือนตารางบนหน้ารายงานผล
  const upto = currentFiscalMonthIndex(indicator.fiscalYear.year);

  return {
    indicator,
    report,
    quarter,
    quarterMonths: QUARTER_MONTHS[quarter],
    /** หัวเรื่องของเอกสาร ตรงตามแบบฟอร์ม */
    title: `รายงานผลการดำเนินงานตามตัวชี้วัดที่ ${indicator.code} ${indicator.name}`,
    subtitle: `${indicator.department.code} ${indicator.department.name} · ปีบัญชี ${indicator.fiscalYear.year} · ไตรมาส ${quarter} (${QUARTER_MONTHS[quarter]})`,
    directionText: indicator.direction === "LOWER_IS_BETTER" ? "ค่าน้อยยิ่งดี" : "ค่ามากยิ่งดี",
    statusText:
      report === null
        ? "ยังไม่ได้กรอก"
        : report.status === "SUBMITTED"
          ? "ส่งแล้ว"
          : "ร่าง (ยังไม่ได้ส่ง)",
    scoreText: scoreLabel(report?.scoreLevel ?? null),
    submittedText: report?.submittedAt
      ? `ส่งเมื่อ ${formatThaiDateTime(report.submittedAt)}${report.submittedBy ? ` โดย ${report.submittedBy.name}` : ""}`
      : "ยังไม่ได้ส่ง",
    /** ผลถูกตีกลับและยังไม่ได้ส่งใหม่ - แสดงข้อสังเกตจากส่วนกลาง */
    returned:
      report && report.status !== "SUBMITTED" && report.returnNote && report.returnedAt
        ? {
            label: formatThaiDateTime(report.returnedAt),
            note: report.returnNote,
            due: report.returnDueAt ? returnDueText(report.returnDueAt) : null,
          }
        : null,
    owner: indicator.planHeader?.owner ?? "",
    budget: indicator.planHeader?.budget ?? "",
    planConfirmed: indicator.planHeader?.confirmedAt != null,
    upto,
    uptoText:
      upto === 0
        ? "ยังไม่เริ่มปีบัญชี"
        : `คิดยอดสะสมตั้งแต่ ${FISCAL_MONTHS[0]} ถึง ${FISCAL_MONTHS[upto - 1]}`,
    planSections: buildPlanSections(indicator, upto),
  };
}

function buildPlanSections(
  indicator: {
    unit: string;
    conditions: string[];
    criteria: { level: number; targetValue: number | null; description: string | null }[];
    planLevelReports: { level: number; text: string }[];
    plans: {
      section: PlanSection;
      criteriaLevel: number | null;
      title: string;
      targetValue: number | null;
      unit: string | null;
      planMonths: unknown;
      actualMonths: unknown;
      causeNote: string | null;
      correctiveAction: string | null;
      evidence: string | null;
      attachments: { originalName: string }[];
    }[];
  },
  upto: number,
): PlanDocSection[] {
  const toRow = (p: (typeof indicator.plans)[number], label: string): PlanDocRow => {
    const planMonths = toMonths(p.planMonths);
    const actualMonths = toMonths(p.actualMonths);
    return {
      label,
      title: p.title,
      target: p.targetValue === null ? "" : String(p.targetValue),
      unit: p.unit ?? "",
      planMonths,
      actualMonths,
      summary: summarizeRow({ planMonths, actualMonths }, upto),
      cause: p.causeNote ?? "",
      fix: p.correctiveAction ?? "",
      evidence: [p.evidence, ...p.attachments.map((a) => a.originalName)].filter(
        (v): v is string => Boolean(v),
      ),
    };
  };

  return PLAN_SECTIONS.map((section) => {
    const rows = indicator.plans.filter((p) => p.section === section);
    let groups: PlanDocGroup[];

    if (section === "TARGET") {
      groups = [
        {
          heading: null,
          rows: rows.map((p, i) => toRow(p, String(i + 1))),
          levelReportLabel: null,
          levelReport: "",
        },
      ];
    } else {
      // ขั้นตอนการดำเนินงาน แบ่งตามค่าเกณฑ์ระดับ 1-5 + เงื่อนไขอื่นๆ เหมือนหน้าเว็บ
      const levelGroups = planLevelGroups(indicator.criteria, indicator.unit, indicator.conditions);
      const levels = levelGroups.map((g) => g.level);
      groups = levelGroups.map((g) => ({
        heading: [g.value ? `${g.title} : ${g.value}` : g.title, g.description]
          .filter(Boolean)
          .join("\n"),
        rows: rows
          .filter((p) => p.criteriaLevel === g.level)
          .map((p, i) => toRow(p, `${g.level}.${i + 1}`)),
        levelReportLabel: `รายงานผลการดำเนินงานของ${g.shortTitle}`,
        levelReport: indicator.planLevelReports.find((r) => r.level === g.level)?.text ?? "",
      }));
      const orphans = rows.filter(
        (p) => p.criteriaLevel === null || !levels.includes(p.criteriaLevel),
      );
      if (orphans.length > 0) {
        groups.push({
          heading: "ขั้นตอนที่ยังไม่ระบุค่าเกณฑ์ระดับ",
          rows: orphans.map((p, i) => toRow(p, String(i + 1))),
          levelReportLabel: null,
          levelReport: "",
        });
      }
    }

    const all = groups.flatMap((g) => g.rows);
    const totals = summarizeSection(all, upto);
    return {
      section,
      title: PLAN_SECTION_TITLE[section],
      indexLabel: PLAN_SECTION_INDEX_LABEL[section],
      itemLabel: PLAN_SECTION_ITEM_LABEL[section],
      avgLabel: PLAN_SECTION_AVG_LABEL[section],
      cumLabel: PLAN_SECTION_CUM_LABEL[section],
      yearLabel: PLAN_SECTION_YEAR_LABEL[section],
      causeLabel: PLAN_SECTION_CAUSE_LABEL[section],
      groups,
      avgCumPct: totals.avgCumPct,
      avgYearPct: totals.avgYearPct,
    };
  });
}

/** ชื่อไฟล์ที่ผู้ใช้จะได้ ตั้งให้สื่อความหมายและเรียงง่ายเมื่อมีหลายไฟล์ */
export function reportFileName(doc: ReportDocument, extension: string) {
  const safe = doc.indicator.name.replace(/[\\/:*?"<>|]/g, " ").trim();
  return `รายงานผล ${doc.indicator.department.code} ข้อ ${doc.indicator.code} ${safe} ไตรมาส ${doc.quarter}.${extension}`;
}
