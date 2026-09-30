"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/actions/fiscal-years";

// ปุ่มสลับปีบัญชีที่ระบบใช้งานอยู่
// ทำเป็นฟอร์มจริง ไม่ใช่ปุ่ม onClick เพราะต้องเรียก Server Action
// และเพื่อให้ใช้งานได้แม้ JavaScript ยังโหลดไม่เสร็จ

function Button({ year }: { year: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="whitespace-nowrap rounded-lg border border-brand-700 min-h-11 px-3 py-2 text-sm font-medium text-brand-ink transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังเปลี่ยน..." : `ใช้ปี ${year}`}
    </button>
  );
}

export function ActivateButton({
  action,
  year,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  year: number;
}) {
  const [state, formAction] = useActionState(action, { error: null } as FormState);

  return (
    <form action={formAction}>
      <Button year={year} />
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
