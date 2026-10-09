"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// เมนูแถบซ้ายสำหรับจอใหญ่ (md: ขึ้นไป) - จอเล็กใช้เมนูแบบเลื่อนลง (mobile-nav.tsx) แทน
// ไฮไลต์เมนูของหน้าที่เปิดอยู่ รวมถึงหน้าย่อย เช่น /reports/xxx/1 ยังนับเป็นเมนูรายงานผล

type NavLink = { href: string; label: string };

export function SideNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-4 space-y-1 rounded-xl border border-slate-200 bg-surface p-2 shadow-sm">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-lg border-l-4 px-3 py-2 text-sm font-semibold transition ${
              active
                ? "border-accent-400 bg-brand-50 text-brand-ink"
                : "border-transparent text-slate-700 hover:bg-slate-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
