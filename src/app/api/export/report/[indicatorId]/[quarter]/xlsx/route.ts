import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { canViewDepartment } from "@/lib/permissions";
import { QUARTERS } from "@/lib/plan";
import { getReportDocument, reportFileName } from "@/lib/report-document";
import { addPlanSheet } from "@/lib/plan-sheet";

// ============================================================================
// ดาวน์โหลดรายงานผลเป็นไฟล์ Excel (.xlsx)
// ============================================================================
// เนื้อหาเดียวกับหน้ารายงานผลและไฟล์ Word
//   ชีต 1: ข้อมูลตัวชี้วัด ค่าเกณฑ์ 5 ระดับ เงื่อนไข สรุปผล
//   ชีต 2: ผลการดำเนินงานตามแผน (ตารางเดียวกับไฟล์ Excel แผนดำเนินงาน)
// ดึงข้อมูลจาก getReportDocument ตัวเดียวกัน เอกสารทุกแบบจึงตรงกันเสมอ
// ============================================================================

export const dynamic = "force-dynamic";

const HEADING = "FF165C3D"; // สีหัวข้อของระบบ ตรงกับหน้าเว็บและไฟล์ Word
const HEADER_BG = "FFEEF7F1"; // เขียวจาง ตรงกับ brand-50 บนหน้าเว็บ
const COL_LAST = 5;

