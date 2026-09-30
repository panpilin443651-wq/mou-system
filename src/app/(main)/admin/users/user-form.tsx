"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { FormState } from "@/actions/users";

// ฟอร์มเดียวใช้ได้ทั้งหน้าเพิ่มและหน้าแก้ไขบัญชีผู้ใช้
// ต่างกันแค่ action ที่ส่งเข้ามา ค่าเริ่มต้น และช่องรหัสผ่าน (มีเฉพาะตอนสร้างใหม่)

export type UserFormValues = {
  email: string;
  name: string;
  role: "ADMIN" | "DEPT_USER" | "EXECUTIVE";
  departmentId: string;
  isActive: boolean;
};

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: UserFormValues;
  departments: { id: string; code: string; name: string }[];
  withPassword: boolean;
  submitLabel: string;
  cancelHref: string;
  /** true = แก้ไขบัญชีของตัวเอง จะล็อกช่องสิทธิ์และสถานะไว้ กันล็อกตัวเองออกจากระบบ */
  isSelf?: boolean;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-700 px-5 py-2.5 font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก..." : label}
    </button>
  );
}

export function UserForm({
  action,
  initial,
  departments,
  withPassword,
  submitLabel,
  cancelHref,
  isSelf = false,
}: Props) {
  const [state, formAction] = useActionState(action, { error: null } as FormState);

  // เก็บสิทธิ์ไว้ใน state เพื่อซ่อน/แสดงช่องสังกัดตามสิทธิ์ที่เลือก
  // ADMIN กับ EXECUTIVE ดูได้ทุกส่วนงานอยู่แล้ว จึงไม่ต้องเลือกสังกัด
  const [role, setRole] = useState(initial.role);
  const roleRef = useRef<HTMLSelectElement>(null);

  // React ล้างค่าในฟอร์มทุกครั้งที่ Server Action ตอบกลับ และไม่เติมค่ากลับให้ช่อง select
  // ถ้าไม่เติมเอง เวลากดบันทึกแล้วไม่ผ่าน สิทธิ์ที่เลือกไว้จะกลับไปเป็นค่าแรกเงียบๆ
  // แล้วการกดบันทึกครั้งถัดไปจะสร้างบัญชีด้วยสิทธิ์ผิดจากที่เห็นบนหน้าจอ
  useEffect(() => {
    if (roleRef.current) roleRef.current.value = role;
  }, [state, role]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-5 rounded-xl border border-slate-200 bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="ชื่อ-นามสกุล"
            htmlFor="name"
            required
            hint="ชื่อที่จะแสดงบนหน้าจอและในประวัติการแก้ไข"
          >
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={initial.name}
              className={inputClass}
            />
          </Field>

          <Field
            label="อีเมล"
            htmlFor="email"
            required
            hint="ใช้เป็นชื่อผู้ใช้ตอนเข้าสู่ระบบ ห้ามซ้ำกับบัญชีอื่น"
          >
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              defaultValue={initial.email}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="สิทธิ์การใช้งาน"
            htmlFor="role"
            required
            hint={
              isSelf
                ? "แก้สิทธิ์ของบัญชีตัวเองไม่ได้ ป้องกันการล็อกตัวเองออกจากระบบ"
                : undefined
            }
          >
            <select
              id="role"
              ref={roleRef}
              name="role"
              required
              value={role}
              disabled={isSelf}
              onChange={(e) => setRole(e.target.value as UserFormValues["role"])}
              className={`${inputClass} bg-surface disabled:bg-slate-100 disabled:text-slate-500`}
            >
              <option value="DEPT_USER">ผู้รับผิดชอบส่วนงาน — กรอกผลของส่วนงานตัวเอง</option>
              <option value="EXECUTIVE">ผู้บริหาร — ดูได้ทุกส่วนงาน แก้ไขไม่ได้</option>
              <option value="ADMIN">ผู้ดูแลระบบ (ส่วนกลาง) — ทำได้ทุกอย่าง</option>
            </select>
            {/* select ที่ disabled จะไม่ส่งค่ามากับฟอร์ม จึงต้องมีช่องซ่อนส่งค่าแทน */}
            {isSelf && <input type="hidden" name="role" value={role} />}
          </Field>

          <Field
            label="สถานะบัญชี"
            htmlFor="isActive"
            required
            hint="ปิดใช้งานแล้วจะเข้าสู่ระบบไม่ได้ แต่ประวัติที่เคยบันทึกไว้ยังอยู่ครบ"
          >
            <select
              id="isActive"
              name="isActive"
              required
              defaultValue={initial.isActive ? "true" : "false"}
              disabled={isSelf}
              className={`${inputClass} bg-surface disabled:bg-slate-100 disabled:text-slate-500`}
            >
              <option value="true">ใช้งาน</option>
              <option value="false">ปิดใช้งาน</option>
            </select>
            {isSelf && <input type="hidden" name="isActive" value="true" />}
          </Field>
        </div>

        {role === "DEPT_USER" ? (
          <Field
            label="สังกัดส่วนงาน"
            htmlFor="departmentId"
            required
            hint="ผู้รับผิดชอบส่วนงานจะเห็นและกรอกผลได้เฉพาะตัวชี้วัดของส่วนงานที่เลือกนี้เท่านั้น"
          >
            <select
              id="departmentId"
              name="departmentId"
              required
              defaultValue={initial.departmentId}
              className={`${inputClass} bg-surface`}
            >
              <option value="">— เลือกส่วนงาน —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          // ส่งค่าว่างไปด้วย เพื่อให้ฝั่งเซิร์ฟเวอร์ล้างสังกัดเดิมออกเมื่อเปลี่ยนสิทธิ์
          <input type="hidden" name="departmentId" value="" />
        )}
      </div>

      {withPassword && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5">
          <div>
            <h2 className="font-semibold">รหัสผ่านเริ่มต้น</h2>
            <p className="mt-1 text-sm text-slate-600">
              ตั้งรหัสชั่วคราวให้ก่อน แล้วแจ้งเจ้าตัวไปเปลี่ยนเองที่หน้า &quot;บัญชีของฉัน&quot;
              ระบบเก็บรหัสผ่านแบบเข้ารหัสทางเดียว จึงเปิดดูรหัสเดิมย้อนหลังไม่ได้
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="รหัสผ่าน" htmlFor="password" required hint="อย่างน้อย 8 ตัวอักษร">
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
              />
            </Field>

            <Field label="ยืนยันรหัสผ่าน" htmlFor="confirmPassword" required>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} />
        <Link
          href={cancelHref}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium transition hover:bg-slate-50"
        >
          ยกเลิก
        </Link>
      </div>
    </form>
  );
}
