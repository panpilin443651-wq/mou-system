import { db } from "@/lib/db";

// ============================================================================
// คะแนนประเมินรายตัวชี้วัดที่ส่วนกลางให้ (ตาราง MouScore)
// ============================================================================
// เดิมตัวเลขชุดนี้อยู่ในไฟล์ Excel แล้วระบบอ่านมาแสดงอย่างเดียว
// ตอนนี้ย้ายเข้าฐานข้อมูลแล้ว แอดมินจึงแก้ไขในระบบได้โดยตรง
// ไฟล์ Excel เหลือหน้าที่เป็นแค่ "ต้นทางตอนนำเข้าครั้งแรก" (ดู prisma/seed-mou-scores.ts)
//
// คนละชุดกับผลที่ส่วนงานกรอกเองในเมนู "รายงานผล" (ตาราง QuarterlyReport)
// ============================================================================

/** ไตรมาสทั้งหมดที่กรอกได้ - MOU ปี 2569 ประเมินจริงตั้งแต่ไตรมาส 2 แต่เปิดช่องไว้ครบ */
export const MOU_QUARTERS = [1, 2, 3, 4] as const;

/**
 * งวดสะสมของ MOU ผูกกับไตรมาสไหน
 *
 * "6 เดือน" คือผลถึงสิ้นไตรมาส 2, "9 เดือน" ถึงไตรมาส 3, "12 เดือน" ถึงไตรมาส 4
 * ตรงตามที่ไฟล์ Excel ต้นฉบับใช้สูตรไว้ (ตรวจกับไฟล์ครบ 596 ค่าแล้วว่าตรงกัน)
 */
export const CUMULATIVE_PERIODS = [
  { label: "6 เดือน", quarter: 2 },
  { label: "9 เดือน", quarter: 3 },
  { label: "12 เดือน", quarter: 4 },
] as const;

export type QuarterCell = {
  quarter: number;
  plan: number | null;
  actual: number | null;
  score: number | null;
  note: string | null;
};

export type MouScoreRow = {
  indicatorId: string;
  code: string;
  name: string;
  dimension: string | null;
  /** หัวข้อกลุ่มของตัวชี้วัดย่อย เช่น 4.1 กับ 4.2 อยู่ใต้ "ความสามารถในการบริหารแผนลงทุน" */
  groupName: string | null;
  weight: number;
  quarters: QuarterCell[];
  /** คะแนนถ่วงน้ำหนักสะสม คำนวณจาก คะแนน x น้ำหนัก / 100 ไม่ได้เก็บไว้ในฐานข้อมูล */
  cumulative: { label: string; value: number | null }[];
};

export type DepartmentMouScores = {
  rows: MouScoreRow[];
  totals: { weight: number; cumulative: { label: string; value: number | null }[] };
  /** ไตรมาสที่มีตัวเลขอย่างน้อยหนึ่งช่อง - ใช้ตัดสินว่าตารางจะแสดงไตรมาสไหนบ้าง */
  quartersWithData: number[];
  /** เวลาที่มีคนแก้ล่าสุด และชื่อคนแก้ - null ถ้ายังไม่เคยมีใครแก้ในระบบ */
  lastEdit: { at: Date; by: string | null } | null;
};

/** ปัดเศษ 4 ตำแหน่ง กันเลขทศนิยมยาวเฟื้อยจากการคูณ */
function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * รวมค่าคะแนนถ่วงน้ำหนัก
 *
 * คืน null เมื่อไม่มีตัวเลขเลยสักช่อง เพื่อให้แสดงเป็น "ยังไม่ถึงกำหนดประเมิน"
 * ไม่ใช่ 0 ซึ่งแปลว่าได้ศูนย์คะแนนจริง
 */
function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return round(present.reduce((a, b) => a + b, 0));
}

/**
 * คะแนนถ่วงน้ำหนักของตัวชี้วัดหนึ่งข้อ ในงวดสะสมหนึ่งงวด = คะแนน × น้ำหนัก ÷ 100
 * (เดิมคิดจากช่อง "ผล" - เปลี่ยนเป็น "คะแนน" 2 ต.ค. 2569 เมื่อเอาช่องผลออกจากฟอร์ม)
 */
function weighted(score: number | null, weight: number): number | null {
  return score === null ? null : round((score * weight) / 100);
}

