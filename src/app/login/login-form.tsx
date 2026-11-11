"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/actions/auth";

// "use client" = คอมโพเนนต์นี้ทำงานบนเบราว์เซอร์
// จำเป็นเพราะต้องใช้ state เพื่อแสดงข้อความ error สถานะกำลังส่งข้อมูล
// ปุ่มเปิด-ปิดการมองเห็นรหัสผ่าน และการจดจำอีเมลไว้ในเครื่อง

const initialState: LoginState = { error: null };

/** เก็บเฉพาะอีเมลไว้ในเครื่อง (ไม่เก็บรหัสผ่าน) เพื่อกรอกให้อัตโนมัติครั้งถัดไป */
const REMEMBER_KEY = "mou.rememberEmail";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-b from-brand-700 to-brand-900 px-4 py-3.5 text-lg font-semibold text-white shadow-lg shadow-brand-900/25 transition hover:from-brand-800 hover:to-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      {!pending && (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/90 py-3.5 pl-12 pr-4 text-base outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [email, setEmail] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  // อ่านอีเมลที่จดจำไว้หลังหน้าโหลด (localStorage มีเฉพาะบนเบราว์เซอร์)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      // โหมดส่วนตัวบางเบราว์เซอร์ห้ามใช้ localStorage ก็แค่ไม่จดจำ
    }
  }, []);

  function handleSubmit() {
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, email.trim());
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      // ไม่จดจำได้ก็ไม่เป็นไร ยังเข้าสู่ระบบได้ตามปกติ
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        <label htmlFor="email" className="sr-only">
          ชื่อผู้ใช้งาน (อีเมล)
        </label>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" fill="currentColor" aria-hidden>
          <circle cx="12" cy="7.5" r="4.5" />
          <path d="M3 21c0-4.4 4-7.5 9-7.5s9 3.1 9 7.5z" />
        </svg>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          // inputMode ช่วยให้แป้นพิมพ์บนมือถือขึ้นปุ่ม @ ให้อัตโนมัติ
          inputMode="email"
          placeholder="ชื่อผู้ใช้งาน (อีเมล)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="relative">
        <label htmlFor="password" className="sr-only">
          รหัสผ่าน
        </label>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" fill="currentColor" aria-hidden>
          <path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0zm3 4a1.5 1.5 0 0 0-1 2.6V18h2v-1.4a1.5 1.5 0 0 0-1-2.6z" />
        </svg>
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="current-password"
          placeholder="รหัสผ่าน"
          className={`${inputClass} pr-12`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          aria-pressed={showPassword}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {!showPassword && <path d="M3 3l18 18" />}
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1 text-sm">
        <label className="flex cursor-pointer items-center gap-2.5 text-slate-700">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 accent-brand-700"
          />
          จดจำการเข้าสู่ระบบ
        </label>
        <button
          type="button"
          onClick={() => setShowForgot((v) => !v)}
          aria-expanded={showForgot}
          className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
        >
          ลืมรหัสผ่าน ?
        </button>
      </div>

      {showForgot && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-ink">
          กรุณาติดต่อผู้ดูแลระบบเพื่อขอตั้งรหัสผ่านใหม่
        </p>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="pt-2 lg:pt-4">
        <SubmitButton />
      </div>
    </form>
  );
}
