"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// เมนูแนวนอนบนแถบหัวเว็บสำหรับจอใหญ่ (md: ขึ้นไป) - จอเล็กใช้เมนูแบบเลื่อนลง (mobile-nav.tsx) แทน
// เมนูของหน้าที่เปิดอยู่เป็นพื้นขาว ตัวหนังสือเขียว ขีดเหลืองด้านล่าง ตัดกับแถบเขียวชัดเจน
// หน้าย่อย เช่น /reports/xxx/1 ยังนับเป็นเมนูรายงานผล

type NavLink = { href: string; label: string };

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {links.map((link) => {
        const active = isActivePath(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-lg border-b-4 px-3 text-sm font-semibold transition ${
              active
                ? "border-accent-400 bg-white text-brand-ink shadow-sm"
                : "border-transparent text-white hover:bg-white/15"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
