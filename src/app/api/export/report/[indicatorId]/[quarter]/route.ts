import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { getCurrentUser } from "@/lib/session";
import { canViewDepartment } from "@/lib/permissions";
import { QUARTERS } from "@/lib/plan";
import { isPlaceholderCriteria } from "@/lib/scoring";
import {
  getReportDocument,
  reportFileName,
} from "@/lib/report-document";

// ============================================================================
// ดาวน์โหลดรายงานผลเป็นไฟล์ Word (.docx) ตามแบบฟอร์มของ กยท.
// ============================================================================
// ใช้ฟอนต์ TH Sarabun New ซึ่งเป็นฟอนต์มาตรฐานของหนังสือราชการไทย
// ถ้าเครื่องปลายทางไม่มีฟอนต์นี้ Word จะเลือกฟอนต์ไทยตัวอื่นให้เอง
// ไม่ทำให้เอกสารเสียหาย
// ============================================================================

export const dynamic = "force-dynamic";

const FONT = "TH SarabunPSK";

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 32 })],
  });
}

function body(text: string, indent = 0) {
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: indent },
    children: [new TextRun({ text, font: FONT, size: 30 })],
  });
}

function cell(text: string, opts: { bold?: boolean; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: FONT, size: 28, bold: opts.bold })],
      }),
    ],
  });
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

  const children: (Paragraph | Table)[] = [
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
            cell("ตัวชี้วัด", { bold: true, width: 25 }),
            cell("หน่วยวัด", { bold: true, width: 15 }),
            cell("น้ำหนัก (%)", { bold: true, width: 15 }),
            cell("ค่าเป้าหมาย", { bold: true, width: 15 }),
            cell(`ผลการดำเนินงาน ไตรมาส ${quarter}`, { bold: true, width: 30 }),
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
      ],
    }),

    heading("ค่าเกณฑ์วัด 5 ระดับ"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell("ระดับ", { bold: true, width: 12 }),
            cell(`ค่าเกณฑ์ (${ind.unit})`, { bold: true, width: 18 }),
            cell("เกณฑ์ตาม MOU", { bold: true, width: 70 }),
          ],
        }),
        ...ind.criteria.map(
          (c) =>
            new TableRow({
              children: [
                cell(`ระดับ ${c.level}`),
                cell(c.targetValue === null ? "-" : String(c.targetValue)),
                cell(/^ระดับ\s*[1-5]\s*=/.test(c.description) ? "-" : c.description),
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
  ];

  const document = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 30 } },
        heading2: { run: { font: FONT, size: 32, bold: true, color: "1B3B6F" } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1418 } },
        },
        children,
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

// ป้องกัน eslint เตือนเรื่อง import ที่ยังไม่ได้ใช้ในบางเวอร์ชันของ docx
void BorderStyle;
