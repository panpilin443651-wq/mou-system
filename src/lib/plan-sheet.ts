import type ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import {
  FISCAL_MONTHS,
  MONTH_COUNT,
  PLAN_SECTIONS,
  PLAN_SECTION_AVG_LABEL,
  PLAN_SECTION_CAUSE_LABEL,
  PLAN_SECTION_CUM_LABEL,
  PLAN_SECTION_GUIDE,
  PLAN_SECTION_INDEX_LABEL,
  PLAN_SECTION_ITEM_LABEL,
  PLAN_SECTION_TITLE,
  PLAN_SECTION_YEAR_LABEL,
  currentFiscalMonthIndex,
  planLevelGroups,
  summarizeRow,
  toMonths,
} from "@/lib/plan";

// ============================================================================
// ชีตแผนดำเนินงาน/ผลการดำเนินงานตามแบบฟอร์ม "เอกสารแนบ 4"
// ============================================================================
// ใช้ร่วมกันสองไฟล์: Excel แผนดำเนินงาน และ Excel รายงานผลรายไตรมาส
// วางคอลัมน์ให้ตรงกับแบบฟอร์มต้นฉบับ เพื่อให้ไฟล์ที่ได้ส่งต่อเข้าระบบเดิม
// ของ กยท. ได้โดยไม่ต้องจัดตารางใหม่
//
// ช่องเปอร์เซ็นต์เขียนเป็น "สูตร" ไม่ใช่ตัวเลขสำเร็จ เพราะผู้รับไฟล์
// มักแก้ตัวเลขรายเดือนต่อในไฟล์ ถ้าเขียนเป็นค่าตายตัวเปอร์เซ็นต์จะไม่ขยับตาม
// ============================================================================

/** ส่วนที่ต้อง include ตอนดึงตัวชี้วัด เพื่อเขียนชีตแผน */
export const planSheetInclude = {
  department: { select: { code: true, name: true } },
  fiscalYear: { select: { year: true } },
  planHeader: true,
  criteria: { orderBy: { level: "asc" } },
  planLevelReports: true,
  plans: {
    orderBy: [{ section: "asc" }, { criteriaLevel: "asc" }, { sortOrder: "asc" }],
    include: {
      attachments: {
        orderBy: { uploadedAt: "asc" },
        select: { originalName: true },
      },
    },
  },
} satisfies Prisma.IndicatorInclude;

export type IndicatorForPlanSheet = Prisma.IndicatorGetPayload<{
  include: typeof planSheetInclude;
}>;

/** ลำดับคอลัมน์ตามแบบฟอร์ม: A ลำดับ · B รายการ · C ค่าเป้าหมาย · D หน่วยนับ · E แผน/ผล */
const COL_INDEX = 1;
const COL_TITLE = 2;
const COL_TARGET = 3;
const COL_UNIT = 4;
const COL_KIND = 5;
const COL_MONTH_FIRST = 6; // F..Q = 12 เดือน
const COL_CUM = COL_MONTH_FIRST + MONTH_COUNT; // R ผลสะสม
const COL_CUM_PCT = COL_CUM + 1; // S % สะสม
const COL_YEAR = COL_CUM + 2; // T ผลทั้งปี
const COL_YEAR_PCT = COL_CUM + 3; // U % ทั้งปี
const COL_CAUSE = COL_CUM + 4;
const COL_FIX = COL_CUM + 5;
const COL_EVIDENCE = COL_CUM + 6;
const COL_LAST = COL_EVIDENCE;

const HEADING = "FF165C3D"; // สีหัวข้อของระบบ ใช้ให้ตรงกับหน้าเว็บและไฟล์ Word
const HEADER_BG = "FFEEF7F1"; // เขียวจาง ตรงกับ brand-50 บนหน้าเว็บ

/** แปลงเลขคอลัมน์เป็นตัวอักษร (A, B, ... AA) สำหรับเขียนสูตรใน Excel */
function colLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function box(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FFBFBFBF" } },
    left: { style: "thin", color: { argb: "FFBFBFBF" } },
    bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
    right: { style: "thin", color: { argb: "FFBFBFBF" } },
  };
}

/**
 * เดือนที่ใช้คิดยอดสะสม
 *
 * รับจาก ?upto= ที่หน้าเว็บส่งมา เพื่อให้ไฟล์ที่ดาวน์โหลดคิดช่วงเดียวกับที่เห็นบนจอ
 * ถ้าไม่ได้ส่งมา (เช่น เปิด URL ตรง ๆ) ใช้เดือนปัจจุบันของปีบัญชีนั้น
 */
export function resolveUpto(raw: string | null, fiscalYear: number): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= MONTH_COUNT) return n;
  return currentFiscalMonthIndex(fiscalYear);
}

