"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/actions/reports";
import { SuccessDialog } from "@/components/success-dialog";

// ช่องความเห็นของส่วนกลาง + ปุ่ม "ตีกลับผล" สำหรับผลที่ส่งมาแล้วแต่ผิดพลาด
// กรอบสีแดงให้เห็นชัด ความเห็นไปแสดงบนหน้ารายงาน และในแจ้งเตือน (กระดิ่ง)
// ของผู้รายงานและหัวหน้าส่วนงาน

function Button({
  noteRef,
  disabled,
}: {
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      onClick={(e) => {
        if (!noteRef.current || noteRef.current.value.trim() === "") {
          e.preventDefault();
          window.alert("กรุณาระบุความเห็น/เหตุผลที่ตีกลับก่อน");
          noteRef.current?.focus();
          return;
        }
        if (!window.confirm("ตีกลับผลการดำเนินงานพร้อมความเห็นนี้?")) e.preventDefault();
      }}
      className="min-h-11 rounded-lg bg-red-700 px-5 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "กำลังตีกลับ..." : "ตีกลับผล"}
    </button>
  );
}

export function ReturnButton({
  action,
  quarter,
  canReturnNow,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  quarter: number;
  /** ผลไตรมาสนี้ส่งแล้ว (ตีกลับได้) */
  canReturnNow: boolean;
}) {
  const [state, formAction] = useActionState(action, { error: null } as FormState);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form
      action={formAction}
      className="rounded-xl border-2 border-red-400 bg-red-50 p-4 shadow-sm sm:p-5"
    >
      <h2 className="flex items-center gap-2 font-semibold text-red-800">
        <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden="true" />
        ความเห็นส่วนกลาง
      </h2>
      <label htmlFor="returnNote" className="mt-1 block text-sm text-red-900">
        ผลไตรมาส {quarter} · ระบุสิ่งที่ผิดพลาดหรือต้องแก้ไข แล้วกดตีกลับผล · ผู้รายงานและหัวหน้าส่วนงานจะได้รับแจ้งเตือนที่กระดิ่งและเห็นความเห็นนี้
      </label>
      <textarea
        ref={noteRef}
        id="returnNote"
        name="returnNote"
        rows={3}
        maxLength={2000}
        disabled={!canReturnNow}
        placeholder={
          canReturnNow
            ? "เช่น ผลงานที่ทำได้ไม่ตรงกับหลักฐานที่แนบ กรุณาตรวจสอบตัวเลขเดือน พ.ย."
            : "ตีกลับได้หลังหัวหน้าส่วนงานส่งผลไตรมาสนี้แล้ว"
        }
        className="mt-2 w-full resize-y rounded-lg border-2 border-red-300 bg-surface px-3 py-2.5 text-base outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 disabled:bg-red-50/50"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button noteRef={noteRef} disabled={!canReturnNow} />
        {!canReturnNow && (
          <span className="text-sm text-red-800">ผลไตรมาสนี้ยังไม่ได้ส่ง จึงยังตีกลับไม่ได้</span>
        )}
      </div>
      <SuccessDialog state={state} />
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
