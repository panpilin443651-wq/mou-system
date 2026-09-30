"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/actions/windows";

// การ์ดตั้งค่าช่วงเวลาเปิด-ปิดของไตรมาสหนึ่ง พร้อมรายการขยายเวลาเฉพาะส่วนงาน

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

export type Exception = {
  id: string;
  departmentCode: string;
  departmentName: string;
  closeAtInput: string;
  closeAtLabel: string;
  reason: string;
};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก..." : label}
    </button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังยกเลิก..." : "ยกเลิกการขยายเวลา"}
    </button>
  );
}

function Message({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-ink">
        {state.message}
      </p>
    );
  }
  return null;
}

export function WindowCard({
  quarter,
  months,
  statusLabel,
  statusTone,
  periodLabel,
  closeAtLabel,
  isForceClosed,
  exceptions,
  departments,
  updateAction,
  addExceptionAction,
  removeActions,
}: {
  quarter: number;
  months: string;
  statusLabel: string;
  statusTone: "open" | "closed";
  /** ช่วง 3 เดือนของไตรมาส เช่น "1 ต.ค. 2568 – 31 ธ.ค. 2568" */
  periodLabel: string;
  /** เวลาสิ้นสุดไตรมาส ใช้บอกว่าขยายเวลาต้องช้ากว่าเมื่อไร */
  closeAtLabel: string;
  isForceClosed: boolean;
  exceptions: Exception[];
  departments: { id: string; code: string; name: string }[];
  updateAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  addExceptionAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  removeActions: Record<string, (prev: FormState, formData: FormData) => Promise<FormState>>;
}) {
  const [updateState, updateFormAction] = useActionState(updateAction, {
    error: null,
  } as FormState);
  const [exceptionState, exceptionFormAction] = useActionState(addExceptionAction, {
    error: null,
  } as FormState);
  const [showException, setShowException] = useState(false);

  return (
    <section className="rounded-xl border border-slate-200 bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
        <h2 className="font-semibold">
          ไตรมาส {quarter}
          <span className="ml-2 text-sm font-normal text-slate-500">({months})</span>
        </h2>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            statusTone === "open"
              ? "bg-brand-50 text-brand-ink"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <form action={updateFormAction} className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="text-sm font-medium">ช่วงรายงานผล</p>
          <p className="mt-0.5 text-sm">{periodLabel}</p>
          <p className="mt-1 text-xs text-slate-500">
            ตาม 3 เดือนของไตรมาส ระบบคิดจากวันที่ให้เอง แก้ที่หน้านี้ไม่ได้
          </p>
        </div>

        <div>
          <label htmlFor={`force-${quarter}`} className="mb-1.5 block text-sm font-medium">
            ปิดฉุกเฉิน
          </label>
          <select
            id={`force-${quarter}`}
            name="isForceClosed"
            defaultValue={isForceClosed ? "true" : "false"}
            className={`${inputClass} bg-surface`}
          >
            <option value="false">เปิดตามช่วงของไตรมาส</option>
            <option value="true">ปิดทันที ไม่ต้องรอสิ้นไตรมาส</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            ใช้เมื่อต้องหยุดรับข้อมูลกะทันหัน
          </p>
        </div>

        <Message state={updateState} />
        <SaveButton label="บันทึก" />
      </form>

      <div className="border-t border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">ขยายเวลาเฉพาะส่วนงาน</h3>
          <span className="text-xs text-slate-500">{exceptions.length} ส่วนงาน</span>
        </div>

        {exceptions.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {exceptions.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{e.departmentCode}</span> ถึง {e.closeAtLabel}
                  <span className="ml-2 text-xs text-slate-600">{e.reason}</span>
                </span>
                <RemoveExceptionForm action={removeActions[e.id]} />
              </li>
            ))}
          </ul>
        )}

        {showException ? (
          <form action={exceptionFormAction} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`dept-${quarter}`}
                  className="mb-1.5 block text-sm font-medium"
                >
                  ส่วนงาน <span className="text-red-600">*</span>
                </label>
                <select
                  id={`dept-${quarter}`}
                  name="departmentId"
                  required
                  defaultValue=""
                  className={`${inputClass} bg-surface`}
                >
                  <option value="">— เลือกส่วนงาน —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor={`excl-${quarter}`}
                  className="mb-1.5 block text-sm font-medium"
                >
                  ปิดใหม่เมื่อ <span className="text-red-600">*</span>
                </label>
                <input
                  id={`excl-${quarter}`}
                  name="closeAt"
                  type="datetime-local"
                  required
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500">
                  ต้องช้ากว่าวันสิ้นสุดไตรมาส ({closeAtLabel})
                </p>
              </div>
            </div>

            <div>
              <label htmlFor={`why-${quarter}`} className="mb-1.5 block text-sm font-medium">
                เหตุผล <span className="text-red-600">*</span>
              </label>
              <input
                id={`why-${quarter}`}
                name="reason"
                type="text"
                required
                minLength={4}
                placeholder="เช่น เกิดอุทกภัยในพื้นที่ ขอผ่อนผัน 2 สัปดาห์"
                className={inputClass}
              />
            </div>

            <Message state={exceptionState} />

            <div className="flex flex-wrap gap-2">
              <SaveButton label="ขยายเวลา" />
              <button
                type="button"
                onClick={() => setShowException(false)}
                className="rounded-lg border border-slate-300 bg-surface px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50"
              >
                ปิดฟอร์ม
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowException(true)}
            className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-brand-ink transition hover:border-brand-600 hover:bg-brand-50"
          >
            + ขยายเวลาให้ส่วนงานที่ขอผ่อนผัน
          </button>
        )}
      </div>
    </section>
  );
}

function RemoveExceptionForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, { error: null } as FormState);
  return (
    <form action={formAction}>
      <RemoveButton />
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
