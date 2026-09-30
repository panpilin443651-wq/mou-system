import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { defaultQuarter } from "@/lib/submission-window";

// แผนดำเนินงานย้ายไปอยู่ในหน้ารายงานผลของตัวชี้วัดแล้ว (เหนือหัวข้อ "รายละเอียดตามแบบฟอร์มรายงานผล")
// เก็บเส้นทางนี้ไว้พาไปที่นั่น ลิงก์เก่าจะได้ไม่เสีย และมีที่แก้แผนที่เดียว
// พาไปไตรมาสปัจจุบัน เพราะเป็นไตรมาสเดียวที่ผู้รับผิดชอบส่วนงานรายงานผลได้
// สิทธิ์การมองเห็นและการแก้ไขตรวจที่หน้าปลายทาง
export default async function IndicatorPlanPage({
  params,
}: {
  params: Promise<{ indicatorId: string }>;
}) {
  const { indicatorId } = await params;
  const indicator = await db.indicator.findUnique({
    where: { id: indicatorId },
    select: { fiscalYear: { select: { year: true } } },
  });
  if (!indicator) notFound();
  redirect(`/reports/${indicatorId}/${defaultQuarter(indicator.fiscalYear.year)}#plan`);
}
