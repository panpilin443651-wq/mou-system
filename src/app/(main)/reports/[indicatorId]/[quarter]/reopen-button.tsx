"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/actions/reports";
import { SuccessDialog } from "@/components/success-dialog";

// ปุ่มดึงรายงานที่ส่งแล้วกลับมาเป็นร่างเพื่อแก้ไข
// แยกเป็นปุ่มต่างหาก ไม่ให้แก้ทับของที่ส่งไปแล้วโดยไม่รู้ตัว

function Button() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="whitespace-nowrap rounded-lg border border-brand-700 bg-surface px-4 py-2 text-sm font-medium text-brand-ink transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังดึงกลับ..." : "ดึงกลับมาแก้ไข"}
    </button>
  );
}

export function ReopenButton({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, { error: null } as FormState);

  return (
    <form action={formAction}>
      <Button />
      <SuccessDialog state={state} />
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
