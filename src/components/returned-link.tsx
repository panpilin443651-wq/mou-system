import Link from "next/link";
import { returnDueText } from "@/lib/return-due";

// ป้ายแดงในหน้ารายการแผน/รายงานผล บอกว่ารายการไหนถูกส่วนกลางตีกลับ และต้องแก้ให้เสร็จวันไหน
// กดแล้วพาไปที่แถบแดง (#return) ของหน้านั้น ซึ่งมีข้อสังเกตจากส่วนกลาง
export function ReturnedLink({
  href,
  label,
  dueAt,
}: {
  href: string;
  /** เช่น "แผนถูกตีกลับ" หรือ "ผลไตรมาส 1 ถูกตีกลับ" */
  label: string;
  /** null = ตีกลับก่อนมีการกำหนดวันที่ */
  dueAt: Date | null;
}) {
  return (
    <Link
      href={`${href}#return`}
      className="mt-1 flex w-fit flex-wrap items-center gap-x-1.5 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-300 hover:underline"
    >
      <span>{label}</span>
      {dueAt && (
        <span className="rounded bg-red-600 px-1 font-semibold text-white">
          ! {returnDueText(dueAt)}
        </span>
      )}
    </Link>
  );
}
