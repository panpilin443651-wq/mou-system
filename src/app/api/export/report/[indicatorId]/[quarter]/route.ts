import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { getCurrentUser } from "@/lib/session";
import { canViewDepartment } from "@/lib/permissions";
import { FISCAL_MONTHS, QUARTERS, formatPct, formatPlanNumber } from "@/lib/plan";
import { isPlaceholderCriteria } from "@/lib/scoring";
import {
  getReportDocument,
  reportFileName,
  type PlanDocRow,
  type PlanDocSection,
} from "@/lib/report-document";

// ============================================================================
// ดาวน์โหลดรายงานผลเป็นไฟล์ Word (.docx) ตามแบบฟอร์มของ กยท.
// ============================================================================
// ใช้ฟอนต์ TH Sarabun New ซึ่งเป็นฟอนต์มาตรฐานของหนังสือราชการไทย
// ถ้าเครื่องปลายทางไม่มีฟอนต์นี้ Word จะเลือกฟอนต์ไทยตัวอื่นให้เอง
// ไม่ทำให้เอกสารเสียหาย
//
// หน้าแรก (แนวตั้ง): ข้อมูลตัวชี้วัด ค่าเกณฑ์ สรุปผล
// หน้าถัดไป (แนวนอน): ผลการดำเนินงานตามแผน แผน/ผล 12 เดือน กว้างเกินกระดาษแนวตั้ง
// ============================================================================

export const dynamic = "force-dynamic";

const FONT = "TH SarabunPSK";
const HEADER_BG = "EEF7F1"; // เขียวจาง ตรงกับ brand-50 บนหน้าเว็บ

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 32 })],
  });
}

function body(text: string, indent = 0, opts: { bold?: boolean; color?: string } = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: indent },
    children: [new TextRun({ text, font: FONT, size: 30, ...opts })],
  });
}

/** ข้อความหลายบรรทัด - Word ไม่ตัดบรรทัดจาก \n เอง ต้องแยกเป็น break */
function runs(text: string, size: number, bold?: boolean) {
  return text.split("\n").map(
    (line, i) => new TextRun({ text: line, font: FONT, size, bold, break: i > 0 ? 1 : 0 })
  );
}

function cell(
  text: string,
  opts: {
    bold?: boolean;
    width?: number;
    size?: number;
    span?: number;
    rowSpan?: number;
    shade?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  } = {}
) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.span,
    rowSpan: opts.rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shade ? { type: ShadingType.CLEAR, color: "auto", fill: HEADER_BG } : undefined,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: runs(text, opts.size ?? 28, opts.bold),
      }),
    ],
  });
}

// ---- ตารางผลการดำเนินงานตามแผน ----
// 20 คอลัมน์: ลำดับ · รายการ · ค่าเป้าหมาย · แผน/ผล · 12 เดือน · สะสม · % สะสม · ทั้งปี · % ทั้งปี
const PLAN_COLS = 20;
const SMALL = 18; // 9pt - ตารางกว้าง ตัวอักษรต้องเล็กลงให้พอดีกระดาษ

function planHeaderRows(s: PlanDocSection) {
  const h = (text: string, width?: number) =>
    cell(text, { bold: true, size: SMALL, shade: true, width, align: AlignmentType.CENTER });
  return [
    new TableRow({
      tableHeader: true,
      children: [
        h(s.indexLabel, 5),
        h(s.itemLabel, 19),
        h("ค่าเป้าหมาย", 7),
        h("แผน/ผล", 4),
        ...FISCAL_MONTHS.map((m) => h(m, 3.6)),
        h("สะสม", 5.5),
        h(s.cumLabel, 6),
        h("ทั้งปี", 5.5),
        h(s.yearLabel, 6),
      ],
    }),
  ];
}