/** คะแนนรายตัวชี้วัดทั้งหมดของส่วนงานหนึ่ง ในปีบัญชีหนึ่ง */
export async function departmentMouScores(
  fiscalYearId: number,
  departmentId: string
): Promise<DepartmentMouScores> {
  const indicators = await db.indicator.findMany({
    where: { fiscalYearId, departmentId },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      dimension: true,
      groupName: true,
      weight: true,
      mouScores: {
        select: {
          quarter: true,
          plan: true,
          actual: true,
          score: true,
          note: true,
          updatedAt: true,
          updatedById: true,
          updatedBy: { select: { name: true } },
        },
      },
    },
  });

  let lastEdit: DepartmentMouScores["lastEdit"] = null;

  const rows: MouScoreRow[] = indicators.map((ind) => {
    const byQuarter = new Map(ind.mouScores.map((s) => [s.quarter, s]));

    for (const s of ind.mouScores) {
      // นับเฉพาะที่มีคนแก้ในระบบ แถวที่มาจากการนำเข้าไฟล์จะไม่มี updatedById
      if (s.updatedById && (!lastEdit || s.updatedAt > lastEdit.at)) {
        lastEdit = { at: s.updatedAt, by: s.updatedBy?.name ?? null };
      }
    }

    return {
      indicatorId: ind.id,
      code: ind.code,
      name: ind.name,
      dimension: ind.dimension,
      groupName: ind.groupName,
      weight: ind.weight,
      quarters: MOU_QUARTERS.map((q) => {
        const s = byQuarter.get(q);
        return {
          quarter: q,
          plan: s?.plan ?? null,
          actual: s?.actual ?? null,
          score: s?.score ?? null,
          note: s?.note ?? null,
        };
      }),
      cumulative: CUMULATIVE_PERIODS.map((p) => ({
        label: p.label,
        value: weighted(byQuarter.get(p.quarter)?.score ?? null, ind.weight),
      })),
    };
  });

  // เรียงตามเลขข้อแบบตัวเลข ไม่ใช่แบบตัวอักษร ไม่งั้น "10" จะมาก่อน "2"
  rows.sort((a, b) => compareCode(a.code, b.code));

  const quartersWithData = MOU_QUARTERS.filter((q) =>
    rows.some((r) => {
      const cell = r.quarters.find((x) => x.quarter === q);
      return cell !== undefined && (cell.plan !== null || cell.actual !== null || cell.score !== null);
    })
  );

  return {
    rows,
    totals: {
      weight: round(rows.reduce((acc, r) => acc + r.weight, 0)),
      cumulative: CUMULATIVE_PERIODS.map((p, i) => ({
        label: p.label,
        value: sumOrNull(rows.map((r) => r.cumulative[i].value)),
      })),
    },
    quartersWithData,
    lastEdit,
  };
}

/** เทียบเลขข้อแบบ "4.10 มาหลัง 4.2" */
export function compareCode(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? -1;
    const y = pb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * คะแนนรวมงวดล่าสุดของทุกส่วนงาน ใช้แสดงในตารางรายชื่อส่วนงาน
 *
 * ดึงทีเดียวทั้งปีบัญชีแล้วคำนวณในหน่วยความจำ แทนการยิงคำถามทีละส่วนงาน 30 รอบ
 */
export async function latestTotalsByDepartment(
  fiscalYearId: number
): Promise<Map<string, { label: string; value: number }>> {
  const indicators = await db.indicator.findMany({
    where: { fiscalYearId },
    select: {
      departmentId: true,
      weight: true,
      mouScores: { select: { quarter: true, score: true } },
    },
  });

  // รวมคะแนนถ่วงน้ำหนักแยกตาม (ส่วนงาน, งวด)
  const totals = new Map<string, Map<string, number>>();
  for (const ind of indicators) {
    const byQuarter = new Map(ind.mouScores.map((s) => [s.quarter, s.score]));
    for (const p of CUMULATIVE_PERIODS) {
      const value = weighted(byQuarter.get(p.quarter) ?? null, ind.weight);
      if (value === null) continue;
      const perDept = totals.get(ind.departmentId) ?? new Map<string, number>();
      perDept.set(p.label, (perDept.get(p.label) ?? 0) + value);
      totals.set(ind.departmentId, perDept);
    }
  }

  // เอางวดท้ายสุดที่มีข้อมูล เพราะงวดที่ยังไม่ถึงกำหนดจะว่างไว้
  const latest = new Map<string, { label: string; value: number }>();
  for (const [departmentId, perPeriod] of totals) {
    for (let i = CUMULATIVE_PERIODS.length - 1; i >= 0; i--) {
      const label = CUMULATIVE_PERIODS[i].label;
      const value = perPeriod.get(label);
      if (value !== undefined) {
        latest.set(departmentId, { label, value: round(value) });
        break;
      }
    }
  }
  return latest;
}
