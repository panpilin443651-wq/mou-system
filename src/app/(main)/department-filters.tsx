"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// แถบเลือกส่วนงาน ใช้ร่วมกันทั้งหน้าส่วนงานฯ รายงานผล และแผนดำเนินงาน
//
// ทั้งช่องค้นหาและดรอปดาวน์ทำงานกับ "ส่วนงาน" ทั้งคู่ ไม่ใช่ค้นชื่อตัวชี้วัด
// เพราะสามหน้านี้เริ่มจากการเลือกส่วนงานก่อนเสมอ
//
// เก็บเงื่อนไขไว้ใน URL เหมือนหน้าอื่น ทำให้ bookmark ส่งลิงก์ให้คนอื่น
// และกดปุ่มย้อนกลับของเบราว์เซอร์แล้วได้ผลลัพธ์เดิม

type Option = { value: string; label: string };

export function DepartmentFilters({
  basePath,
  departments,
  show,
}: {
  /** เส้นทางของหน้าที่ใช้แถบนี้ เช่น "/reports" */
  basePath: string;
  departments: Option[];
  /** false = ผู้ใช้เห็นได้ส่วนงานเดียว ไม่ต้องมีให้เลือก */
  show: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  // หน่วงเวลาก่อนค้นหา เพื่อไม่ให้ยิงคำขอทุกครั้งที่พิมพ์ทีละตัวอักษร
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q) next.set("q", q);
      else next.delete("q");

      // เริ่มค้นใหม่ = กลับไปที่รายชื่อส่วนงาน ไม่ค้างอยู่ในหน่วยที่เปิดไว้
      // ไม่งั้นผู้ใช้จะพิมพ์ค้นแล้วงงว่าทำไมหน้าจอไม่เปลี่ยน
      next.delete("dept");
      next.delete("page");
      router.push(`${basePath}?${next.toString()}`);
    }, 400);

    return () => clearTimeout(timer);
  }, [q, params, router, basePath]);

  function pickDepartment(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("dept", value);
    else next.delete("dept");
    next.delete("page");
    router.push(`${basePath}?${next.toString()}`);
  }

  const controlClass =
    "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

  if (!show) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label htmlFor="q" className="sr-only">
          ค้นหาส่วนงานและหน่วยงาน
        </label>
        <input
          id="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาส่วนงานและหน่วยงาน จากรหัสย่อหรือชื่อเต็ม..."
          className={controlClass}
        />
      </div>

      <select
        aria-label="เลือกส่วนงานและหน่วยงาน"
        value={params.get("dept") ?? ""}
        onChange={(e) => pickDepartment(e.target.value)}
        className={controlClass}
      >
        <option value="">เลือกส่วนงานและหน่วยงาน</option>
        {departments.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}