function planItemRows(row: PlanDocRow, causeLabel: string) {
  const num = (v: number | null) =>
    cell(formatPlanNumber(v), { size: SMALL, align: AlignmentType.RIGHT });
  const target = [row.target, row.unit].filter(Boolean).join(" ") || "-";

  const rows = [
    new TableRow({
      cantSplit: true,
      children: [
        cell(row.label, { size: SMALL, rowSpan: 2, align: AlignmentType.CENTER }),
        cell(row.title || "-", { size: SMALL, rowSpan: 2 }),
        cell(target, { size: SMALL, rowSpan: 2, align: AlignmentType.CENTER }),
        cell("แผน", { size: SMALL, align: AlignmentType.CENTER }),
        ...row.planMonths.map(num),
        num(row.summary.planCum),
        cell(formatPct(row.summary.cumPct), { size: SMALL, rowSpan: 2, align: AlignmentType.RIGHT }),
        num(row.summary.planYear),
        cell(formatPct(row.summary.yearPct), { size: SMALL, rowSpan: 2, align: AlignmentType.RIGHT }),
      ],
    }),
    new TableRow({
      cantSplit: true,
      children: [
        cell("ผล", { size: SMALL, align: AlignmentType.CENTER }),
        ...row.actualMonths.map(num),
        num(row.summary.actualCum),
        num(row.summary.actualYear),
      ],
    }),
  ];

  // สาเหตุ แนวทางแก้ไข หลักฐาน เป็นข้อความยาว ใส่เป็นแถวเต็มความกว้างใต้รายการ
  const notes = [
    row.cause && `${causeLabel}: ${row.cause}`,
    row.fix && `แนวทางการดำเนินการแก้ไข: ${row.fix}`,
    row.evidence.length > 0 && `หลักฐานประกอบผลการดำเนินงาน: ${row.evidence.join(", ")}`,
  ].filter(Boolean) as string[];
  if (notes.length > 0) {
    rows.push(
      new TableRow({
        children: [cell(notes.join("\n"), { size: SMALL, span: PLAN_COLS })],
      })
    );
  }
  return rows;
}

