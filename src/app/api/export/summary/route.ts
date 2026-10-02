import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { canViewDashboard } from "@/lib/permissions";
import {
  getDashboardData,
  parseQuarterFilter,
  quarterFilterLabel,
} from "@/lib/dashboard";
import { formatThaiDateTime } from "@/lib/datetime";

// ============================================================================
// ดาวน์โหลดสรุปผลเป็นไฟล์ Excel (ข้อ 7)
// ============================================================================
// ใช้ตัวเลขชุดเดียวกับหน้าภาพรวมทุกตัว โดยเรียกจาก getDashboardData ที่เดียวกัน
// ถ้าแยกคำนวณเอง ตัวเลขในไฟล์กับบนหน้าจอจะไม่ตรงกันเมื่อมีการแก้สูตรทีหลัง
//
// ทำเป็นไฟล์ .xlsx จริง ไม่ใช่ CSV เพราะรหัสตัวชี้วัดอย่าง "2.1" หรือ "4.1"
// จะถูก Excel แปลงเป็นวันที่เองถ้าเปิดจาก CSV
// ============================================================================

export const dynamic = "force-dynamic";

// สีหัวข้อของระบบ ใช้ให้ตรงกับหน้าเว็บ ไฟล์ Word และไฟล์ Excel ของแผนดำเนินงาน
const HEADER_FILL = "FF1B3B6F";

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: "middle" };
  row.height = 22;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("กรุณาเข้าสู่ระบบ", { status: 401 });
  // ไฟล์นี้คือข้อมูลหน้าภาพรวม ผู้รับผิดชอบส่วนงานเข้าหน้านั้นไม่ได้ จึงดาวน์โหลดไม่ได้ด้วย
  if (!canViewDashboard(user)) return new Response("ไม่มีสิทธิ์", { status: 403 });

  const url = new URL(request.url);
  const quarter = parseQuarterFilter(url.searchParams.get("q") ?? undefined);

  // getDashboardData กรองตามสิทธิ์ให้อยู่แล้ว
  // ผู้รับผิดชอบส่วนงานจึงได้ไฟล์ที่มีแต่ข้อมูลของตัวเอง
  const data = await getDashboardData(user, quarter);

  const book = new ExcelJS.Workbook();
  book.creator = "ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน - การยางแห่งประเทศไทย";
  book.created = new Date();

  // ---- แผ่นที่ 1: สรุปภาพรวม ----
  const overview = book.addWorksheet("สรุปภาพรวม");
  overview.columns = [
    { header: "หัวข้อ", key: "label", width: 34 },
    { header: "ค่า", key: "value", width: 46 },
  ];
  styleHeader(overview.getRow(1));

  const rows: [string, string | number][] = [
    ["ปีบัญชี", data.fiscalYear ? data.fiscalYear.year : "ยังไม่ได้ตั้งปีบัญชี"],
    ["ช่วงข้อมูล", quarterFilterLabel(quarter)],
    ["ตัวชี้วัดทั้งหมด", data.indicatorCount],
    ["ส่งผลแล้ว (ตัวชี้วัด)", data.submittedCount],
    ["ส่งผลแล้ว (%)", data.submittedPct],
    [
      "คะแนนเฉลี่ยถ่วงน้ำหนัก (เต็ม 5)",
      data.averageWeightedScore === null ? "ยังไม่มีผล" : data.averageWeightedScore,
    ],
    ["ส่วนงานที่ยังไม่ส่งผลเลย", data.notStartedDepartments.join(", ") || "ไม่มี"],
    ["วันเวลาที่ออกรายงาน", formatThaiDateTime(new Date())],
    ["ผู้ออกรายงาน", `${user.name} (${user.email})`],
  ];
  for (const [label, value] of rows) overview.addRow({ label, value });

  overview.addRow({});
  const note = overview.addRow({
    label: "หมายเหตุ",
    value:
      "ส่วนงานที่ยังส่งผลไม่ครบจะได้คะแนนรวมน้อยกว่าโดยธรรมชาติ " +
      "ให้ดูคอลัมน์ส่งผลแล้วประกอบทุกครั้งก่อนเปรียบเทียบกัน",
  });
  note.getCell("value").alignment = { wrapText: true, vertical: "top" };
  note.height = 32;

  // ---- แผ่นที่ 2: เปรียบเทียบส่วนงาน ----
  const depts = book.addWorksheet("เปรียบเทียบส่วนงาน");
  depts.columns = [
    { header: "ลำดับ", key: "rank", width: 8 },
    { header: "รหัสส่วนงาน", key: "code", width: 14 },
    { header: "ชื่อส่วนงาน", key: "name", width: 46 },
    { header: "ตัวชี้วัด", key: "total", width: 10 },
    { header: "ส่งผลแล้ว", key: "submitted", width: 12 },
    { header: "ส่งผลแล้ว (%)", key: "pct", width: 14 },
    { header: "น้ำหนักที่มีคะแนนแล้ว (%)", key: "scoredWeight", width: 24 },
    { header: "คะแนนถ่วงน้ำหนัก (เต็ม 5)", key: "score", width: 24 },
  ];
  styleHeader(depts.getRow(1));

  data.departments.forEach((d, i) => {
    depts.addRow({
      rank: d.submittedCount === 0 ? "-" : i + 1,
      code: d.code,
      name: d.name,
      total: d.indicatorCount,
      submitted: d.submittedCount,
      pct: d.submittedPct,
      scoredWeight: d.scoredWeight,
      score: d.submittedCount === 0 ? "-" : d.weightedScore,
    });
  });
  depts.views = [{ state: "frozen", ySplit: 1 }];

  // ---- แผ่นที่ 3: สรุปตามมิติ ----
  const dims = book.addWorksheet("สรุปตามมิติ");
  dims.columns = [
    { header: "มิติ", key: "dimension", width: 42 },
    { header: "ตัวชี้วัด", key: "total", width: 10 },
    { header: "ส่งผลแล้ว", key: "submitted", width: 12 },
    { header: "สัดส่วนน้ำหนัก (%)", key: "weight", width: 18 },
    { header: "คะแนนเฉลี่ย (เต็ม 5)", key: "score", width: 20 },
  ];
  styleHeader(dims.getRow(1));

  for (const d of data.dimensions) {
    dims.addRow({
      dimension: d.dimension,
      total: d.indicatorCount,
      submitted: d.submittedCount,
      weight: d.weightShare,
      score: d.averageScore === null ? "-" : d.averageScore,
    });
  }
  dims.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await book.xlsx.writeBuffer();

  const yearPart = data.fiscalYear ? data.fiscalYear.year : "ไม่ระบุปี";
  const quarterPart = quarter === "latest" ? "ล่าสุด" : `ไตรมาส${quarter}`;
  const filename = `สรุปผล MOU ${yearPart} ${quarterPart}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // ชื่อไฟล์ภาษาไทยต้องเข้ารหัสก่อน ใส่ตรงๆ ใน header ไม่ได้
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
