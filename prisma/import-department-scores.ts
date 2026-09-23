// ============================================================================
// นำเข้าคะแนนภาพรวมของแต่ละส่วนงาน จากไฟล์ Excel ของส่วนกลาง
// ============================================================================
// ต้นทาง: คะแนน MOU/คะแนนจัดลำดับ MOU 69.xlsx
//   ชีต "คะแนนรวม"  = คะแนนของทั้ง 30 ส่วนงาน เรียงตามคะแนนปี
//   อีก 3 ชีต        = ส่วนงานในแต่ละสายบังคับบัญชา พร้อมคะแนนเฉลี่ยของสาย
// ปลายทาง: prisma/department-scores.json ซึ่งหน้าภาพรวมอ่านไปแสดง
//
// วิธีรัน:
//   npx tsx prisma/import-department-scores.ts            ดูผลอย่างเดียว
//   npx tsx prisma/import-department-scores.ts --apply    เขียนไฟล์จริง
//
// ทำไมต้องมีสคริปต์นี้ ไม่อ่าน Excel ตอนเปิดเว็บ?
//   ตัวเลขชุดนี้ส่วนกลางจัดทำปีละครั้ง ไม่ได้แก้ระหว่างปี
//   และบน Vercel อ่านไฟล์จากดิสก์ไม่ได้ จึงแปลงเป็น JSON เก็บไว้ในโค้ดตั้งแต่ตอน build
//
// การตรวจสอบความถูกต้อง (ถ้าข้อไหนไม่ผ่าน จะไม่ยอมเขียนไฟล์):
//   1. ชื่อส่วนงานทุกแถวต้องจับคู่กับรหัสใน prisma/departments.ts ได้
//   2. ทุกส่วนงานต้องอยู่ในสายบังคับบัญชาสายใดสายหนึ่ง และอยู่ได้สายเดียว
//   3. คะแนนเฉลี่ยที่คำนวณเองต้องตรงกับช่อง "เฉลี่ย" ที่มีอยู่แล้วในไฟล์
//      ข้อนี้สำคัญที่สุด เพราะเป็นตัวยืนยันว่าแบ่งสายถูกกลุ่มจริง ไม่ได้เดา
// ============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { departments } from "./departments";

const SOURCE = "คะแนน MOU/คะแนนจัดลำดับ MOU 69.xlsx";
const SCORE_SHEET = "คะแนนรวม";
const OUTPUT = "prisma/department-scores.json";
// ปีบัญชีของไฟล์ต้นทาง - ปีใหม่ให้เปลี่ยน SOURCE และตัวเลขนี้ แล้วรันใหม่ ปีเก่ายังอยู่ครบ
const FISCAL_YEAR = 2569;

// สายบังคับบัญชา เรียงตามลำดับที่ต้องการให้แสดงบนหน้าเว็บ
//
// "ผวก.กยท." ไม่มีชีตของตัวเองในไฟล์ปีนี้ จึงยังไม่มีส่วนงานในสาย
// คงหัวข้อไว้เพื่อให้โครงหน้าเว็บครบทั้ง 4 สาย พอปีหน้าไฟล์มีข้อมูลก็เติมชีตเข้ามาได้เลย
//
// หมายเหตุ: ชีต "ร.ผวก.(ธ)" เขียนหัวเรื่องข้างในว่า "(ผวก.กยท.)" ซึ่งขัดกับชื่อแท็บ
// ที่นี่ยึดตามชื่อแท็บ คือนับเป็นสายรองผู้ว่าการ (ธ.)
const LINES: { name: string; sheet: string | null }[] = [
  { name: "ผวก.กยท.", sheet: null },
  { name: "รองผวก. (ป.)", sheet: "ร.ผวก. (ป)" },
  { name: "รองผวก. (บ.)", sheet: "ร.ผวก. (บ)" },
  { name: "รองผวก. (ธ.)", sheet: "ร.ผวก.(ธ)" },
];

const apply = process.argv.includes("--apply");

// ชื่อในไฟล์ Excel ที่เขียนไม่ตรงกับรหัสในระบบ
//
// "BU" คือ นธก. (หน่วยธุรกิจ) — ยืนยันจากชีต "ร.ผวก.(ธ)" ในไฟล์เดียวกัน
// ซึ่งเขียนว่า "นธก." และมีคะแนนทั้งสองช่องตรงกันทุกหลัก ไม่ได้เดาจากชื่อ
const ALIAS: Record<string, string> = { BU: "นธก." };

