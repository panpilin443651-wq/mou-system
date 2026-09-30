"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/actions/users";

// ตั้งรหัสผ่านใหม่ให้ผู้ใช้คนอื่น (กรณีลืมรหัสผ่าน)
// แยกเป็นฟอร์มของตัวเอง ไม่รวมกับฟอร์มแก้ไขข้อมูลบัญชี
// เพื่อไม่ให้เผลอเปลี่ยนรหัสผ่านตอนที่ตั้งใจจะแก้แค่ชื่อหรือสังกัด

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-slate-400 px-5 py-2.5 text-sm font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
    </button>
  );
}

export function ResetPasswordForm({
  action,
  userName,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  userName: string;
}) {
  const [state, formAction] = useActionState(action, { error: null } as FormState);

  return (
    // key เปลี่ยนเมื่อบันทึกสำเร็จ ทำให้ React สร้างฟอร์มใหม่และล้างช่องรหัสผ่านให้เอง
    <form
      key={state.success ? "done" : "editing"}
      action={formAction}
      className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5"
    >
      <div>
        <h2 className="font-semibold">ตั้งรหัสผ่านใหม่ให้ {userName}</h2>
        <p className="mt-1 text-sm text-slate-600">
          ใช้เมื่อผู้ใช้ลืมรหัสผ่าน ระบบเก็บรหัสผ่านแบบเข้ารหัสทางเดียว
          จึงเปิดดูรหัสเดิมไม่ได้ ทำได้แค่ตั้งใหม่ให้เท่านั้น
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            รหัสผ่านใหม่ <span className="text-red-600">*</span>
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">อย่างน้อย 8 ตัวอักษร</p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium">
            ยืนยันรหัสผ่านใหม่ <span className="text-red-600">*</span>
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-ink">
          ตั้งรหัสผ่านใหม่แล้ว แจ้งรหัสให้เจ้าตัวและบอกให้เปลี่ยนเองที่หน้า &quot;บัญชีของฉัน&quot;
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
