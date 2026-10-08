"use client";

import { useEffect, useRef, useState } from "react";

// ============================================================================
// Pop up แจ้งว่าทำเสร็จแล้ว (บันทึกร่าง / บันทึกแผน / ส่งแผน / ส่งผล / ตีกลับ ฯลฯ)
// ============================================================================
// ใช้กับฟอร์มที่ใช้ useActionState: ส่ง state ที่ได้จาก Server Action เข้ามา
// useActionState คืน object ใหม่ทุกครั้งที่ส่งฟอร์ม จึงเปิด pop up ใหม่ได้ทุกครั้ง
// แม้ข้อความจะซ้ำกับรอบก่อน
//
// ใช้ <dialog> ของเบราว์เซอร์: มีฉากหลังมืด ปิดด้วยปุ่ม Esc ได้ และย้ายโฟกัสเข้าไปให้เอง
// (คนใช้แป้นพิมพ์/โปรแกรมอ่านหน้าจอรู้ทันทีว่ามีข้อความขึ้น)
// ============================================================================

export function SuccessDialog({
  state,
  fallbackMessage = "บันทึกเรียบร้อยแล้ว",
}: {
  /** state จาก useActionState - เปิดเมื่อ success เป็น true */
  state: { error?: string | null; success?: boolean; message?: string | null; silent?: boolean };
  /** ข้อความที่ใช้เมื่อ Server Action ไม่ได้ส่ง message มา */
  fallbackMessage?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!state.success || state.error || state.silent) return;
    setMessage(state.message || fallbackMessage);
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [state, fallbackMessage]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="success-dialog-title"
      // คลิกฉากหลัง (นอกกล่อง) ก็ปิดได้
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-surface p-0 text-current shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="flex flex-col items-center gap-3 px-6 pb-5 pt-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-8 w-8" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </span>
        <h2 id="success-dialog-title" className="text-lg font-semibold">
          ทำรายการสำเร็จ
        </h2>
        <p className="text-sm leading-relaxed text-slate-700">{message}</p>
        <form method="dialog" className="mt-1 w-full">
          <button
            type="submit"
            autoFocus
            className="min-h-11 w-full rounded-lg bg-brand-700 px-5 text-sm font-medium text-white transition hover:bg-brand-800"
          >
            ตกลง
          </button>
        </form>
      </div>
    </dialog>
  );
}
