import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getViewFiscalYear } from "@/lib/view-year";
import type { Actor } from "@/lib/permissions";
import { departmentScope } from "@/lib/permissions";
import { weightedScore } from "@/lib/scoring";

// ============================================================================
// การรวมข้อมูลสำหรับหน้าภาพรวมและไฟล์ Excel (ข้อ 7)
// ============================================================================
// หน้าภาพรวมกับไฟล์ที่ export ต้องได้ตัวเลขชุดเดียวกันเสมอ
// จึงรวมการคำนวณไว้ที่นี่ที่เดียว แล้วให้ทั้งสองที่เรียกใช้
//
// วิธีคิดคะแนนของส่วนงาน:
//   คะแนนถ่วงน้ำหนัก = ผลรวมของ (คะแนน 1-5 × น้ำหนัก ÷ 100) ทุกตัวชี้วัด
//   น้ำหนักรวมของทุกส่วนงานเท่ากับ 100 คะแนนเต็มจึงเป็น 5 เท่ากันทุกหน่วย
//
// ตัวชี้วัดที่ยังไม่ส่งผลจะไม่มีคะแนน คะแนนรวมจึงยังไม่เต็มจนกว่าจะส่งครบ
// ด้วยเหตุนี้ทุกที่ที่แสดงคะแนนรวม ต้องแสดง "ส่งผลไปแล้วกี่ %" คู่กันเสมอ
// ไม่งั้นจะอ่านผิดว่าหน่วยที่ยังไม่ส่งทำได้คะแนนต่ำ
// ============================================================================

export type QuarterFilter = 1 | 2 | 3 | 4 | "latest";

export type DepartmentRow = {
  departmentId: string;
  code: string;
  name: string;
  indicatorCount: number;
  submittedCount: number;
  submittedPct: number;
  weightedScore: number;
  /** น้ำหนักรวมของตัวชี้วัดที่ส่งผลแล้ว ใช้บอกว่าคะแนนนี้มาจากกี่ % ของงานทั้งหมด */
  scoredWeight: number;
};

export type DimensionRow = {
  dimension: string;
  indicatorCount: number;
  submittedCount: number;
  averageScore: number | null;
  /**
   * สัดส่วนน้ำหนักของมิตินี้เทียบกับน้ำหนักทั้งหมดที่มองเห็น (%)
   *
   * ไม่ใช้ผลรวมน้ำหนักดิบ เพราะน้ำหนักของแต่ละส่วนงานรวมกันได้ 100
   * พอรวมข้าม 30 ส่วนงานจะได้ตัวเลขอย่าง 835% ซึ่งอ่านแล้วสับสน
   */
  weightShare: number;
};

