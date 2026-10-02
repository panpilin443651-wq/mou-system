import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canManageIndicators } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getViewFiscalYear } from "@/lib/view-year";
import { createIndicator } from "@/actions/indicators";
import { IndicatorForm } from "../indicator-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "เพิ่มตัวชี้วัด | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน" };

export default async function NewIndicatorPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const user = await requireUser();
  // ตรวจสิทธิ์ที่เซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนปุ่มในหน้ารายการ
  if (!canManageIndicators(user)) redirect("/indicators");

  const sp = await searchParams;

  const [departments, fiscalYears, dimensionRows] = await Promise.all([
    db.department.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.fiscalYear.findMany({ select: { id: true, year: true }, orderBy: { year: "desc" } }),
    db.indicator.findMany({
      select: { dimension: true },
      distinct: ["dimension"],
      orderBy: { dimension: "asc" },
    }),
  ]);

  // ค่าตั้งต้นของปีบัญชีในฟอร์ม = ปีที่กำลังดูอยู่ (ไม่ได้เลือก = ปีบัญชีที่ใช้งานอยู่)
  const activeYear = await getViewFiscalYear();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/indicators" className="inline-flex min-h-11 items-center text-sm text-brand-ink hover:underline">
          ← กลับไปรายการส่วนงานและหน่วยงาน
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">เพิ่มตัวชี้วัด</h1>
      </div>

      <IndicatorForm
        action={createIndicator}
        submitLabel="บันทึกตัวชี้วัด"
        cancelHref="/indicators"
        departments={departments}
        fiscalYears={fiscalYears}
        dimensions={dimensionRows
          .map((d) => d.dimension)
          .filter((d): d is string => Boolean(d))}
        initial={{
          departmentId: sp.dept ?? "",
          fiscalYearId: activeYear?.id ?? fiscalYears[0]?.id ?? 0,
          code: "",
          name: "",
          description: "",
          dimension: "",
          groupName: "",
          unit: "ระดับ",
          baselineValue: "",
          adjustmentNote: "",
          weight: "",
          direction: "HIGHER_IS_BETTER",
          status: "ACTIVE",
          levels: ["1", "2", "3", "4", "5"],
          conditions: [],
        }}
      />
    </div>
  );
}
