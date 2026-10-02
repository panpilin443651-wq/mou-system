import { Fragment } from "react";
import Link from "next/link";
import type { DepartmentMouScores, MouScoreRow } from "@/lib/mou-scores";

// ============================================================================
// ตารางคะแนนรายตัวชี้วัดของส่วนงานหนึ่ง
// ============================================================================
// วางคอลัมน์ให้เหมือนไฟล์ Excel ที่ส่วนกลางใช้กันมาก่อน
// (แผน / คะแนน ของแต่ละไตรมาส แล้วตามด้วยคะแนนถ่วงน้ำหนักสะสม)
// เพราะคนที่ต้องอ่านตารางนี้คุ้นกับไฟล์นั้นอยู่แล้ว ถ้าจัดใหม่จะต้องเรียนรู้ซ้ำ
// ไม่มีคอลัมน์ "ผล" รายไตรมาสแล้ว (เอาออก 2 ต.ค. 2569)
//
// คอลัมน์สะสมระบบคำนวณเองจาก คะแนน x น้ำหนัก / 100 ไม่ได้เก็บไว้ในฐานข้อมูล
// พอแอดมินแก้ช่อง "คะแนน" ตัวเลขสะสมจึงขยับตามทันที ไม่มีทางขัดกันเอง
// ============================================================================

