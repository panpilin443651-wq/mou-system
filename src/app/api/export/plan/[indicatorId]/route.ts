import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { canViewDepartment } from "@/lib/permissions";
import { db } from "@/lib/db";
import { addPlanSheet, planSheetInclude, resolveUpto } from "@/lib/plan-sheet";

// ============================================================================
// ดาวน์โหลดแผนดำเนินงานเป็นไฟล์ Excel ตามแบบฟอร์ม "เอกสารแนบ 4"
// ============================================================================
// ตัวชีตเขียนใน lib/plan-sheet.ts ใช้ร่วมกับไฟล์ Excel รายงานผลรายไตรมาส
// ============================================================================

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ indicatorId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("กรุณาเข้าสู่ระบบ", { status: 401 });

  const { indicatorId } = await params;

  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    include: planSheetInclude,
  });
  if (!indicator) return new Response("ไม่พบตัวชี้วัดนี้", { status: 404 });

  // ตรวจสิทธิ์ที่เซิร์ฟเวอร์เหมือนหน้าเว็บ ไม่ใช่แค่ซ่อนปุ่มดาวน์โหลด
  if (!canViewDepartment(user, indicator.departmentId)) {
    return new Response("คุณไม่มีสิทธิ์ดูแผนของส่วนงานนี้", { status: 403 });
  }

  const upto = resolveUpto(
    new URL(request.url).searchParams.get("upto"),
    indicator.fiscalYear.year,
  );

  const book = new ExcelJS.Workbook();
  book.creator = "ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน - การยางแห่งประเทศไทย";
  book.created = new Date();
  addPlanSheet(book, indicator, upto);

  const buffer = await book.xlsx.writeBuffer();
  const fileName = `แผนดำเนินงาน ${indicator.department.code} ข้อ ${indicator.code} ${indicator.name}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // ชื่อไฟล์ภาษาไทยต้องส่งเป็น filename* แบบเข้ารหัส UTF-8
      // ไม่งั้นเบราว์เซอร์บันทึกเป็นชื่อที่อ่านไม่ออก
      "Content-Disposition": `attachment; filename="plan.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