const CODES = new Set(departments.map((d) => d.code));

/** ชื่อในไฟล์บางแถวไม่ใส่จุดท้าย (เช่น "ฝพก" กับ "ฝพก.") จึงเทียบแบบไม่สนจุดท้าย */
function toCode(sourceName: string): string | null {
  const name = sourceName.trim();
  if (ALIAS[name]) return ALIAS[name];
  if (CODES.has(name)) return name;
  const withDot = name.endsWith(".") ? name : name + ".";
  return CODES.has(withDot) ? withDot : null;
}

/** ช่องคะแนนอาจเป็นตัวเลขตรงๆ หรือเป็นสูตรที่ Excel คำนวณค่าไว้แล้ว */
function toNumber(cell: unknown): number | null {
  if (typeof cell === "number") return cell;
  if (cell && typeof cell === "object" && "result" in cell) {
    const result = (cell as { result: unknown }).result;
    if (typeof result === "number") return result;
  }
  return null;
}

function toText(cell: unknown): string {
  if (cell == null) return "";
  if (typeof cell === "object") {
    if ("richText" in cell) {
      return (cell as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    }
    if ("text" in cell) return String((cell as { text: unknown }).text);
    if ("result" in cell) return String((cell as { result: unknown }).result ?? "");
  }
  return String(cell);
}

type LineSheet = { codes: string[]; sourceAverage: number | null; quarter: number | null };

/**
 * อ่านชีตของสายบังคับบัญชาหนึ่งสาย
 * แถว 1-3 เป็นหัวเรื่องและหัวตาราง ข้อมูลจริงเริ่มแถว 4
 */
function readLineSheet(sheet: ExcelJS.Worksheet, unmatched: string[]): LineSheet {
  const codes: string[] = [];
  let sourceAverage: number | null = null;

  // ไฟล์ไม่ได้บอกว่า "คะแนนไตรมาส" เป็นของไตรมาสไหนในชีตคะแนนรวม
  // แต่ชีตสายเขียนไว้ที่หัวตารางแถว 2 คอลัมน์ C เช่น "ไตรมาส 3"
  const quarterMatch = toText(sheet.getRow(2).getCell(3).value).match(/ไตรมาส\s*([1-4])/);
  const quarter = quarterMatch ? Number(quarterMatch[1]) : null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 4) return;

    const sourceName = toText(row.getCell(2).value).trim();
    if (sourceName) {
      const code = toCode(sourceName);
      if (code) codes.push(code);
      else unmatched.push(`ชีต "${sheet.name}" แถว ${rowNumber}: "${sourceName}"`);
    }

    // ช่อง "เฉลี่ย" วางไม่ตรงคอลัมน์กันในแต่ละชีต จึงไล่หาคำว่าเฉลี่ย
    // แล้วเอาตัวเลขในช่องถัดไป แทนการอ้างตำแหน่งคอลัมน์ตายตัว
    if (sourceAverage !== null) return;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (sourceAverage === null && toText(cell.value).trim() === "เฉลี่ย") {
        sourceAverage = toNumber(row.getCell(colNumber + 1).value);
      }
    });
  });

  return { codes, sourceAverage, quarter };
}

type QuarterKey = "1" | "2" | "3" | "4";