function box(cell: ExcelJS.Cell) {
  const line = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
  cell.border = { top: line, left: line, bottom: line, right: line };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ indicatorId: string; quarter: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("กรุณาเข้าสู่ระบบ", { status: 401 });

  const { indicatorId, quarter: quarterParam } = await params;
  const quarter = Number(quarterParam);
  if (!QUARTERS.includes(quarter as (typeof QUARTERS)[number])) {
    return new Response("ไตรมาสไม่ถูกต้อง", { status: 400 });
  }

  const doc = await getReportDocument(indicatorId, quarter);
  if (!doc) return new Response("ไม่พบตัวชี้วัดนี้", { status: 404 });

  // ใครเห็นข้อมูลของส่วนงานนั้นได้ ก็ดาวน์โหลดรายงานของส่วนงานนั้นได้ (เหมือนไฟล์ Word)
  if (!canViewDepartment(user, doc.indicator.departmentId)) {
    return new Response("ไม่พบตัวชี้วัดนี้", { status: 404 });
  }

  const r = doc.report;
  const ind = doc.indicator;

  const book = new ExcelJS.Workbook();
  book.creator =
    "ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน - การยางแห่งประเทศไทย";
  book.created = new Date();

  const sheet = book.addWorksheet(`ข้อ ${ind.code} ไตรมาส ${quarter}`.slice(0, 31), {
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 16;
  sheet.getColumn(5).width = 50;

  let row = 1;

  /** แถวข้อความกินเต็มความกว้าง */
  const wide = (value: string, font: Partial<ExcelJS.Font> = {}, center = false) => {
    sheet.mergeCells(row, 1, row, COL_LAST);
    const cell = sheet.getCell(row, 1);
    cell.value = value;
    cell.font = font;
    cell.alignment = { wrapText: true, vertical: "top", horizontal: center ? "center" : "left" };
    row += 1;
    return cell;
  };

  /** แถวตาราง - spans บอกว่าแต่ละช่องกินกี่คอลัมน์ */
  const tableRow = (values: string[], spans: number[], header = false) => {
    let col = 1;
    values.forEach((value, i) => {
      const end = col + spans[i] - 1;
      if (end > col) sheet.mergeCells(row, col, row, end);
      const cell = sheet.getCell(row, col);
      cell.value = value;
      cell.alignment = { wrapText: true, vertical: "top" };
      if (header) {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
      }
      for (let c = col; c <= end; c++) box(sheet.getCell(row, c));
      col = end + 1;
    });
    row += 1;
  };

  // ---- หัวเอกสาร ----
  sheet.getRow(row).height = 34;
  wide(doc.title, { bold: true, size: 14, color: { argb: HEADING } }, true);
  wide(doc.subtitle, {}, true);
  row += 1;

  // ---- ข้อมูลตัวชี้วัด ----
  wide("ข้อมูลตัวชี้วัด", { bold: true, size: 12, color: { argb: HEADING } });
  tableRow(
    ["ตัวชี้วัด", "หน่วยวัด", "น้ำหนัก (%)", "ค่าเป้าหมาย", `ผลการดำเนินงาน ไตรมาส ${quarter}`],
    [1, 1, 1, 1, 1],
    true
  );
  tableRow(
    [
      `ข้อ ${ind.code} ${ind.name}`,
      ind.unit,
      String(ind.weight),
      ind.targetValue === null ? (ind.targetText ?? "-") : String(ind.targetValue),
      r?.actualValue === null || r === null ? "-" : String(r.actualValue),
    ],
    [1, 1, 1, 1, 1]
  );
  tableRow(["ทิศทาง", "สถานะรายงาน", "ส่วนงาน/หน่วยงานที่รับผิดชอบ", "งบประมาณ (ถ้ามี)"], [1, 1, 2, 1], true);
  tableRow([doc.directionText, doc.statusText, doc.owner || "-", doc.budget || "-"], [1, 1, 2, 1]);
  row += 1;

  // ---- ค่าเกณฑ์วัด 5 ระดับ ----
  wide("ค่าเกณฑ์วัด 5 ระดับ", { bold: true, size: 12, color: { argb: HEADING } });
  tableRow(["ระดับ", `ค่าเกณฑ์ (${ind.unit})`, "เกณฑ์ตาม MOU"], [1, 1, 3], true);
  for (const c of ind.criteria) {
    tableRow(
      [
        `ระดับ ${c.level}`,
        c.targetValue === null ? "-" : String(c.targetValue),
        /^ระดับ\s*[1-5]\s*=/.test(c.description) ? "-" : c.description,
      ],
      [1, 1, 3]
    );
  }

  // เงื่อนไขของตัวชี้วัด ต่อท้ายตารางค่าเกณฑ์ 5 ระดับ
  if (ind.conditions.length > 0) {
    row += 1;
    wide("เงื่อนไข", { bold: true });
    ind.conditions.forEach((cond, i) => wide(`${i + 1}. ${cond}`));
  }
  row += 1;

  // ---- สรุปผล ----
  wide("สรุปผล", { bold: true, size: 12, color: { argb: HEADING } });
  tableRow(["ความก้าวหน้า", "คะแนนที่ได้", "สถานะการส่ง"], [1, 1, 3], true);
  tableRow(
    [
      r?.progressPct === null || r === null ? "-" : `${r.progressPct}%`,
      doc.scoreText,
      doc.submittedText,
    ],
    [1, 1, 3]
  );
  if (r?.scoreOverridden && r.scoreNote) {
    wide(`หมายเหตุ: คะแนนถูกปรับด้วยมือ — ${r.scoreNote}`);
  }
  if (doc.returned) {
    row += 1;
    wide(`ส่วนกลางตีกลับผลไตรมาส ${quarter} เมื่อ ${doc.returned.label}`, {
      bold: true,
      color: { argb: "FFB91C1C" },
    });
    if (doc.returned.due) {
      wide(`! ${doc.returned.due}`, { bold: true, color: { argb: "FFB91C1C" } });
    }
    wide(`ข้อสังเกตเพื่อให้ผลมีความชัดเจน: ${doc.returned.note}`);
  }
  row += 1;
  wide("ผลการดำเนินงานตามแผน (แผน/ผลรายเดือน สาเหตุ แนวทางแก้ไข หลักฐาน) อยู่ในชีตถัดไป", {
    italic: true,
    color: { argb: "FF64748B" },
  });

  // ---- ชีตที่ 2: ผลการดำเนินงานตามแผน ตามแบบฟอร์มเอกสารแนบ 4 ----
  addPlanSheet(book, ind, doc.upto, "ผลการดำเนินงานตามแผน");

  const buffer = await book.xlsx.writeBuffer();
  const filename = reportFileName(doc, "xlsx");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // ชื่อไฟล์ภาษาไทยต้องส่งเป็น filename* แบบเข้ารหัส UTF-8
      "Content-Disposition": `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
