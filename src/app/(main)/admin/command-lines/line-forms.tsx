"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/actions/command-lines";

// ฟอร์มย่อยของหน้าสายบังคับบัญชา
// แต่ละปุ่มเป็นฟอร์มแยกของตัวเอง เพื่อให้ทำงานได้แม้ JavaScript ยังโหลดไม่เสร็จ
// และข้อความผลลัพธ์ขึ้นตรงจุดที่กด ไม่ต้องไล่หาว่าขึ้นที่ไหน

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return <>{pending ? busy : idle}</>;
}

function Message({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-1 text-xs text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="mt-1 text-xs text-brand-ink">
        {state.message}
      </p>
    );
  }
  return null;
}

/** เพิ่มสายใหม่ */
export function AddLineForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, { error: null } as FormState);
  return (
    <form action={formAction}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="name"
          required
          aria-label="ชื่อสายบังคับบัญชาใหม่"
          placeholder="ชื่อสายใหม่ เช่น รองผวก. (ย.)"
          className={`${inputClass} max-w-sm`}
        />
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
        >
          <Pending idle="+ เพิ่มสาย" busy="กำลังเพิ่ม..." />
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}

/** หนึ่งแถวของสาย: เปลี่ยนชื่อ · เลื่อนขึ้นลง · ลบ */
export function LineRow({
  name,
  departmentCount,
  isFirst,
  isLast,
  renameAction,
  moveUpAction,
  moveDownAction,
  deleteAction,
}: {
  name: string;
  departmentCount: number;
  isFirst: boolean;
  isLast: boolean;
  renameAction: Action;
  moveUpAction: Action;
  moveDownAction: Action;
  deleteAction: Action;
}) {
  const [renameState, rename] = useActionState(renameAction, { error: null } as FormState);
  const [, moveUp] = useActionState(moveUpAction, { error: null } as FormState);
  const [, moveDown] = useActionState(moveDownAction, { error: null } as FormState);
  const [deleteState, remove] = useActionState(deleteAction, { error: null } as FormState);

  const smallButton =
    "min-h-11 whitespace-nowrap rounded-lg border border-slate-300 px-3 text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-start gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5">
      {/* key = ชื่อ: พอเปลี่ยนชื่อสำเร็จ ฟอร์มถูกวาดใหม่ด้วยชื่อใหม่
          ไม่งั้น React ล้างฟอร์มแล้วช่องจะเด้งกลับเป็นชื่อเดิมทั้งที่บันทึกแล้ว */}
      <form key={name} action={rename} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <input
            name="name"
            defaultValue={name}
            required
            aria-label={`ชื่อสาย ${name}`}
            className={inputClass}
          />
          <button type="submit" className={smallButton}>
            <Pending idle="บันทึกชื่อ" busy="กำลังบันทึก..." />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{departmentCount} ส่วนงาน</p>
        <Message state={renameState} />
      </form>

      <div className="flex items-center gap-2">
        <form action={moveUp}>
          <button type="submit" disabled={isFirst} className={smallButton} aria-label={`เลื่อนสาย ${name} ขึ้น`}>
            ▲
          </button>
        </form>
        <form action={moveDown}>
          <button type="submit" disabled={isLast} className={smallButton} aria-label={`เลื่อนสาย ${name} ลง`}>
            ▼
          </button>
        </form>
        <form
          action={remove}
          onSubmit={(e) => {
            const warn =
              departmentCount > 0
                ? `ลบสาย "${name}" หรือไม่ ส่วนงาน ${departmentCount} หน่วยในสายนี้จะกลายเป็น "ยังไม่ระบุสาย"`
                : `ลบสาย "${name}" หรือไม่`;
            if (!confirm(warn)) e.preventDefault();
          }}
        >
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-red-300 px-3 text-sm text-red-700 transition hover:bg-red-50"
          >
            <Pending idle="ลบ" busy="กำลังลบ..." />
          </button>
          <Message state={deleteState} />
        </form>
      </div>
    </div>
  );
}

/** ตารางจัดส่วนงานเข้าสาย บันทึกทั้งตารางครั้งเดียว */
export function AssignmentForm({
  action,
  departments,
  lines,
}: {
  action: Action;
  departments: { id: string; code: string; name: string; commandLineId: string | null }[];
  lines: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(action, { error: null } as FormState);

  // ช่องเลือกสายเก็บค่าใน state เอง ไม่ใช้ defaultValue
  // เพราะ React ล้างฟอร์มหลังบันทึก แล้วช่อง select เด้งกลับไปเป็นค่าตอนโหลดหน้า
  // ทั้งที่บันทึกลงฐานข้อมูลไปแล้ว ผู้ใช้จะเข้าใจผิดว่าบันทึกไม่ติด
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(departments.map((d) => [d.id, d.commandLineId ?? ""]))
  );
  const formRef = useRef<HTMLFormElement>(null);

  // เซิร์ฟเวอร์ส่งข้อมูลชุดใหม่มา (เช่น ลบสายแล้วส่วนงานกลายเป็นไม่ระบุสาย) ให้ยึดของเซิร์ฟเวอร์
  const signature = departments.map((d) => `${d.id}:${d.commandLineId ?? ""}`).join(",");
  useEffect(() => {
    setSelected(Object.fromEntries(departments.map((d) => [d.id, d.commandLineId ?? ""])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // หลังฟอร์มถูกล้าง เติมค่าที่เลือกไว้กลับเข้าช่อง select
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const [id, value] of Object.entries(selected)) {
      const el = form.elements.namedItem(`line_${id}`);
      if (el instanceof HTMLSelectElement) el.value = value;
    }
  }, [state, selected]);

  return (
    <form ref={formRef} action={formAction}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="bg-brand-700 text-white">
              <th className="border border-brand-800 px-4 py-3 text-left font-semibold">ส่วนงาน</th>
              <th className="w-72 border border-brand-800 px-4 py-3 text-left font-semibold">
                สายบังคับบัญชา
              </th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d, i) => (
              <tr key={d.id} className={i % 2 === 1 ? "bg-slate-50" : "bg-surface"}>
                <td className="border border-slate-300 px-4 py-2">
                  <label htmlFor={`line_${d.id}`}>
                    <span className="font-medium">{d.code}</span>{" "}
                    <span className="text-slate-600">{d.name}</span>
                  </label>
                </td>
                <td className="border border-slate-300 px-3 py-1.5">
                  <select
                    id={`line_${d.id}`}
                    name={`line_${d.id}`}
                    value={selected[d.id] ?? ""}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    className={`${inputClass} ${selected[d.id] ? "bg-surface" : "border-amber-400 bg-amber-50"}`}
                  >
                    <option value="">— ยังไม่ระบุสาย —</option>
                    {lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-brand-700 px-5 text-sm font-medium text-white transition hover:bg-brand-800"
        >
          <Pending idle="บันทึกการจัดสาย" busy="กำลังบันทึก..." />
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}
