"use client";

import {
  DEFAULT_RETURN_DUE_TIME,
  RETURN_DUE_FIELD,
  RETURN_DUE_TIME_FIELD,
  todayBangkokInput,
} from "@/lib/return-due";

// ช่องเลือก "ต้องแก้ไขให้เสร็จภายในวันที่ ... เวลา ..." ข้างปุ่มตีกลับแผน/ผล (เฉพาะส่วนกลาง)
// ไม่ใส่ required เพราะช่องหน้าแผนอยู่ในฟอร์มเดียวกับปุ่มบันทึกร่าง
// ถ้าใส่ จะบันทึกแผนไม่ได้จนกว่าจะเลือกวันที่ - ตรวจตอนกดตีกลับแทน (hasReturnDueDate)

const inputClass =
  "min-h-11 rounded-lg border border-red-300 bg-surface px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500";

export function ReturnDueInput({ form }: { form?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-red-900">
      <label className="flex flex-wrap items-center gap-2">
        ต้องแก้ไขให้เสร็จภายในวันที่
        <input
          type="date"
          name={RETURN_DUE_FIELD}
          form={form}
          min={todayBangkokInput()}
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-2">
        เวลา
        <input
          type="time"
          name={RETURN_DUE_TIME_FIELD}
          form={form}
          defaultValue={DEFAULT_RETURN_DUE_TIME}
          className={inputClass}
        />
        น.
      </label>
    </div>
  );
}

/** "! ต้องแก้ไขให้เสร็จภายในวันที่ ..." ใช้ในแจ้งเตือนและแถบแดงที่ถูกตีกลับ */
export function DueBadge({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-0.5 text-sm font-semibold text-white ${className}`}
    >
      <span aria-hidden="true">!</span>
      {text}
    </span>
  );
}

/** ตรวจก่อนตีกลับว่าเลือกวันที่แล้ว - ใช้ใน onClick ของปุ่มตีกลับ */
export function hasReturnDueDate(form: HTMLFormElement | null): boolean {
  const input = form?.elements.namedItem(RETURN_DUE_FIELD);
  return input instanceof HTMLInputElement && input.value !== "";
}
