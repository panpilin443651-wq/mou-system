import { redirect } from "next/navigation";

// เมนู "แผนดำเนินงาน" รวมเข้ากับ "รายงานผล" แล้ว
// เก็บเส้นทางนี้ไว้พาไปหน้าใหม่ ลิงก์เก่าหรือบุ๊กมาร์กที่ผู้ใช้เคยบันทึกไว้จะได้ไม่เสีย
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const next = new URLSearchParams();
  if (sp.q) next.set("q", sp.q);
  if (sp.dept) next.set("dept", sp.dept);
  if (sp.page) next.set("page", sp.page);
  const query = next.toString();
  redirect(query ? `/reports?${query}` : "/reports");
}
