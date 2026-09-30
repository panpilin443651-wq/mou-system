"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// ============================================================================
// ปุ่มสลับธีม สว่าง / มืด / ตามเครื่อง
// ============================================================================
// กดวนไปทีละแบบ: ตามเครื่อง -> สว่าง -> มืด -> ตามเครื่อง
// ค่าที่เลือกเก็บใน localStorage ของเบราว์เซอร์ (ไม่ได้เก็บลงฐานข้อมูล)
// จึงจำแยกตามเครื่อง และใช้ได้ทั้งก่อนและหลัง login
//
// การตั้ง data-theme ครั้งแรกตอนเปิดหน้าทำโดย THEME_SCRIPT (lib/theme.ts) ใน layout.tsx
// ซึ่งรันก่อนหน้าเว็บแสดงผล หน้าจึงไม่กระพริบเป็นสีขาวก่อนเปลี่ยนเป็นมืด
// ============================================================================

type Pref = "system" | "light" | "dark";

const STORAGE_KEY = THEME_STORAGE_KEY;
const NEXT: Record<Pref, Pref> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Pref, string> = {
  system: "ธีมตามเครื่อง",
  light: "ธีมสว่าง",
  dark: "ธีมมืด",
};

function readPref(): Pref {
  try {
    const p = localStorage.getItem(STORAGE_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

function apply(pref: Pref) {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  // ฝั่งเซิร์ฟเวอร์ไม่รู้ค่าที่ผู้ใช้เลือก จึงเริ่มที่ null แล้วอ่านจริงหลังหน้าโหลด
  const [pref, setPref] = useState<Pref | null>(null);

  useEffect(() => {
    setPref(readPref());
  }, []);

  // ถ้าเลือก "ตามเครื่อง" แล้วผู้ใช้เปลี่ยนธีมของเครื่อง ให้หน้าเว็บเปลี่ยนตามทันที
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  function cycle() {
    const next = NEXT[pref ?? readPref()];
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // เบราว์เซอร์บล็อกการเก็บค่า - ยังเปลี่ยนธีมได้ แค่จำไม่ได้หลังปิดหน้า
    }
    apply(next);
    setPref(next);
  }

  const current = pref ?? "system";
  const label = `${LABEL[current]} (กดเพื่อเปลี่ยนเป็น${LABEL[NEXT[current]]})`;

  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={label}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600 ${className}`}
    >
      <Icon pref={current} />
    </button>
  );
}

function Icon({ pref }: { pref: Pref }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (pref === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (pref === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