function planTable(s: PlanDocSection) {
  const rows: TableRow[] = [...planHeaderRows(s)];
  for (const g of s.groups) {
    if (g.heading) {
      rows.push(
        new TableRow({
          children: [cell(g.heading, { size: SMALL, bold: true, shade: true, span: PLAN_COLS })],
        })
      );
    }
    if (g.rows.length === 0) {
      rows.push(
        new TableRow({
          children: [cell("ไม่มีรายการ", { size: SMALL, span: PLAN_COLS })],
        })
      );
    }
    for (const row of g.rows) rows.push(...planItemRows(row, s.causeLabel));
    if (g.levelReportLabel) {
      rows.push(
        new TableRow({
          children: [
            cell(`${g.levelReportLabel}: ${g.levelReport || "-"}`, { size: SMALL, span: PLAN_COLS }),
          ],
        })
      );
    }
  }
  rows.push(
    new TableRow({
      children: [
        cell(s.avgLabel, { size: SMALL, bold: true, span: 17 }),
        cell(formatPct(s.avgCumPct), { size: SMALL, bold: true, align: AlignmentType.RIGHT }),
        cell("", { size: SMALL }),
        cell(formatPct(s.avgYearPct), { size: SMALL, bold: true, align: AlignmentType.RIGHT }),
      ],
    })
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
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

  // ใครเห็นข้อมูลของส่วนงานนั้นได้ ก็ดาวน์โหลดรายงานของส่วนงานนั้นได้
  if (!canViewDepartment(user, doc.indicator.departmentId)) {
    return new Response("ไม่พบตัวชี้วัดนี้", { status: 404 });
  }

  const r = doc.report;
  const ind = doc.indicator;

  const summary: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: doc.title, bold: true, font: FONT, size: 36 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: doc.subtitle, font: FONT, size: 28 })],
    }),

    heading("ข้อมูลตัวชี้วัด"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell("ตัวชี้วัด", { bold: true, width: 25, shade: true }),
            cell("หน่วยวัด", { bold: true, width: 15, shade: true }),
            cell("น้ำหนัก (%)", { bold: true, width: 15, shade: true }),
            cell("ค่าเป้าหมาย", { bold: true, width: 15, shade: true }),
            cell(`ผลการดำเนินงาน ไตรมาส ${quarter}`, { bold: true, width: 30, shade: true }),
          ],
        }),
        new TableRow({
          children: [
            cell(`ข้อ ${ind.code} ${ind.name}`),
            cell(ind.unit),
            cell(String(ind.weight)),
            cell(ind.targetValue === null ? (ind.targetText ?? "-") : String(ind.targetValue)),
            cell(r?.actualValue === null || r === null ? "-" : String(r.actualValue)),
          ],
        }),
        new TableRow({
          children: [
            cell("ทิศทาง", { bold: true, shade: true }),
            cell("สถานะรายงาน", { bold: true, shade: true }),
            cell("ส่วนงาน/หน่วยงานที่รับผิดชอบ", { bold: true, span: 2, shade: true }),
            cell("งบประมาณ (ถ้ามี)", { bold: true, shade: true }),
          ],
        }),
        new TableRow({
          children: [
            cell(doc.directionText),
            cell(doc.statusText),
            cell(doc.owner || "-", { span: 2 }),
            cell(doc.budget || "-"),
          ],
        }),
      ],
    }),

    heading("ค่าเกณฑ์วัด 5 ระดับ"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell("ระดับ", { bold: true, width: 12, shade: true }),
            cell(`ค่าเกณฑ์ (${ind.unit})`, { bold: true, width: 18, shade: true }),
            cell("เกณฑ์ตาม MOU", { bold: true, width: 70, shade: true }),
          ],
        }),
        ...ind.criteria.map(
          (c) =>
            new TableRow({
              children: [
                cell(`ระดับ ${c.level}`),
                cell(c.targetValue === null ? "-" : String(c.targetValue)),
                cell(isPlaceholderCriteria(c.description) ? "-" : c.description),
              ],
            })
        ),
      ],
    }),

    // เงื่อนไขของตัวชี้วัด ต่อท้ายตารางค่าเกณฑ์ 5 ระดับ
    ...(ind.conditions.length > 0
      ? [
          body("เงื่อนไข"),
          ...ind.conditions.map((cond, i) => body(`${i + 1}. ${cond}`, 400)),
        ]
      : []),

    heading("สรุปผล"),
    body(
      `ความก้าวหน้า ${r?.progressPct === null || r === null ? "-" : `${r.progressPct}%`} · คะแนนที่ได้ ${doc.scoreText} · ${doc.submittedText}`
    ),
    ...(r?.scoreOverridden && r.scoreNote
      ? [body(`หมายเหตุ: คะแนนถูกปรับด้วยมือ — ${r.scoreNote}`)]
      : []),
    ...(doc.returned
      ? [
          body(`ส่วนกลางตีกลับผลไตรมาส ${quarter} เมื่อ ${doc.returned.label}`, 0, {
            bold: true,
            color: "B91C1C",
          }),
          ...(doc.returned.due
            ? [body(`! ${doc.returned.due}`, 0, { bold: true, color: "B91C1C" })]
            : []),
          body(`ข้อสังเกตเพื่อให้ผลมีความชัดเจน: ${doc.returned.note}`),
        ]
      : []),
  ];

  const planPart: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "ผลการดำเนินงานตามแผน", bold: true, font: FONT, size: 32, color: "165C3D" }),
      ],
    }),
    body(`${doc.uptoText}${doc.planConfirmed ? "" : " · ยังไม่ได้ส่งแผนการดำเนินงาน"}`),
  ];
  for (const s of doc.planSections) {
    planPart.push(heading(s.title), planTable(s));
  }

  const document = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 30 } },
        heading2: { run: { font: FONT, size: 32, bold: true, color: "165C3D" } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1418 } },
        },
        children: summary,
      },
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 850, right: 850, bottom: 850, left: 850 },
          },
        },
        children: planPart,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  const filename = reportFileName(doc, "docx");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
