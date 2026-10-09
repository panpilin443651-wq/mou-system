"use client";

import { useActionState, useMemo } from "react";
import { SuccessDialog } from "@/components/success-dialog";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { saveMouScores, type MouScoreFormState } from "@/actions/mou-scores";
import type { MouScoreRow } from "@/lib/mou-scores";

// ============================================================================
// ฟอร์มกรอกคะแนนประเมินรายตัวชี้วัด (เฉพาะส่วนกลาง)
// ============================================================================
// กรอกทีละไตรมาส ไม่ใช่ทั้งปีในหน้าเดียว เพราะ
//   1. คะแนนมาเป็นรอบไตรมาสอยู่แล้ว
//   2. ถ้าเปิดทั้ง 4 ไตรมาสพร้อมกัน จะมีช่องกรอกเกิน 130 ช่องในหน้าเดียว
//      ซึ่งหาที่จะแก้ยากและเผลอทับไตรมาสที่ไม่ได้ตั้งใจแก้ได้ง่าย
// ============================================================================

const initialState: MouScoreFormState = { error: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-lg bg-brand-700 px-5 text-sm font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก..." : "บันทึกคะแนน"}
    </button>
  );
}

/** ช่องกรอกตัวเลขคะแนน - เว้นว่างได้ หมายถึงยังไม่ประเมิน */
function ScoreInput({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: number | null;
  label: string;
}) {
  return (
    <input
      type="number"
      name={name}
      aria-label={label}
      defaultValue={defaultValue ?? ""}
      // step ละเอียดถึง 4 ตำแหน่ง เท่ากับความละเอียดของไฟล์ Excel ต้นฉบับ
      step="0.0001"
      min="0"
      max="5"
      placeholder="–"
      className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
    />
  );
}

export function MouScoreForm({
  departmentId,
  quarter,
  rows,
  backHref,
}: {
  departmentId: string;
  quarter: number;
  rows: MouScoreRow[];
  backHref: string;
}) {
  const [state, formAction] = useActionState(saveMouScores, initialState);
  // ผูกกับ state ที่ได้จากการบันทึกเท่านั้น pop up จะได้ไม่เด้งซ้ำทุกครั้งที่หน้าแสดงผลใหม่
  const dialogState = useMemo(
    () => ({
      error: state.error,
      success: Boolean(state.savedAt),
      message: `บันทึกคะแนนไตรมาส ${quarter} เรียบร้อยแล้ว`,
    }),
    [state, quarter],
  );

  let lastDimension: string | null = null;
  let lastGroup: string | null = null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="quarter" value={quarter} />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="px-4 py-2.5 font-medium">ข้อ</th>
              <th className="px-3 py-2.5 font-medium">ตัวชี้วัด</th>
              <th className="px-3 py-2.5 text-right font-medium">น้ำหนัก</th>
              <th className="px-3 py-2.5 text-right font-medium">แผน</th>
              <th className="px-3 py-2.5 text-right font-medium">คะแนน</th>
              <th className="px-4 py-2.5 font-medium">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cell = row.quarters.find((q) => q.quarter === quarter);
              const newDimension = row.dimension !== null && row.dimension !== lastDimension;
              if (newDimension) {
                lastDimension = row.dimension;
                lastGroup = null;
              }
              const newGroup = row.groupName !== null && row.groupName !== lastGroup;
              if (newGroup) lastGroup = row.groupName;

              return (
                <tr key={row.indicatorId} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 align-top tabular-nums">{row.code}</td>
                  <td className="px-3 py-2">
                    {newDimension && (
                      <p className="mb-1 text-xs font-semibold text-slate-500">{row.dimension}</p>
                    )}
                    {newGroup && (
                      <p className="mb-1 text-xs text-slate-500">{row.groupName}</p>
                    )}
                    {row.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">
                    {row.weight}%
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <ScoreInput
                      name={`plan-${row.indicatorId}`}
                      defaultValue={cell?.plan ?? null}
                      label={`แผน ข้อ ${row.code}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <ScoreInput
                      name={`score-${row.indicatorId}`}
                      defaultValue={cell?.score ?? null}
                      label={`คะแนน ข้อ ${row.code}`}
                    />
                  </td>
                  <td className="px-4 py-2 align-top">
                    <input
                      type="text"
                      name={`note-${row.indicatorId}`}
                      aria-label={`หมายเหตุ ข้อ ${row.code}`}
                      defaultValue={cell?.note ?? ""}
                      className="w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <SuccessDialog state={dialogState} />

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton />
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium transition hover:bg-slate-50"
        >
          กลับไปหน้าคะแนน
        </Link>
      </div>

      <p className="text-xs text-slate-500">
        เว้นช่องว่างไว้ = ยังไม่ประเมิน ซึ่งต่างจากการกรอก 0 ที่แปลว่าได้ศูนย์คะแนนจริง
      </p>
    </form>
  );
}
