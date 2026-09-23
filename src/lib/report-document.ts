import { db } from "@/lib/db";
import { scoreLabel } from "@/lib/scoring";
import { formatThaiDateTime } from "@/lib/datetime";
import { QUARTER_MONTHS } from "@/lib/plan";

// ============================================================================
// รวบรวมข้อมูลของรายงานหนึ่งฉบับ ตามแบบฟอร์มรายงานผลของ กยท. (เอกสารแนบ 3)
// ============================================================================
// ใช้ร่วมกันทั้งไฟล์ Word และหน้าพิมพ์ PDF
// ถ้าแยกกันดึงข้อมูล เอกสารสองแบบจะไม่ตรงกันเมื่อมีการแก้ทีหลัง
// ============================================================================

export type ReportDocument = NonNullable<Awaited<ReturnType<typeof getReportDocument>>>;

export async function getReportDocument(indicatorId: string, quarter: number) {
  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    include: {
      department: { select: { code: true, name: true } },
      fiscalYear: { select: { year: true } },
      criteria: { orderBy: { level: "asc" } },
      reports: {
        where: { quarter },
        include: { submittedBy: { select: { name: true } } },
      },
    },
  });
  if (!indicator) return null;

  const report = indicator.reports[0] ?? null;

  return {
    indicator,
    report,
    quarter,
    quarterMonths: QUARTER_MONTHS[quarter],
    /** หัวเรื่องของเอกสาร ตรงตามแบบฟอร์ม */
    title: `รายงานผลการดำเนินงานตามตัวชี้วัดที่ ${indicator.code} ${indicator.name}`,
    subtitle: `${indicator.department.code} ${indicator.department.name} · ปีบัญชี ${indicator.fiscalYear.year} · ไตรมาส ${quarter} (${QUARTER_MONTHS[quarter]})`,
    scoreText: scoreLabel(report?.scoreLevel ?? null),
    submittedText: report?.submittedAt
      ? `ส่งเมื่อ ${formatThaiDateTime(report.submittedAt)}${report.submittedBy ? ` โดย ${report.submittedBy.name}` : ""}`
      : "ยังไม่ได้ส่ง",
  };
}

// หัวข้อข้อความยาว (ปัญหาอุปสรรค ปัจจัย) และผลรายค่าเกณฑ์พร้อมไฟล์แนบ
// ถูกเอาออกจากรายงานผลแล้ว (17 ก.ย. 2569) เอกสารจึงเหลือข้อมูลตัวชี้วัด ค่าเกณฑ์ และสรุปผล

/** ชื่อไฟล์ที่ผู้ใช้จะได้ ตั้งให้สื่อความหมายและเรียงง่ายเมื่อมีหลายไฟล์ */
export function reportFileName(doc: ReportDocument, extension: string) {
  const safe = doc.indicator.name.replace(/[\\/:*?"<>|]/g, " ").trim();
  return `รายงานผล ${doc.indicator.department.code} ข้อ ${doc.indicator.code} ${safe} ไตรมาส ${doc.quarter}.${extension}`;
}
