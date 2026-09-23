import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ============================================================================
// นำเข้า "คะแนนรายตัวชี้วัด" ของแต่ละส่วนงาน จากไฟล์ Excel ของส่วนกลาง
// ============================================================================
// ต้นทาง 3 ไฟล์ หนึ่งชีตต่อหนึ่งส่วนงาน รวม 30 ชีต เท่ากับ 30 ส่วนงานในระบบ
//
//   คะแนน MOU/คะแนน MOU กจร กจส 69.xlsx      8 ชีต  (กจร. และ กจส.)
//   คะแนน MOU/คะแนน MOU เขต 69.xlsx          7 ชีต  (เขต 7 เขต)
//   คะแนน MOU/คะแนน MOU ส่วนกลาง 2569.xlsx  15 ชีต  (ฝ่าย สำนัก สถาบัน หน่วย)
//
// วิธีใช้
//   npx tsx prisma/import-indicator-scores.ts           ตรวจอย่างเดียว ไม่เขียนไฟล์
//   npx tsx prisma/import-indicator-scores.ts --apply   เขียนทับ prisma/indicator-scores.json
//
// ทำไมต้องอ่านหัวตาราง แทนที่จะอ้างชื่อคอลัมน์ตายตัว?
//   ไฟล์จริงไม่ได้เหมือนกันทุกชีต - ฝยศ. กับ ฝกค. มีไตรมาส 1-4
//   ส่วนอีก 28 ชีตมีแค่ไตรมาส 2-4 คอลัมน์จึงเลื่อนกันไป 3 ช่อง
//   และหัวคอลัมน์บางชีตพิมพ์ตกหล่น เช่น "เทียไตรมาส" "หมาเยหตุ"
//   ถ้าอ้างตำแหน่งตายตัวจะอ่านผิดโดยไม่มีอะไรฟ้อง
// ============================================================================

type SheetSource = { file: string; sheet: string; code: string };

const FILE_FACTORY = "คะแนน MOU/คะแนน MOU กจร กจส 69.xlsx";
const FILE_REGION = "คะแนน MOU/คะแนน MOU เขต 69.xlsx";
const FILE_CENTRAL = "คะแนน MOU/คะแนน MOU ส่วนกลาง 2569.xlsx";

/** ชีต -> รหัสส่วนงานในระบบ เขียนไว้ตรงๆ เพราะชื่อชีตสั้นกว่ารหัสจริง */
const SHEETS: SheetSource[] = [
  ...["กจร.1", "กจร.2", "กจร.4", "กจร.5", "กจร.6", "กจส.1", "กจส.2", "กจส.3"].map((s) => ({
    file: FILE_FACTORY,
    sheet: s,
    code: s,
  })),
  ...(
    [
      ["น", "กยท.ข.น."],
      ["อนบ", "กยท.ข.อนบ."],
      ["อนล", "กยท.ข.อนล."],
      ["ตบ", "กยท.ข.ตบ."],
      ["ตก", "กยท.ข.ตก."],
      ["ตล", "กยท.ข.ตล."],
      ["กอ", "กยท.ข.กอ."],
    ] as const
  ).map(([sheet, code]) => ({ file: FILE_REGION, sheet, code })),
  ...(
    [
      ["สผว", "สผว."],
      ["สตส", "สตส."],
      ["ฝกม", "ฝกม."],
      ["ฝยศ", "ฝยศ."],
      ["ฝกค", "ฝกค."],
      ["ฝทม", "ฝทม."],
      ["ฝทส", "ฝทส."],
      ["ฝบท", "ฝบท."],
      ["ฝพก", "ฝพก."],
      ["ฝสผ", "ฝสผ."],
      ["ฝศย.", "ฝศย."],
      ["ฝอย.", "ฝอย."],
      ["สวย", "สวย."],
      // ไฟล์เขียนว่า "BU" ซึ่งหมายถึงหน่วยธุรกิจ ตรงกับรหัส นธก. ในระบบ
      // ยืนยันได้จากชื่อหน่วยในชีตที่เขียนว่า "หน่วยธุรกิจ"
      ["BU", "นธก."],
      ["หกป", "หกป."],
    ] as const
  ).map(([sheet, code]) => ({ file: FILE_CENTRAL, sheet, code })),
];

