import Link from "next/link";

// ตารางรายชื่อส่วนงาน ใช้ร่วมกันทั้งหน้าส่วนงานฯ รายงานผล และแผนดำเนินงาน
//
// แต่ละหน้าบอกตัวเลขสรุปคนละชุด (จำนวนตัวชี้วัด / ส่งผลแล้ว / วางแผนแล้ว)
// จึงรับมาเป็น stats แทนที่จะกำหนดคอลัมน์ตายตัวไว้ในนี้
// แต่หน้าตาตารางและวิธีกดเข้าไปเหมือนกันทุกหน้า ผู้ใช้จะได้ไม่ต้องเรียนรู้ใหม่

export type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  /** ตัวเลขสรุปของหน่วยนี้ ทุกแถวต้องมีหัวข้อชุดเดียวกันและเรียงเหมือนกัน */
  stats: { label: string; value: string }[];
};

export function DepartmentList({
  rows,
  hrefFor,
  emptyText,
}: {
  rows: DepartmentRow[];
  hrefFor: (id: string) => string;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        {emptyText}
      </p>
    );
  }

  const statLabels = rows[0].stats.map((s) => s.label);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-600">
            <th className="px-4 py-2.5 font-medium">ส่วนงาน / หน่วยงาน</th>
            {statLabels.map((label) => (
              <th key={label} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                {label}
              </th>
            ))}
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-2.5">
                {/* ลิงก์กินพื้นที่เต็มช่องด้วย -my เพื่อให้กดถูกง่ายบนมือถือ */}
                <Link
                  href={hrefFor(d.id)}
                  className="-my-2.5 block py-2.5 text-brand-800 underline-offset-2 hover:underline"
                >
                  <span className="font-medium">{d.code}</span>{" "}
                  <span className="text-slate-700">{d.name}</span>
                </Link>
              </td>
              {d.stats.map((s) => (
                <td
                  key={s.label}
                  className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"
                >
                  {s.value}
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-400">→</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ลิงก์กลับไปหน้ารายชื่อส่วนงาน แสดงตอนเปิดดูตัวชี้วัดของหน่วยใดหน่วยหนึ่งอยู่ */
export function BackToDepartments({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center text-sm text-brand-800 hover:underline"
    >
      ← กลับไปรายชื่อส่วนงานและหน่วยงาน
    </Link>
  );
}
