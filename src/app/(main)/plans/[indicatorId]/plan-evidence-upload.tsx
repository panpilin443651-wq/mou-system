"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { recordPlanAttachmentAction } from "@/actions/plan-attachments";
import { FILE_INPUT_ACCEPT, MAX_FILE_BYTES, formatBytes } from "@/lib/attachments";

// ปุ่มแนบเอกสาร "หลักฐานประกอบผลการดำเนินงาน" ของบรรทัดหนึ่งในแผน
//
// ทำงานแบบเดียวกับปุ่มแนบไฟล์ของรายงาน: อัปโหลดตรงไป Vercel Blob แล้วค่อยบันทึกข้อมูลไฟล์
// เป็นปุ่ม type="button" ไม่ใช่ฟอร์ม เพราะอยู่ในฟอร์มแผนอีกชั้น (HTML ซ้อนฟอร์มไม่ได้)

export function PlanEvidenceUpload({ actionPlanId }: { actionPlanId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`ไฟล์ใหญ่ ${formatBytes(file.size)} เกิน 10 MB`);
      return;
    }

    setBusy(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/attachments/upload",
        clientPayload: JSON.stringify({ kind: "plan", actionPlanId }),
      });
      const result = await recordPlanAttachmentAction(actionPlanId, blob.url, file.name);
      if (result.error) {
        setError(result.error);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      // ไลบรารี Blob ซ่อนเหตุผลจริงจากเซิร์ฟเวอร์ไว้หลังข้อความนี้ (ดูได้จาก log ของเซิร์ฟเวอร์)
      setError(
        /retrieve the client token/i.test(message)
          ? "ขออนุญาตอัปโหลดไม่สำเร็จ — ระบบเก็บไฟล์อาจยังไม่ได้ตั้งค่า หรือบรรทัดนี้ยังไม่ได้บันทึก/ไม่มีสิทธิ์แนบ ลองกดบันทึกแผนแล้วแนบใหม่ ถ้ายังไม่ได้ติดต่อส่วนกลาง"
          : message || "อัปโหลดไม่สำเร็จ กรุณาลองใหม่",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      {/* ไม่มี name จึงไม่ถูกส่งไปกับฟอร์มแผน */}
      <input
        ref={inputRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded border border-dashed border-slate-300 px-2 py-1.5 text-xs font-medium text-brand-ink transition hover:border-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "กำลังอัปโหลด..." : "+ แนบเอกสาร"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
