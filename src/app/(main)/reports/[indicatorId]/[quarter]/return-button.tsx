"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/actions/reports";

// ปุ่ม "ตีกลับผล" ของส่วนกลาง สำหรับผลที่ส่งมาแล้วแต่ผิดพลาด
// ถามเหตุผลก่อนเสมอ เหตุผลไปแสดงบนหน้ารายงานและในแจ้งเตือนของหัวหน้าส่วนงาน

function Button({ noteRef }: { noteRef: React.RefObject<HTMLInputElement | null> }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        const note = window.prompt(
          "ตีกลับผลการดำเนินงาน\n\nระบุเหตุผล/สิ่งที่ต้องแก้ (หัวหน้าส่วนงานจะได้รับแจ้งเตือน):",
        );
        if (!note || note.trim() === "") {
          e.preventDefault();
          return;
        }
        if (noteRef.current) noteRef.current.value = note.trim();
      }}
      className="whitespace-nowrap rounded-lg border border-red-300 bg-surface px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังตีกลับ..." : "ตีกลับผล"}
    </button>
  );
}

export function ReturnButton({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, { error: null } as FormState);
  const noteRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction}>
      <input ref={noteRef} type="hidden" name="returnNote" />
      <Button noteRef={noteRef} />
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
