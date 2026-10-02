"use client";

import { useFormStatus } from "react-dom";
import { setViewYearAction } from "@/actions/view-year";

// แถบเลือกปีบัญชีที่จะดู ใต้หัวเว็บ - ทุกสิทธิ์ใช้ได้
// เปลี่ยนตัวเลือกแล้วส่งฟอร์มทันที ไม่ต้องกดปุ่ม (ยังมีปุ่มไว้ให้กรณี JavaScript ไม่ทำงาน)

function Select({ years, current }: { years: { year: number; isActive: boolean }[]; current: number }) {
  const { pending } = useFormStatus();
  return (
    <select
      name="year"
      defaultValue={current}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      aria-label="ปีบัญชีที่แสดง"
      className="min-h-9 rounded-lg border border-slate-300 bg-surface px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:opacity-60"
    >
      {years.map((y) => (
        <option key={y.year} value={y.year}>
          {y.year}
          {y.isActive ? " (ปีปัจจุบัน)" : ""}
        </option>
      ))}
    </select>
  );
}

export function YearPicker({
  years,
  current,
}: {
  years: { year: number; isActive: boolean }[];
  current: number;
}) {
  return (
    <form action={setViewYearAction} className="flex items-center gap-2">
      <label className="text-sm text-slate-600">
        <span className="mr-2">ปีบัญชีที่แสดง</span>
        <Select years={years} current={current} />
      </label>
      <noscript>
        <button type="submit" className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm">
          ดู
        </button>
      </noscript>
    </form>
  );
}
