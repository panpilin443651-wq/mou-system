import { redirect } from "next/navigation";

// แผนดำเนินงานย้ายไปอยู่ในหน้ารายงานผลของตัวชี้วัดแล้ว (เหนือหัวข้อ "รายละเอียดตามแบบฟอร์มรายงานผล")
// เก็บเส้นทางนี้ไว้พาไปที่นั่น ลิงก์เก่าจะได้ไม่เสีย และมีที่แก้แผนที่เดียว
// สิทธิ์การมองเห็นและการแก้ไขตรวจที่หน้าปลายทาง
export default async function IndicatorPlanPage({
  params,
}: {
  params: Promise<{ indicatorId: string }>;
}) {
  const { indicatorId } = await params;
  redirect(`/reports/${indicatorId}/1#plan`);
}
