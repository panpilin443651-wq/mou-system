import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canManageIndicators } from "@/lib/permissions";
import { db } from "@/lib/db";
import { updateIndicator } from "@/actions/indicators";
import { isPlaceholderCriteria } from "@/lib/scoring";
import { IndicatorForm } from "../../indicator-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "แก้ไขตัวชี้วัด | ระบบรายงานผล MOU" };

export default async function EditIndicatorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!canManageIndicators(user)) redirect("/indicators");

  const { id } = await params;

  const [indicator, departments, fiscalYears, dimensionRows] = await Promise.all([
    db.indicator.findUnique({
      where: { id },
      include: { criteria: { orderBy: { level: "asc" } } },
    }),
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

  if (!indicator) notFound();

  // เติมค่าเกณฑ์ให้ครบ 5 ช่องเสมอ เผื่อข้อมูลเก่าที่มีไม่ครบ
  // ระดับที่เป็นตัวเลขแสดงตัวเลข ระดับที่เป็นข้อความแสดงข้อความเกณฑ์
  const levelValue = (level: number) => {
    const found = indicator.criteria.find((c) => c.level === level);
    if (!found) return "";
    if (found.targetValue !== null) return String(found.targetValue);
    return isPlaceholderCriteria(found.description) ? "" : found.description;
  };

  // ผูก id ของตัวชี้วัดเข้ากับ action ตั้งแต่ฝั่งเซิร์ฟเวอร์
  // ทำให้ id ไม่ถูกส่งมาจากฟอร์มฝั่งเบราว์เซอร์ ซึ่งแก้ค่าได้
  const action = updateIndicator.bind(null, indicator.id);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/indicators/${indicator.id}`}
          className="inline-flex min-h-11 items-center text-sm text-brand-800 hover:underline"
        >
          ← กลับไปหน้ารายละเอียด
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">แก้ไขตัวชี้วัด</h1>
      </div>

      <IndicatorForm
        action={action}
        submitLabel="บันทึกการแก้ไข"
        cancelHref={`/indicators/${indicator.id}`}
        departments={departments}
        fiscalYears={fiscalYears}
        dimensions={dimensionRows
          .map((d) => d.dimension)
          .filter((d): d is string => Boolean(d))}
        initial={{
          departmentId: indicator.departmentId,
          fiscalYearId: indicator.fiscalYearId,
          code: indicator.code,
          name: indicator.name,
          description: indicator.description ?? "",
          dimension: indicator.dimension ?? "",
          groupName: indicator.groupName ?? "",
          unit: indicator.unit,
          baselineValue:
            indicator.baselineValue === null ? "" : String(indicator.baselineValue),
          adjustmentNote: indicator.adjustmentNote ?? "",
          weight: String(indicator.weight),
          direction: indicator.direction,
          status: indicator.status,
          levels: [
            levelValue(1),
            levelValue(2),
            levelValue(3),
            levelValue(4),
            levelValue(5),
          ],
          conditions: indicator.conditions,
        }}
      />
    </div>
  );
}