// ---------------------------------------------------------------------------
// ตัวช่วยอ่านค่าจากช่อง
// ---------------------------------------------------------------------------

type Cell = ExcelJS.Cell | undefined;

/** ข้อความในช่อง รองรับทั้งข้อความธรรมดา ข้อความหลายรูปแบบ และผลลัพธ์ของสูตร */
function text(cell: Cell): string {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return v.result === null || v.result === undefined ? "" : String(v.result);
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

/**
 * ตัวเลขในช่อง - คืน null ถ้าไม่ใช่ตัวเลข
 *
 * ช่องที่เป็นสูตรจะเอา "ผลลัพธ์ที่ Excel คำนวณค้างไว้" เท่านั้น
 * ถ้าไฟล์ยังไม่เคยเปิดคำนวณ หรือสูตรอ้างช่องว่าง จะไม่มีผลลัพธ์ติดมา
 * กรณีนั้นถือว่า "ยังไม่มีคะแนน" ไม่ใช่ศูนย์ เพราะศูนย์แปลว่าได้ 0 คะแนนจริง
 */
function num(cell: Cell): number | null {
  const v = cell?.value;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "result" in v) {
    const r = v.result;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return v.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

/** ตัดช่องว่างทั้งหมดออก ใช้เทียบหัวคอลัมน์ที่พิมพ์เว้นวรรคไม่เหมือนกัน */
const squash = (s: string) => s.replace(/\s+/g, "");

/** ปัดเศษเหลือ 4 ตำแหน่ง พอสำหรับคะแนนเต็ม 5 และทำให้ไฟล์ JSON ไม่ยาวเกินจำเป็น */
function round(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// อ่านหัวตาราง
// ---------------------------------------------------------------------------

type QuarterColumns = { quarter: number; plan: number; actual: number; score: number };

type SheetLayout = {
  headerRow: number;
  weight: number;
  quarters: QuarterColumns[];
  /** คอลัมน์คะแนนถ่วงน้ำหนักสะสม เทียบกับแผนทั้งปี เรียงตามงวด 6/9/12 เดือน */
  cumulative: { label: string; column: number }[];
  note: number | null;
};

function readLayout(ws: ExcelJS.Worksheet, sheetName: string): SheetLayout {
  // หัวตารางมีสองบรรทัด บรรทัดบนคือชื่อกลุ่ม (ไตรมาส 2 / 6 เดือน) บรรทัดล่างคือชื่อช่อง (แผน/ผล)
  // หาบรรทัดล่างก่อน โดยดูว่าคอลัมน์ A เขียนว่า "ตัวชี้วัด"
  let headerRow = 0;
  for (let r = 1; r <= 12; r++) {
    if (squash(text(ws.getRow(r).getCell(1))) === "ตัวชี้วัด") headerRow = r;
  }
  if (headerRow < 2) throw new Error(`ชีต "${sheetName}": หาแถวหัวตารางไม่เจอ`);

  const top = ws.getRow(headerRow - 1);
  const sub = ws.getRow(headerRow);
  const lastCol = Math.max(ws.columnCount, 24);

  let weight = 0;
  let note: number | null = null;
  const byQuarter = new Map<number, Partial<QuarterColumns>>();
  const cumulative: { label: string; column: number }[] = [];

  for (let c = 1; c <= lastCol; c++) {
    const group = squash(text(top.getCell(c)));
    const field = squash(text(sub.getCell(c)));

    if (field === "ร้อยละ") {
      weight = c;
      continue;
    }
    // "หมาเยหตุ" คือคำว่า "หมายเหตุ" ที่พิมพ์สลับตัวอักษรในบางชีต
    if (field === "หมายเหตุ" || field === "หมาเยหตุ") {
      note = c;
      continue;
    }

    const q = group.match(/^ไตรมาส(\d)$/);
    if (q) {
      const n = Number(q[1]);
      const slot = byQuarter.get(n) ?? { quarter: n };
      if (field === "แผน") slot.plan = c;
      else if (field === "ผล") slot.actual = c;
      else if (field === "ผลไตรมาส") slot.score = c;
      byQuarter.set(n, slot);
      continue;
    }

    // งวดสะสม เอาเฉพาะช่อง "เทียบปี" เพราะเป็นคะแนนถ่วงน้ำหนักที่เทียบกับแผนทั้งปี
    const period = group.match(/^(\d+)เดือน$/);
    if (period && field === "เทียบปี") {
      cumulative.push({ label: `${period[1]} เดือน`, column: c });
    }
  }

  if (!weight) throw new Error(`ชีต "${sheetName}": หาคอลัมน์น้ำหนัก (ร้อยละ) ไม่เจอ`);

  const quarters = [...byQuarter.values()]
    .filter(
      (q): q is QuarterColumns =>
        q.plan !== undefined && q.actual !== undefined && q.score !== undefined
    )
    .sort((a, b) => a.quarter - b.quarter);

  if (quarters.length === 0) throw new Error(`ชีต "${sheetName}": หาคอลัมน์ไตรมาสไม่เจอเลย`);

  return { headerRow, weight, quarters, cumulative, note };
}

// ---------------------------------------------------------------------------
// อ่านแถวตัวชี้วัด
// ---------------------------------------------------------------------------

export type ScoreRow = {
  /** เลขข้อตามไฟล์ เช่น "1" หรือ "4.1" */
  code: string;
  name: string;
  /** ชื่อมิติที่ตัวชี้วัดนี้อยู่ใต้ */
  dimension: string | null;
  /** true = เป็นหัวข้อใหญ่ที่มีข้อย่อยอยู่ข้างใต้ ไม่มีคะแนนของตัวเอง */
  isGroup: boolean;
  weight: number | null;
  quarters: { quarter: number; plan: number | null; actual: number | null; score: number | null }[];
  cumulative: { label: string; value: number | null }[];
  note: string | null;
};

export type DepartmentScores = {
  code: string;
  /** ชื่อเต็มตามที่เขียนไว้ในชีต */
  sourceName: string;
  file: string;
  sheet: string;
  /** ไตรมาสที่ไฟล์นี้ประเมิน - ส่วนใหญ่เริ่มที่ไตรมาส 2 */
  quarters: number[];
  cumulativeLabels: string[];
  rows: ScoreRow[];
  /** แถว "คะแนน" ท้ายตาราง ใช้เทียบว่าอ่านครบไหม */
  totals: { weight: number | null; cumulative: { label: string; value: number | null }[] };
};

function readSheet(ws: ExcelJS.Worksheet, src: SheetSource): DepartmentScores {
  const layout = readLayout(ws, src.sheet);
  const sourceName = text(ws.getRow(2).getCell(1)).replace(/\s+/g, " ").trim();

  const rows: ScoreRow[] = [];
  let dimension: string | null = null;
  let totals: DepartmentScores["totals"] = { weight: null, cumulative: [] };

  for (let r = layout.headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = text(row.getCell(1)).replace(/\s+/g, " ").trim();
    if (!label) continue;

    // แถวสรุปท้ายตาราง
    if (squash(label) === "คะแนน") {
      totals = {
        weight: round(num(row.getCell(layout.weight))),
        cumulative: layout.cumulative.map((c) => ({
          label: c.label,
          value: round(num(row.getCell(c.column))),
        })),
      };
      break;
    }

    // หัวข้อมิติ ไม่มีเลขข้อนำหน้า
    if (label.startsWith("มิติ")) {
      dimension = label;
      continue;
    }

    // แถวตัวชี้วัด ขึ้นต้นด้วยเลขข้อ เช่น "1." หรือ "4.1"
    const m = label.match(/^(\d+(?:\.\d+)*)\s*[.)]?\s*(.*)$/);
    if (!m) continue;

    const weightValue = num(row.getCell(layout.weight));
    const name = (m[2] || label).trim();

    rows.push({
      code: m[1],
      name,
      dimension,
      // ไม่มีน้ำหนัก = เป็นหัวข้อใหญ่ที่แตกเป็นข้อย่อย เช่น "4. ความสามารถในการบริหารแผนลงทุน"
      isGroup: weightValue === null,
      weight: round(weightValue),
      quarters: layout.quarters.map((q) => ({
        quarter: q.quarter,
        plan: round(num(row.getCell(q.plan))),
        actual: round(num(row.getCell(q.actual))),
        score: round(num(row.getCell(q.score))),
      })),
      cumulative: layout.cumulative.map((c) => ({
        label: c.label,
        value: round(num(row.getCell(c.column))),
      })),
      note: layout.note ? text(row.getCell(layout.note)).replace(/\s+/g, " ").trim() || null : null,
    });
  }

  return {
    code: src.code,
    sourceName,
    file: src.file,
    sheet: src.sheet,
    quarters: layout.quarters.map((q) => q.quarter),
    cumulativeLabels: layout.cumulative.map((c) => c.label),
    rows,
    totals,
  };
}

// ---------------------------------------------------------------------------
// ตัวโปรแกรมหลัก
// ---------------------------------------------------------------------------

async function main() {
  const apply = process.argv.includes("--apply");
  const root = resolve(import.meta.dirname, "..");

  const books = new Map<string, ExcelJS.Workbook>();
  for (const file of new Set(SHEETS.map((s) => s.file))) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(resolve(root, file));
    books.set(file, wb);
  }

  const departments: DepartmentScores[] = [];
  const problems: string[] = [];

  for (const src of SHEETS) {
    const ws = books.get(src.file)?.getWorksheet(src.sheet);
    if (!ws) {
      problems.push(`ไม่พบชีต "${src.sheet}" ในไฟล์ ${src.file}`);
      continue;
    }
    const parsed = readSheet(ws, src);
    departments.push(parsed);

    // ตรวจความถูกต้อง: น้ำหนักของข้อที่มีคะแนนจริง ต้องรวมได้ 100
    const scored = parsed.rows.filter((r) => !r.isGroup);
    const sum = Math.round(scored.reduce((acc, r) => acc + (r.weight ?? 0), 0) * 100) / 100;
    if (Math.abs(sum - 100) > 0.51) {
      problems.push(`${src.code} (ชีต ${src.sheet}): น้ำหนักรวม ${sum} ไม่ใช่ 100`);
    }
    if (parsed.totals.weight !== null && Math.abs(parsed.totals.weight - sum) > 0.51) {
      problems.push(
        `${src.code}: น้ำหนักที่อ่านได้ ${sum} ไม่ตรงกับแถวคะแนนในไฟล์ ${parsed.totals.weight}`
      );
    }
    if (scored.length === 0) problems.push(`${src.code}: อ่านตัวชี้วัดไม่ได้เลย`);
  }

  // ---------- รายงานผล ----------
  console.log(`อ่านได้ ${departments.length} ส่วนงาน จาก ${SHEETS.length} ชีต\n`);
  for (const d of departments) {
    const scored = d.rows.filter((r) => !r.isGroup).length;
    const groups = d.rows.length - scored;
    console.log(
      `  ${d.code.padEnd(11)} ${String(scored).padStart(2)} ตัวชี้วัด` +
        (groups ? ` (+${groups} หัวข้อกลุ่ม)` : "                  ") +
        `  ไตรมาส ${d.quarters.join(",")}  · ${d.sourceName}`
    );
  }

  if (problems.length) {
    console.log(`\nพบปัญหา ${problems.length} รายการ`);
    for (const p of problems) console.log("  - " + p);
  } else {
    console.log("\nตรวจแล้วไม่พบปัญหา: ทุกส่วนงานน้ำหนักรวม 100 และตรงกับแถวคะแนนในไฟล์");
  }

  const out = {
    sources: [...new Set(SHEETS.map((s) => s.file))],
    fiscalYear: 2569,
    departments,
  };

  if (!apply) {
    console.log("\n(ตรวจอย่างเดียว ยังไม่เขียนไฟล์ - ใส่ --apply เพื่อเขียนจริง)");
    return;
  }

  writeFileSync(
    resolve(root, "prisma/indicator-scores.json"),
    JSON.stringify(out, null, 2) + "\n",
    "utf8"
  );
  console.log("\nเขียน prisma/indicator-scores.json แล้ว");
}

main();