export type DashboardData = {
  fiscalYear: { id: number; year: number } | null;
  quarter: QuarterFilter;
  indicatorCount: number;
  submittedCount: number;
  submittedPct: number;
  /** คะแนนเฉลี่ยถ่วงน้ำหนักของทุกส่วนงานที่อยู่ในขอบเขตที่มองเห็น */
  averageWeightedScore: number | null;
  departments: DepartmentRow[];
  dimensions: DimensionRow[];
  /** ส่วนงานที่ยังไม่ส่งผลเลยสักตัวชี้วัด */
  notStartedDepartments: string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getDashboardData(
  actor: Actor,
  quarter: QuarterFilter = "latest"
): Promise<DashboardData> {
  // ปีที่ผู้ใช้เลือกดู (ไม่ได้เลือก = ปีบัญชีที่ใช้งานอยู่)
  const fiscalYear = await getViewFiscalYear();

  const where: Prisma.IndicatorWhereInput = {
    ...(fiscalYear ? { fiscalYearId: fiscalYear.id } : {}),
    status: { not: "ARCHIVED" },
    ...departmentScope(actor),
  };

  const indicators = await db.indicator.findMany({
    where,
    select: {
      id: true,
      weight: true,
      dimension: true,
      departmentId: true,
      department: { select: { code: true, name: true, sortOrder: true } },
      reports: {
        where: quarter === "latest" ? { status: "SUBMITTED" } : { quarter },
        select: { quarter: true, status: true, scoreLevel: true },
      },
    },
  });

  // คะแนนของตัวชี้วัดหนึ่งรายการตามตัวกรองไตรมาสที่เลือก
  //   เลือกไตรมาสเจาะจง -> ใช้ไตรมาสนั้น และต้องส่งแล้วเท่านั้น
  //   เลือก "ล่าสุด"     -> ใช้ไตรมาสที่ส่งแล้วซึ่งใหม่ที่สุด
  function scoreOf(reports: { quarter: number; status: string; scoreLevel: number | null }[]) {
    const usable = reports
      .filter((r) => r.status === "SUBMITTED" && r.scoreLevel !== null)
      .sort((a, b) => b.quarter - a.quarter);
    return usable[0]?.scoreLevel ?? null;
  }

  // ตัวสะสมของมิติเก็บ "ผลรวมน้ำหนักดิบ" และ "ผลรวมคะแนน" ไว้ก่อน
  // แล้วค่อยแปลงเป็นสัดส่วนและค่าเฉลี่ยตอนท้าย จึงเป็นคนละรูปแบบกับที่คืนออกไป
  type DimensionAcc = {
    dimension: string;
    indicatorCount: number;
    submittedCount: number;
    scoreSum: number;
    totalWeight: number;
  };

  const byDepartment = new Map<string, DepartmentRow>();
  const byDimension = new Map<string, DimensionAcc>();
  let submittedCount = 0;

  for (const ind of indicators) {
    const score = scoreOf(ind.reports);
    const isSubmitted = score !== null;
    if (isSubmitted) submittedCount++;

    const dept = byDepartment.get(ind.departmentId) ?? {
      departmentId: ind.departmentId,
      code: ind.department.code,
      name: ind.department.name,
      indicatorCount: 0,
      submittedCount: 0,
      submittedPct: 0,
      weightedScore: 0,
      scoredWeight: 0,
    };
    dept.indicatorCount++;
    if (isSubmitted) {
      dept.submittedCount++;
      dept.scoredWeight += ind.weight;
      dept.weightedScore += weightedScore(score, ind.weight) ?? 0;
    }
    byDepartment.set(ind.departmentId, dept);

    const key = ind.dimension ?? "(ไม่ระบุมิติ)";
    const dim = byDimension.get(key) ?? {
      dimension: key,
      indicatorCount: 0,
      submittedCount: 0,
      scoreSum: 0,
      totalWeight: 0,
    };
    dim.indicatorCount++;
    dim.totalWeight += ind.weight;
    if (isSubmitted) {
      dim.submittedCount++;
      dim.scoreSum += score;
    }
    byDimension.set(key, dim);
  }

  const departments = [...byDepartment.values()]
    .map((d) => ({
      ...d,
      weightedScore: round2(d.weightedScore),
      scoredWeight: round2(d.scoredWeight),
      submittedPct:
        d.indicatorCount === 0
          ? 0
          : Math.round((d.submittedCount / d.indicatorCount) * 100),
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore || a.code.localeCompare(b.code, "th"));

  const rawDimensions = [...byDimension.values()];
  const allWeight = rawDimensions.reduce((sum, d) => sum + d.totalWeight, 0);

  const dimensions: DimensionRow[] = rawDimensions
    .map((d) => ({
      dimension: d.dimension,
      indicatorCount: d.indicatorCount,
      submittedCount: d.submittedCount,
      weightShare: allWeight === 0 ? 0 : round2((d.totalWeight / allWeight) * 100),
      averageScore:
        d.submittedCount === 0 ? null : round2(d.scoreSum / d.submittedCount),
    }))
    .sort((a, b) => b.weightShare - a.weightShare);

  const scored = departments.filter((d) => d.submittedCount > 0);
  const averageWeightedScore =
    scored.length === 0
      ? null
      : round2(scored.reduce((sum, d) => sum + d.weightedScore, 0) / scored.length);

  return {
    fiscalYear,
    quarter,
    indicatorCount: indicators.length,
    submittedCount,
    submittedPct:
      indicators.length === 0
        ? 0
        : Math.round((submittedCount / indicators.length) * 100),
    averageWeightedScore,
    departments,
    dimensions,
    notStartedDepartments: departments
      .filter((d) => d.submittedCount === 0)
      .map((d) => d.code),
  };
}

/** แปลงตัวกรองไตรมาสจาก URL ให้เป็นค่าที่ใช้ได้ */
export function parseQuarterFilter(value: string | undefined): QuarterFilter {
  if (value === "1" || value === "2" || value === "3" || value === "4") {
    return Number(value) as 1 | 2 | 3 | 4;
  }
  return "latest";
}

export function quarterFilterLabel(quarter: QuarterFilter): string {
  return quarter === "latest" ? "ไตรมาสล่าสุดที่ส่งแล้ว" : `ไตรมาส ${quarter}`;
}
