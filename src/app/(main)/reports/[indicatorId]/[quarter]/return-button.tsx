"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/actions/reports";
import { SuccessDialog } from "@/components/success-dialog";
import { hasAnyComment } from "../../../plans/[indicatorId]/plan-table";
import { COMMENT_HEADING } from "@/lib/review-comments";

// ปุ่ม "ตีกลับผล" ของส่วนกลาง สำหรับผลที่ส่งมาแล้วแต่ผิดพลาด
// ข้อสังเกตเขียนในกล่อง "ข้อสังเกต" สีแดงใต้เป้าหมายตัวชี้วัดและใต้ค่าเกณฑ์แต่ละระดับ
// กล่องเหล่านั้นอยู่ในตารางแผน (คนละฟอร์ม) จึงผูกเข้าฟอร์มนี้ด้วย form={RETURN_FORM_ID}

export const RETURN_FORM_ID = "report-return-form";

function Button({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      onClick={(e) => {
        if (!hasAnyComment(e.currentTarget.form)) {
          e.preventDefault();
          window.alert("กรุณาเขียนข้อสังเกตในกล่องสีแดงอย่างน้อย 1 กล่องก่อนตีกลับ");
          return;
        }
        if (!window.confirm("ตีกลับผลการดำเนินงานพร้อมข้อสังเกตที่เขียนไว้?")) e.preventDefault();
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

  return (
    <form
      id={RETURN_FORM_ID}
      action={formAction}
      className="rounded-xl border-2 border-red-400 bg-red-50 p-4 shadow-sm sm:p-5"
    >
      <h2 className="flex items-center gap-2 font-semibold text-red-800">
        <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden="true" />
        ตีกลับผลการดำเนินงาน
      </h2>
      <p className="mt-1 text-sm text-red-900">
        ผลไตรมาส {quarter} · เขียนในกล่อง <strong>{COMMENT_HEADING.report}</strong> สีแดงใต้เป้าหมายตัวชี้วัด
        และใต้ค่าเกณฑ์ระดับที่ต้องแก้ (อย่างน้อย 1 กล่อง) แล้วกดตีกลับผล ·
        ผู้รายงานและหัวหน้าส่วนงานจะได้รับแจ้งเตือนที่กระดิ่งและเห็นข้อสังเกตใต้แต่ละส่วน
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={!canReturnNow} />
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
