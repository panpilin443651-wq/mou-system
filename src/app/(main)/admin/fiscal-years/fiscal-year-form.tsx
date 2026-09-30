"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createFiscalYearAction, type FormState } from "@/actions/fiscal-years";

// ฟอร์มเพิ่มปีบัญชีใหม่
//
// ปีบัญชีของ กยท. เริ่ม 1 ต.ค. ของปีก่อนหน้า และจบ 30 ก.ย. ของปีนั้น
// เช่น ปีบัญชี 2570 = 1 ต.ค. 2569 ถึง 30 ก.ย. 2570
// ฟอร์มจึงเติมวันที่ให้อัตโนมัติเมื่อพิมพ์ปี แต่ยังแก้เองได้ถ้าปฏิทินจริงต่างออกไป

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

/** คำนวณช่วงวันที่ตั้งต้นจากปี พ.ศ. คืนค่าเป็นรูปแบบที่ช่องเลือกวันที่ใช้ (ค.ศ.) */
function defaultRange(buddhistYear: number) {
  const gregorianEnd = buddhistYear - 543;
  return {
    startDate: `${gregorianEnd - 1}-10-01`,
    endDate: `${gregorianEnd}-09-30`,
  };
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก..." : "เพิ่มปีบัญชี"}
    </button>
  );
}

export function FiscalYearForm({ suggestedYear }: { suggestedYear: number }) {
  const [state, formAction] = useActionState(createFiscalYearAction, {
    error: null,
  } as FormState);

  const [year, setYear] = useState(String(suggestedYear));
  const [range, setRange] = useState(defaultRange(suggestedYear));

  function handleYearChange(value: string) {
    setYear(value);
    // เติมวันที่ให้อัตโนมัติเฉพาะตอนที่ปีครบ 4 หลักและอยู่ในช่วงที่เป็นไปได้
    const parsed = Number(value);
    if (/^\d{4}$/.test(value) && parsed >= 2500 && parsed <= 2700) {
      setRange(defaultRange(parsed));
    }
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5">
      <div>
        <h2 className="font-semibold">เพิ่มปีบัญชีใหม่</h2>
        <p className="mt-1 text-sm text-slate-600">
          ปีบัญชีใหม่จะยังไม่ถูกใช้งานทันที ต้องกดปุ่ม &quot;ใช้ปี ...&quot; ในตารางด้านบนอีกครั้ง
          เพื่อให้ระบบสลับไปใช้ปีนั้น
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="year" className="mb-1.5 block text-sm font-medium">
            ปีบัญชี (พ.ศ.) <span className="text-red-600">*</span>
          </label>
          <input
            id="year"
            name="year"
            type="text"
            inputMode="numeric"
            required
            value={year}
            onChange={(e) => handleYearChange(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">เช่น 2570</p>
        </div>

        <div>
          <label htmlFor="startDate" className="mb-1.5 block text-sm font-medium">
            วันเริ่มต้น <span className="text-red-600">*</span>
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={range.startDate}
            onChange={(e) => setRange({ ...range, startDate: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="endDate" className="mb-1.5 block text-sm font-medium">
            วันสิ้นสุด <span className="text-red-600">*</span>
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            required
            value={range.endDate}
            onChange={(e) => setRange({ ...range, endDate: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-ink">
          {state.message}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
