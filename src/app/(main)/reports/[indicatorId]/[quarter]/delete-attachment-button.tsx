"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/actions/attachments";

// ปุ่มลบไฟล์แนบ ถามยืนยันก่อนเพราะไฟล์ถูกลบจริง เรียกคืนไม่ได้
//
// เรียก Server Action ตรงๆ ไม่ห่อด้วย <form> เพราะปุ่มนี้อยู่ในหัวข้อรายค่าเกณฑ์
// ซึ่งอยู่ในฟอร์มกรอกผลอีกที และ HTML ห้ามวางฟอร์มซ้อนฟอร์ม
// (เบราว์เซอร์จะตัดฟอร์มข้างในทิ้งเงียบๆ ปุ่มลบจะกลายเป็นปุ่มส่งฟอร์มใหญ่แทน)

export function DeleteAttachmentButton({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("ลบไฟล์แนบนี้หรือไม่ ไฟล์จะถูกลบถาวร เรียกคืนไม่ได้")) return;

    startTransition(async () => {
      const result = await action({ error: null }, new FormData());
      setError(result.error);
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "กำลังลบ..." : "ลบ"}
      </button>

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