type Row = {
  rank: number;
  code: string;
  sourceName: string;
  quarterScores: Record<QuarterKey, number | null>;
  yearScore: number | null;
  line: string | null;
  inSystem: boolean;
};

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE);

  const unmatched: string[] = [];

  // ---- ส่วนที่ 1: คะแนนของแต่ละส่วนงาน จากชีต "คะแนนรวม" ----
  const scoreSheet = workbook.getWorksheet(SCORE_SHEET);
  if (!scoreSheet) throw new Error(`ไม่พบชีต "${SCORE_SHEET}" ในไฟล์ ${SOURCE}`);

  const rows: Row[] = [];
  const fileQuarterScores = new Map<Row, number | null>();

  // แถว 1 เป็นหัวเรื่อง แถว 2 เป็นหัวตาราง ข้อมูลจริงเริ่มแถว 3
  scoreSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 3) return;

    const rank = toNumber(row.getCell(1).value);
    const sourceName = toText(row.getCell(2).value).trim();
    if (rank === null || !sourceName) return;

    const code = toCode(sourceName);
    if (!code) unmatched.push(`ชีต "${SCORE_SHEET}" แถว ${rowNumber}: "${sourceName}"`);

    const newRow: Row = {
      rank,
      code: code ?? sourceName,
      sourceName,
      // ใส่ไตรมาสที่ถูกต้องทีหลัง เมื่ออ่านหัวตารางของชีตสายแล้ว
      quarterScores: { "1": null, "2": null, "3": null, "4": null },
      yearScore: toNumber(row.getCell(4).value),
      line: null,
      inSystem: code !== null,
    };
    rows.push(newRow);
    fileQuarterScores.set(newRow, toNumber(row.getCell(3).value));
  });

  // ---- ส่วนที่ 2: สายบังคับบัญชา จากอีก 3 ชีต ----
  const lines: { name: string; sheet: string | null; averageYearScore: number | null }[] = [];
  const assigned = new Map<string, string>();
  const duplicated: string[] = [];
  const averageMismatch: string[] = [];
  const quarters = new Set<number | null>();

  for (const line of LINES) {
    if (line.sheet === null) {
      lines.push({ name: line.name, sheet: null, averageYearScore: null });
      console.log(`สาย "${line.name}" ไม่มีชีตในไฟล์ปีนี้ — แสดงเป็นสายว่าง`);
      continue;
    }

    const sheet = workbook.getWorksheet(line.sheet);
    if (!sheet) throw new Error(`ไม่พบชีต "${line.sheet}" ในไฟล์ ${SOURCE}`);

    const { codes, sourceAverage, quarter } = readLineSheet(sheet, unmatched);
    quarters.add(quarter);
    for (const code of codes) {
      const owner = assigned.get(code);
      if (owner) duplicated.push(`${code} อยู่ทั้งสาย "${owner}" และ "${line.name}"`);
      else assigned.set(code, line.name);
    }

    // ยืนยันว่าแบ่งสายถูกกลุ่ม โดยเทียบค่าเฉลี่ยที่คำนวณเองกับช่อง "เฉลี่ย" ในไฟล์
    const scores = codes
      .map((c) => rows.find((r) => r.code === c)?.yearScore)
      .filter((v): v is number => typeof v === "number");
    const computed = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    if (computed !== null && sourceAverage !== null && Math.abs(computed - sourceAverage) > 1e-6) {
      averageMismatch.push(
        `สาย "${line.name}": คำนวณได้ ${computed.toFixed(6)} แต่ในไฟล์เขียน ${sourceAverage.toFixed(6)}`
      );
    }

    lines.push({ name: line.name, sheet: line.sheet, averageYearScore: computed });
    console.log(
      `สาย "${line.name}" (ชีต "${line.sheet}") ${codes.length} หน่วย · ` +
        `เฉลี่ยคะแนนปี ${computed?.toFixed(5) ?? "–"}` +
        (sourceAverage === null ? " (ไม่มีช่องเฉลี่ยในไฟล์)" : " ตรงกับในไฟล์")
    );
  }

  for (const row of rows) row.line = assigned.get(row.code) ?? null;

  // ---- ไตรมาสของคอลัมน์ "คะแนนไตรมาส" ----
  // ทุกชีตสายต้องบอกไตรมาสเดียวกัน ไม่งั้นไม่รู้ว่าจะวางตัวเลขไว้ไตรมาสไหน
  const quarterList = [...quarters];
  if (quarterList.length !== 1 || quarterList[0] === null) {
    throw new Error(
      `อ่านไตรมาสจากหัวตารางชีตสายไม่ได้ หรือแต่ละชีตบอกไม่ตรงกัน: ${quarterList.join(", ")}`
    );
  }
  const quarter = quarterList[0];
  const quarterKey = String(quarter) as QuarterKey;
  console.log(`
คอลัมน์ "คะแนนไตรมาส" ในไฟล์นี้เป็นของไตรมาส ${quarter}`);

  // เก็บคะแนนไตรมาสอื่นที่เคยนำเข้าไว้ในปีบัญชีเดียวกัน
  // ไฟล์ของแต่ละไตรมาสมีคะแนนไตรมาสแค่ไตรมาสเดียว ถ้าเขียนทับทั้งไฟล์ ไตรมาสก่อนหน้าจะหายไป
  // ไฟล์ปลายทางเก็บหลายปีบัญชี (หน้าภาพรวมเลือกปีตามปีบัญชีที่ใช้งานอยู่)
  // เขียนทับเฉพาะปีของไฟล์นี้ ปีอื่นเก็บไว้เหมือนเดิม
  type YearData = {
    fiscalYear: number;
    latestQuarter?: number;
    departments: { code: string; quarterScores?: Record<QuarterKey, number | null> }[];
  };
  const store = existsSync(OUTPUT)
    ? (JSON.parse(readFileSync(OUTPUT, "utf8")) as { years: YearData[] })
    : { years: [] };
  const previous = store.years.find((y) => y.fiscalYear === FISCAL_YEAR) ?? null;
  const kept = previous?.departments ?? [];
  for (const row of rows) {
    const old = kept.find((d) => d.code === row.code)?.quarterScores;
    if (old) row.quarterScores = { ...old };
    row.quarterScores[quarterKey] = fileQuarterScores.get(row) ?? null;
  }

  // ---- ตรวจความถูกต้องก่อนเขียนไฟล์ ----
  console.log(
    `\nส่วนงานในไฟล์ ${rows.length} แถว · ในระบบ ${CODES.size} หน่วย · ` +
      `จับคู่รหัสได้ ${rows.filter((r) => r.inSystem).length} แถว`
  );

  const problems: string[] = [];

  if (unmatched.length > 0) {
    problems.push(
      `จับคู่กับรหัสส่วนงานในระบบไม่ได้ ${unmatched.length} แถว:\n  ` + unmatched.join("\n  ")
    );
  }
  if (duplicated.length > 0) {
    problems.push("ส่วนงานอยู่มากกว่าหนึ่งสาย:\n  " + duplicated.join("\n  "));
  }
  if (averageMismatch.length > 0) {
    problems.push(
      "คะแนนเฉลี่ยของสายไม่ตรงกับในไฟล์ (แปลว่าแบ่งสายผิดกลุ่ม):\n  " + averageMismatch.join("\n  ")
    );
  }

  const noLine = rows.filter((r) => r.line === null);
  if (noLine.length > 0) {
    problems.push(
      `ไม่รู้ว่าอยู่สายไหน ${noLine.length} หน่วย: ` + noLine.map((r) => r.code).join(", ")
    );
  }

  if (problems.length > 0) {
    console.log("");
    for (const p of problems) console.log(p);
    throw new Error("\nไฟล์ต้นทางไม่ผ่านการตรวจ — ยังไม่เขียนไฟล์");
  }

  // ส่วนงานที่มีในระบบแต่ไม่มีในไฟล์ ไม่ใช่ข้อผิดพลาด (อาจยังไม่ได้ประเมิน)
  // แต่ต้องบอกให้รู้ เพราะแถวนั้นจะหายไปจากหน้าภาพรวมเฉยๆ
  const inFile = new Set(rows.map((r) => r.code));
  const missing = [...CODES].filter((c) => !inFile.has(c));
  if (missing.length > 0) {
    console.log(`มีในระบบแต่ไม่มีในไฟล์ ${missing.length} หน่วย: ${missing.join(", ")}`);
  }

  const data = {
    source: SOURCE,
    sheet: SCORE_SHEET,
    fiscalYear: FISCAL_YEAR,
    /** ไตรมาสล่าสุดที่นำเข้า — คะแนนปีในไฟล์เป็นคะแนนสะสมถึงไตรมาสนี้ */
    latestQuarter: Math.max(quarter, previous?.latestQuarter ?? 0),
    columns: { quarterScore: "คะแนนไตรมาส", yearScore: "คะแนนปี" },
    lines,
    departments: rows,
  };

  if (!apply) {
    console.log("\n=== ทดลองรัน ยังไม่เขียนไฟล์ ===");
    console.log(`ถ้าผลถูกต้องแล้ว รันซ้ำด้วย --apply เพื่อเขียน ${OUTPUT}`);
    return;
  }

  const years = [
    ...store.years.filter((y) => y.fiscalYear !== FISCAL_YEAR),
    data,
  ].sort((a, b) => a.fiscalYear - b.fiscalYear);
  writeFileSync(OUTPUT, JSON.stringify({ years }, null, 2) + "\n", "utf8");
  console.log(`\n=== เขียน ${OUTPUT} แล้ว (${rows.length} ส่วนงาน · ${lines.length} สาย) ===`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