/** ตัวเลขคะแนน - ช่องที่ยังไม่ประเมินจะว่างไว้ ไม่ใช่ศูนย์ */
function Num({ value, digits = 2 }: { value: number | null; digits?: number }) {
  if (value === null) return <span className="text-slate-300">–</span>;
  return (
    <>
      {value.toLocaleString("th-TH", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}
    </>
  );
}

/** แถบสีอ่อนหลังตัวเลขคะแนน ช่วยกวาดสายตาหาข้อที่คะแนนต่ำได้เร็ว
    ใช้ชุดสีเดียวกับป้ายคะแนนในหน้าอื่น ผู้ใช้จะได้ตีความเหมือนกันทั้งระบบ */
function scoreTone(score: number | null): string {
  if (score === null) return "";
  if (score >= 4) return "bg-emerald-50 text-emerald-800";
  if (score >= 3) return "bg-brand-50 text-brand-ink";
  if (score >= 1) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}

export function IndicatorScoreTable({
  scores,
  /** ไตรมาสที่จะแสดง - ปกติคือไตรมาสที่มีข้อมูลแล้วเท่านั้น */
  quarters,
}: {
  scores: DepartmentMouScores;
  quarters: number[];
}) {
  const { rows, totals } = scores;
  const periods = totals.cumulative.map((c) => c.label);

  // ข้อ + ตัวชี้วัด + น้ำหนัก + (แผน/คะแนน ต่อไตรมาส) + งวดสะสม
  const columnCount = 3 + quarters.length * 2 + periods.length;
  const minWidth = quarters.length >= 4 ? "min-w-[68rem]" : "min-w-[56rem]";

  let lastDimension: string | null = null;
  let lastGroup: string | null = null;

  return (
    // ตารางกว้างเกินจอ จึงให้เลื่อนแนวนอนในกรอบตัวเอง ไม่ให้ทั้งหน้าเลื่อนซ้ายขวา
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
      <table className={`w-full ${minWidth} text-sm`}>
        <thead>
          <tr className="border-b border-slate-200 text-slate-600">
            <th rowSpan={2} className="px-4 py-2 text-left font-medium">
              ข้อ
            </th>
            <th rowSpan={2} className="px-3 py-2 text-left font-medium">
              ตัวชี้วัด
            </th>
            <th rowSpan={2} className="px-3 py-2 text-right font-medium">
              น้ำหนัก
            </th>
            {quarters.map((q) => (
              <th
                key={q}
                colSpan={2}
                className="border-l border-slate-200 px-3 py-2 text-center font-medium"
              >
                ไตรมาส {q}
              </th>
            ))}
            <th
              colSpan={periods.length}
              className="border-l border-slate-200 px-3 py-2 text-center font-medium"
            >
              คะแนนถ่วงน้ำหนักสะสม เทียบแผนทั้งปี
            </th>
          </tr>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            {quarters.map((q) => (
              <Fragment key={q}>
                <th className="border-l border-slate-200 px-3 py-1.5 text-right font-medium">
                  แผน
                </th>
                <th className="px-3 py-1.5 text-right font-medium">คะแนน</th>
              </Fragment>
            ))}
            {periods.map((label) => (
              <th
                key={label}
                className="border-l border-slate-200 px-3 py-1.5 text-right font-medium"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            // แทรกแถวชื่อมิติเมื่อขึ้นมิติใหม่ ให้อ่านตารางยาวๆ แล้วยังรู้ว่าอยู่ตรงไหน
            const newDimension = row.dimension !== null && row.dimension !== lastDimension;
            if (newDimension) {
              lastDimension = row.dimension;
              lastGroup = null;
            }
            // หัวข้อกลุ่มของตัวชี้วัดย่อย เช่น 4.1 กับ 4.2 อยู่ใต้หัวข้อเดียวกัน
            const newGroup = row.groupName !== null && row.groupName !== lastGroup;
            if (newGroup) lastGroup = row.groupName;

            return (
              <Fragment key={row.indicatorId}>
                {newDimension && (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td
                      colSpan={columnCount}
                      className="px-4 py-1.5 text-xs font-semibold text-slate-600"
                    >
                      {row.dimension}
                    </td>
                  </tr>
                )}
                {newGroup && (
                  <tr className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-500">
                      {row.code.split(".")[0]}
                    </td>
                    <td colSpan={columnCount - 1} className="px-3 py-2 text-slate-600">
                      {row.groupName}
                    </td>
                  </tr>
                )}
                <ScoreRowCells row={row} quarters={quarters} />
              </Fragment>
            );
          })}
        </tbody>

        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <td className="px-4 py-2.5" />
            <td className="px-3 py-2.5">คะแนนรวม</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{totals.weight}%</td>
            {quarters.map((q) => (
              <td key={q} colSpan={2} className="border-l border-slate-200" />
            ))}
            {totals.cumulative.map((c) => (
              <td
                key={c.label}
                className="border-l border-slate-200 px-3 py-2.5 text-right tabular-nums"
              >
                <Num value={c.value} digits={3} />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ScoreRowCells({ row, quarters }: { row: MouScoreRow; quarters: number[] }) {
  // หมายเหตุเก็บรายไตรมาส แต่แสดงรวมกันใต้ชื่อตัวชี้วัด จะได้ไม่ต้องมีคอลัมน์เพิ่ม
  const notes = row.quarters.filter((q) => q.note);

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="whitespace-nowrap px-4 py-2.5 align-top tabular-nums">{row.code}</td>
      <td className="px-3 py-2.5">
        <Link
          href={`/indicators/${row.indicatorId}`}
          className="-my-2.5 block py-2.5 text-brand-ink underline-offset-2 hover:underline"
        >
          {row.name}
        </Link>
        {notes.map((n) => (
          <p key={n.quarter} className="mt-0.5 text-xs text-slate-500">
            หมายเหตุไตรมาส {n.quarter}: {n.note}
          </p>
        ))}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums">
        {row.weight}%
      </td>

      {row.quarters
        .filter((q) => quarters.includes(q.quarter))
        .map((q) => (
          <Fragment key={q.quarter}>
            <td className="whitespace-nowrap border-l border-slate-200 px-3 py-2.5 text-right align-top tabular-nums text-slate-600">
              <Num value={q.plan} />
            </td>
            <td className="whitespace-nowrap px-1.5 py-2.5 text-right align-top tabular-nums">
              <span className={`inline-block rounded px-2 py-0.5 ${scoreTone(q.score)}`}>
                <Num value={q.score} />
              </span>
            </td>
          </Fragment>
        ))}

      {row.cumulative.map((c) => (
        <td
          key={c.label}
          className="whitespace-nowrap border-l border-slate-200 px-3 py-2.5 text-right align-top tabular-nums"
        >
          <Num value={c.value} digits={3} />
        </td>
      ))}
    </tr>
  );
}
