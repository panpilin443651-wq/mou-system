"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { copyIndicatorsAction, type FormState } from "@/actions/fiscal-years";

// คัดลอกตัวชี้วัดทั้งชุดจากปีหนึ่งไปอีกปีหนึ่ง
// ใช้ตอนขึ้นปีบัญชีใหม่ที่ยังใช้ตัวชี้วัดชุดเดิม แล้วค่อยแก้เฉพาะตัวเลขที่เปลี่ยน

type YearOption = { id: number; year: number; indicatorCount: number };

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-brand-700 px-5 py-2.5 text-sm font-medium text-brand-ink transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังคัดลอก..." : "คัดลอกตัวชี้วัด"}
    </button>
  );
}

export function CopyIndicatorsForm({ years }: { years: YearOption[] }) {
  const [state, formAction] = useActionState(copyIndicatorsAction, {
    error: null,
  } as FormState);

  // ค่าเริ่มต้นที่ใช้บ่อยที่สุด: คัดลอกจากปีที่มีตัวชี้วัดมากที่สุด ไปยังปีที่ยังว่าง
  const defaultSource = [...years].sort((a, b) => b.indicatorCount - a.indicatorCount)[0];
  const defaultTarget = years.find((y) => y.indicatorCount === 0 && y.id !== defaultSource?.id);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5">
      <div>
        <h2 className="font-semibold">คัดลอกตัวชี้วัดข้ามปี</h2>
        <p className="mt-1 text-sm text-slate-600">
          คัดลอกตัวชี้วัดพร้อมเกณฑ์คะแนน 1–5 ทั้งชุด ไปยังปีบัญชีอื่น
          รายการที่มีรหัสซ้ำกับที่มีอยู่แล้วในปีปลายทางจะถูกข้าม จึงกดซ้ำได้โดยข้อมูลไม่ซ้ำซ้อน
        </p>
        <p className="mt-1 text-sm text-slate-600">
          ผลการดำเนินงานและไฟล์แนบ <strong>จะไม่ถูกคัดลอก</strong> ไปด้วย
          ปีใหม่จึงเริ่มต้นจากศูนย์เสมอ
        </p>
      </div>

      {years.length < 2 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          ต้องมีปีบัญชีอย่างน้อย 2 ปีจึงจะคัดลอกได้ กรุณาเพิ่มปีบัญชีใหม่ก่อน
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sourceYearId" className="mb-1.5 block text-sm font-medium">
                คัดลอกจากปี <span className="text-red-600">*</span>
              </label>
              <select
                id="sourceYearId"
                name="sourceYearId"
                required
                defaultValue={defaultSource ? String(defaultSource.id) : ""}
                className={selectClass}
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year} ({y.indicatorCount.toLocaleString("th-TH")} ตัวชี้วัด)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="targetYearId" className="mb-1.5 block text-sm font-medium">
                ไปยังปี <span className="text-red-600">*</span>
              </label>
              <select
                id="targetYearId"
                name="targetYearId"
                required
                defaultValue={defaultTarget ? String(defaultTarget.id) : ""}
                className={selectClass}
              >
                <option value="">— เลือกปีปลายทาง —</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year} ({y.indicatorCount.toLocaleString("th-TH")} ตัวชี้วัด)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {state.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state.message && (
            <p
              role="status"
              className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-ink"
            >
              {state.message}
            </p>
          )}

          <SubmitButton />
        </>
      )}
    </form>
  );
}
