"use client";

import { useEffect } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// ============================================================================
// ปุ่มสลับโหมดสว่าง / โหมดมืด
// ============================================================================
// ปุ่มบอกโหมดที่จะเปลี่ยนไป (ตอนสว่างขึ้น "โหมดมืด" ตอนมืดขึ้น "โหมดสว่าง")
// หน้าตาเหมือนปุ่ม "ออกจากระบบ" ให้แถบเมนูดูเป็นชุดเดียวกัน
//
// ถ้ายังไม่เคยกด ระบบใช้ธีมตามการตั้งค่าของเครื่อง เมื่อกดแล้วจะจำค่าที่เลือก
// ไว้ใน localStorage ของเบราว์เซอร์ (ไม่ได้เก็บลงฐานข้อมูล จึงจำแยกตามเครื่อง)
//
// ข้อความบนปุ่มสลับด้วย CSS (dark:) ไม่ได้ใช้ state ของ React
// เพราะธีมถูกตั้งโดย THEME_SCRIPT (lib/theme.ts) ก่อน React ทำงาน
// ปุ่มจึงแสดงข้อความถูกตั้งแต่แรก ไม่กระพริบเปลี่ยนข้อความหลังโหลด
// ============================================================================

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)");

function setTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  // ผู้ใช้ที่ยังไม่เคยเลือกเอง: เปลี่ยนธีมของเครื่องแล้วหน้าเว็บเปลี่ยนตามทันที
  useEffect(() => {
    const mq = prefersDark();
    const onChange = () => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      } catch {
        // อ่านค่าไม่ได้ ถือว่ายังไม่เคยเลือก
      }
      setTheme(mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const dark = document.documentElement.dataset.theme !== "dark";
    setTheme(dark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      // เบราว์เซอร์บล็อกการเก็บค่า - ยังเปลี่ยนได้ แค่จำไม่ได้หลังปิดหน้า
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-600 ${className}`}
    >
      {/* จอเล็กแสดงเฉพาะไอคอนเพื่อประหยัดที่ แต่ยังมีข้อความให้โปรแกรมอ่านหน้าจอ */}
      <span className="inline-flex items-center gap-2 dark:hidden">
        <MoonIcon />
        <span className="sr-only sm:not-sr-only">โหมดมืด</span>
      </span>
      <span className="hidden items-center gap-2 dark:inline-flex">
        <SunIcon />
        <span className="sr-only sm:not-sr-only">โหมดสว่าง</span>
      </span>
    </button>
  );
}

const ICON = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function MoonIcon() {
  return (
    <svg {...ICON}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
