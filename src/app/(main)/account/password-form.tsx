"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction, type PasswordState } from "@/actions/account";

const initialState: PasswordState = { error: null, success: false };

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-700 px-5 py-2.5 font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
    </button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialState);

  return (
    // key เปลี่ยนเมื่อบันทึกสำเร็จ ทำให้ React สร้างฟอร์มใหม่และล้างช่องรหัสผ่านให้เอง
    <form key={state.success ? "done" : "editing"} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="currentPassword" className="mb-1.5 block text-sm font-medium">
          รหัสผ่านปัจจุบัน
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium">
          รหัสผ่านใหม่
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium">
          ยืนยันรหัสผ่านใหม่
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

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-ink">
          เปลี่ยนรหัสผ่านเรียบร้อยแล้ว
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
