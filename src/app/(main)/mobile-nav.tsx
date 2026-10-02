"use client";

import { useState } from "react";
import Link from "next/link";

// เมนูสำหรับหน้าจอมือถือ - ปุ่มขีดสามขีดที่กดแล้วเมนูเลื่อนลงมา
// ซ่อนตัวเองอัตโนมัติเมื่อจอกว้างพอ (md: ขึ้นไป) เพราะจอใหญ่ใช้เมนูแนวนอนแทน

type NavLink = { href: string; label: string };

export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="เปิดเมนู"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/60 text-white transition hover:bg-white/15"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <>
          {/* พื้นหลังทึบ กดที่ไหนก็ได้เพื่อปิดเมนู */}
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 bg-scrim/20"
          />
          <nav className="absolute inset-x-0 top-full z-20 border-b border-slate-200 bg-surface p-2 shadow-lg">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