/** เพิ่มชีตแผน/ผลการดำเนินงานลงในไฟล์ - upto = จำนวนเดือนที่ใช้คิดยอดสะสม */
export function addPlanSheet(
  book: ExcelJS.Workbook,
  indicator: IndicatorForPlanSheet,
  upto: number,
  name = `ตัวชี้วัดที่ ${indicator.code}`,
) {
  const sheet = book.addWorksheet(name.slice(0, 31), {
    views: [{ state: "frozen", xSplit: COL_KIND, ySplit: 0 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.getColumn(COL_INDEX).width = 8;
  sheet.getColumn(COL_TITLE).width = 42;
  sheet.getColumn(COL_TARGET).width = 12;
  sheet.getColumn(COL_UNIT).width = 10;
  sheet.getColumn(COL_KIND).width = 7;
  for (let i = 0; i < MONTH_COUNT; i++)
    sheet.getColumn(COL_MONTH_FIRST + i).width = 8;
  sheet.getColumn(COL_CUM).width = 11;
  sheet.getColumn(COL_CUM_PCT).width = 11;
  sheet.getColumn(COL_YEAR).width = 11;
  sheet.getColumn(COL_YEAR_PCT).width = 11;
  sheet.getColumn(COL_CAUSE).width = 26;
  sheet.getColumn(COL_FIX).width = 22;
  sheet.getColumn(COL_EVIDENCE).width = 22;

  let r = 1;

  // ---- หัวเอกสาร ----
  sheet.mergeCells(r, COL_INDEX, r, COL_LAST);
  const titleCell = sheet.getCell(r, COL_INDEX);
  titleCell.value =
    `รายงานผลการดำเนินงานตามตัวชี้วัดที่ ${indicator.code} ${indicator.name} ` +
    `ส่วนงาน/หน่วยงาน ${indicator.department.code} ${indicator.department.name} ` +
    `ประจำปีบัญชี ${indicator.fiscalYear.year}`;
  titleCell.font = { bold: true, size: 14, color: { argb: HEADING } };
  titleCell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  sheet.getRow(r).height = 34;
  r += 1;

  const headerLines: [string, string][] = [
    ["ชื่อตัวชี้วัด", indicator.name],
    ["ส่วนงาน/หน่วยงานที่รับผิดชอบตัวชี้วัด", indicator.planHeader?.owner ?? ""],
    ["งบประมาณ (ถ้ามี)", indicator.planHeader?.budget ?? ""],
  ];
  for (const [label, value] of headerLines) {
    sheet.getCell(r, COL_INDEX).value = label;
    sheet.getCell(r, COL_INDEX).font = { bold: true };
    sheet.mergeCells(r, COL_TITLE, r, COL_LAST);
    sheet.getCell(r, COL_TITLE).value = value;
    sheet.getCell(r, COL_TITLE).alignment = {
      wrapText: true,
      vertical: "middle",
    };
    r += 1;
  }
  r += 1;

  // ---- สองตารางของแบบฟอร์ม ----
  for (const section of PLAN_SECTIONS) {
    const rows = indicator.plans.filter((p) => p.section === section);

    sheet.mergeCells(r, COL_INDEX, r, COL_LAST);
    const sectionCell = sheet.getCell(r, COL_INDEX);
    sectionCell.value = PLAN_SECTION_TITLE[section];
    sectionCell.font = { bold: true, size: 12, color: { argb: HEADING } };
    r += 1;

    // หัวตารางสองชั้น: ชั้นบนคลุมกลุ่มเดือน ชั้นล่างเป็นชื่อเดือน
    const head1 = r;
    const head2 = r + 1;

    const spanned: [number, string][] = [
      [COL_INDEX, PLAN_SECTION_INDEX_LABEL[section]],
      [COL_TITLE, PLAN_SECTION_ITEM_LABEL[section]],
      [COL_TARGET, "ค่าเป้าหมาย"],
      [COL_UNIT, "หน่วยนับ"],
      [COL_KIND, "แผน/ผล"],
      [COL_CUM, PLAN_SECTION_CUM_LABEL[section]],
      [COL_CUM_PCT, "ร้อยละ"],
      [COL_YEAR, PLAN_SECTION_YEAR_LABEL[section]],
      [COL_YEAR_PCT, "ร้อยละ"],
      [COL_CAUSE, PLAN_SECTION_CAUSE_LABEL[section]],
      [COL_FIX, "แนวทางการดำเนินการแก้ไข"],
      [COL_EVIDENCE, "หลักฐานประกอบผลการดำเนินงาน"],
    ];
    for (const [col, label] of spanned) {
      sheet.mergeCells(head1, col, head2, col);
      const cell = sheet.getCell(head1, col);
      cell.value = label;
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    }

    sheet.mergeCells(
      head1,
      COL_MONTH_FIRST,
      head1,
      COL_MONTH_FIRST + MONTH_COUNT - 1,
    );
    const monthGroup = sheet.getCell(head1, COL_MONTH_FIRST);
    monthGroup.value =
      section === "TARGET"
        ? "กำหนดเป้าหมายแต่ละเดือน"
        : "กำหนดระยะเวลาการดำเนินงานแต่ละขั้นตอน/กิจกรรม";
    monthGroup.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    FISCAL_MONTHS.forEach((m, i) => {
      const cell = sheet.getCell(head2, COL_MONTH_FIRST + i);
      cell.value = m;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    for (const rowNo of [head1, head2]) {
      for (let c = COL_INDEX; c <= COL_LAST; c++) {
        const cell = sheet.getCell(rowNo, c);
        cell.font = { bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: HEADER_BG },
        };
        box(cell);
      }
    }
    sheet.getRow(head1).height = 30;
    r = head2 + 1;

    // ---- บรรทัดข้อมูล: 1 รายการ = 2 แถว (แผน/ผล) ----
    const pctRows: number[] = [];

    /** เขียน 1 รายการ (2 แถว แผน/ผล) label = เลขลำดับที่แสดง เช่น "3" หรือ "2.1" */
    const writeRow = (row: (typeof rows)[number], label: string) => {
      const planMonths = toMonths(row.planMonths);
      const actualMonths = toMonths(row.actualMonths);
      const summary = summarizeRow({ planMonths, actualMonths }, upto);

      const rowPlan = r;
      const rowActual = r + 1;

      for (const [col, value] of [
        [COL_INDEX, label],
        [COL_TITLE, row.title],
        [COL_TARGET, row.targetValue],
        [COL_UNIT, row.unit ?? ""],
        [COL_CAUSE, row.causeNote ?? ""],
        [COL_FIX, row.correctiveAction ?? ""],
        // หลักฐานเป็นไฟล์แนบแล้ว ในไฟล์ Excel จึงเขียนเป็นรายชื่อไฟล์
        // ถ้าเป็นแถวเก่าที่เคยกรอกหลักฐานเป็นข้อความไว้ ให้คงข้อความนั้นไว้ด้วย
        [
          COL_EVIDENCE,
          [row.evidence, ...row.attachments.map((a) => a.originalName)]
            .filter(Boolean)
            .join("\n"),
        ],
      ] as [number, string | number | null][]) {
        sheet.mergeCells(rowPlan, col, rowActual, col);
        const cell = sheet.getCell(rowPlan, col);
        cell.value = value;
        cell.alignment = { vertical: "top", wrapText: true };
      }

      sheet.getCell(rowPlan, COL_KIND).value = "แผน";
      sheet.getCell(rowActual, COL_KIND).value = "ผล";

      planMonths.forEach((v, i) => {
        sheet.getCell(rowPlan, COL_MONTH_FIRST + i).value = v;
      });
      actualMonths.forEach((v, i) => {
        sheet.getCell(rowActual, COL_MONTH_FIRST + i).value = v;
      });

      // สูตรยอดรวม เขียนเป็นสูตรจริงเพื่อให้แก้ตัวเลขต่อในไฟล์แล้วยอดขยับตาม
      const first = colLetter(COL_MONTH_FIRST);
      const lastMonthCol = colLetter(COL_MONTH_FIRST + MONTH_COUNT - 1);
      const cumLastCol = colLetter(COL_MONTH_FIRST + Math.max(0, upto - 1));

      sheet.getCell(rowPlan, COL_CUM).value = {
        formula: `SUM(${first}${rowPlan}:${cumLastCol}${rowPlan})`,
        result: summary.planCum,
      };
      sheet.getCell(rowActual, COL_CUM).value = {
        formula: `SUM(${first}${rowActual}:${cumLastCol}${rowActual})`,
        result: summary.actualCum,
      };
      sheet.getCell(rowPlan, COL_YEAR).value = {
        formula: `SUM(${first}${rowPlan}:${lastMonthCol}${rowPlan})`,
        result: summary.planYear,
      };
      sheet.getCell(rowActual, COL_YEAR).value = {
        formula: `SUM(${first}${rowActual}:${lastMonthCol}${rowActual})`,
        result: summary.actualYear,
      };

      // ช่องร้อยละใช้ร่วมกันสองแถว ตามแบบฟอร์มต้นฉบับ
      const cumCol = colLetter(COL_CUM);
      const yearCol = colLetter(COL_YEAR);
      for (const [col, refCol, value] of [
        [COL_CUM_PCT, cumCol, summary.cumPct],
        [COL_YEAR_PCT, yearCol, summary.yearPct],
      ] as [number, string, number][]) {
        sheet.mergeCells(rowPlan, col, rowActual, col);
        sheet.getCell(rowPlan, col).value = {
          formula: `IF(${refCol}${rowPlan}=0,0,${refCol}${rowActual}/${refCol}${rowPlan})`,
          result: value / 100,
        };
        sheet.getCell(rowPlan, col).numFmt = "0.0%";
        sheet.getCell(rowPlan, col).alignment = {
          horizontal: "right",
          vertical: "middle",
        };
      }
      pctRows.push(rowPlan);

      for (const rowNo of [rowPlan, rowActual]) {
        for (let c = COL_INDEX; c <= COL_LAST; c++)
          box(sheet.getCell(rowNo, c));
      }

      r += 2;
    };

    /** แถวที่กินเต็มความกว้างตาราง ใช้กับหัวค่าเกณฑ์และรายงานผลของระดับ */
    const writeWide = (
      value: string,
      opts: { bold?: boolean; fill?: string; height?: number },
    ) => {
      sheet.mergeCells(r, COL_INDEX, r, COL_LAST);
      const cell = sheet.getCell(r, COL_INDEX);
      cell.value = value;
      cell.alignment = { wrapText: true, vertical: "top" };
      if (opts.bold) cell.font = { bold: true };
      if (opts.fill)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: opts.fill },
        };
      for (let c = COL_INDEX; c <= COL_LAST; c++) box(sheet.getCell(r, c));
      if (opts.height) sheet.getRow(r).height = opts.height;
      r += 1;
    };

    if (section === "TARGET") {
      rows.forEach((row, index) => writeRow(row, String(index + 1)));
    } else {
      // ขั้นตอนการดำเนินงาน แบ่งตามค่าเกณฑ์ระดับ 1-5 + เงื่อนไขอื่นๆ เหมือนหน้าเว็บ
      const groups = planLevelGroups(
        indicator.criteria,
        indicator.unit,
        indicator.conditions,
      );
      const levels = groups.map((g) => g.level);
      for (const c of groups) {
        writeWide(
          [c.value ? `${c.title} : ${c.value}` : c.title, c.description]
            .filter(Boolean)
            .join("\n"),
          { bold: true, fill: HEADER_BG, height: c.description ? 36 : undefined },
        );
        rows
          .filter((row) => row.criteriaLevel === c.level)
          .forEach((row, index) => writeRow(row, `${c.level}.${index + 1}`));
        const report =
          indicator.planLevelReports.find((p) => p.level === c.level)?.text ??
          "";
        writeWide(`รายงานผลการดำเนินงานของ${c.shortTitle}: ${report}`, {
          height: report ? 36 : undefined,
        });
      }
      const orphans = rows.filter(
        (row) =>
          row.criteriaLevel === null || !levels.includes(row.criteriaLevel),
      );
      if (orphans.length > 0) {
        writeWide("ขั้นตอนที่ยังไม่ระบุค่าเกณฑ์ระดับ", { bold: true });
        orphans.forEach((row, index) => writeRow(row, String(index + 1)));
      }
    }

    // ---- บรรทัดค่าเฉลี่ยท้ายตาราง ----
    sheet.mergeCells(r, COL_INDEX, r, COL_MONTH_FIRST + MONTH_COUNT);
    const avgLabel = sheet.getCell(r, COL_INDEX);
    avgLabel.value = PLAN_SECTION_AVG_LABEL[section];
    avgLabel.font = { bold: true };

    for (const col of [COL_CUM_PCT, COL_YEAR_PCT]) {
      const letter = colLetter(col);
      const cell = sheet.getCell(r, col);
      cell.value =
        pctRows.length === 0
          ? 0
          : {
              formula: `AVERAGE(${pctRows.map((n) => `${letter}${n}`).join(",")})`,
            };
      cell.numFmt = "0.0%";
      cell.font = { bold: true };
      cell.alignment = { horizontal: "right" };
    }
    for (let c = COL_INDEX; c <= COL_LAST; c++) box(sheet.getCell(r, c));
    r += 2;

    // ---- คำแนะนำท้ายตาราง (คัดจากแบบฟอร์มต้นฉบับ) ----
    sheet.mergeCells(r, COL_INDEX, r, COL_LAST);
    const guide = sheet.getCell(r, COL_INDEX);
    guide.value = PLAN_SECTION_GUIDE[section];
    guide.alignment = { wrapText: true, vertical: "top" };
    guide.font = { size: 10, color: { argb: "FF64748B" } };
    sheet.getRow(r).height = 42;
    r += 2;
  }
  return sheet;
}
