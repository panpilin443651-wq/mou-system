import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ROLE_LABEL, homePath, indicatorsMenuLabel, visibleMenus } from "@/lib/permissions";
import { db } from "@/lib/db";
import { logoutAction } from "@/actions/auth";
import { Logo } from "@/components/logo";
import { MobileNav } from "./mobile-nav";
import { SideNav } from "./side-nav";
import { unreadCount } from "@/lib/notifications";
import { getViewFiscalYear } from "@/lib/view-year";
import { YearPicker } from "./year-picker";

// โฟลเดอร์ (main) ที่มีวงเล็บ = จัดกลุ่มไฟล์โดยไม่กลายเป็นส่วนหนึ่งของ URL
// ทุกหน้าในกลุ่มนี้จะได้แถบเมนูนี้ และต้อง login ก่อนเสมอ

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const menus = visibleMenus(user);

  // แสดงชื่อส่วนงานที่สังกัด เพื่อให้ผู้ใช้เห็นชัดว่ากำลังดูข้อมูลของหน่วยไหน
  const department = user.departmentId
    ? await db.department.findUnique({
        where: { id: user.departmentId },
        select: { code: true, name: true },
      })
    : null;

  // กระดิ่ง: แจ้งเตือนที่ยังไม่อ่าน (เช่น ส่วนกลางตีกลับแผน/ผล) - มีแล้วกระดิ่งเป็นสีแดง
  const unread = await unreadCount(user.id);

  // แถบเลือกปีบัญชีที่จะดู (ทุกสิทธิ์) - ดู lib/view-year.ts
  const [years, viewYear] = await Promise.all([
    db.fiscalYear.findMany({ select: { year: true, isActive: true }, orderBy: { year: "desc" } }),
    getViewFiscalYear(),
  ]);
  const activeYear = years.find((y) => y.isActive)?.year ?? null;

  const links = [
    { href: "/dashboard", label: "ภาพรวม", show: menus.dashboard },
    { href: "/indicators", label: indicatorsMenuLabel(user), show: menus.indicators },
    // แผน (ขั้นตอนที่ 1) กับรายงานผล (ขั้นตอนที่ 2) แยกเป็นคนละเมนู
    { href: "/plans", label: "แผนการดำเนินงาน", show: menus.plans },
    { href: "/reports", label: "รายงานผลการดำเนินงาน", show: menus.reports },
    { href: "/admin", label: "ตั้งค่าระบบ", show: menus.admin },
    { href: "/account", label: "บัญชีของฉัน", show: true },
  ].filter((l) => l.show);

  return (
    <div className="min-h-screen">
      {/* แถบหัวเว็บเขียวไล่เฉด ตัวหนังสือขาว ตามแบบระบบอื่นของ กยท. */}
      <header className="bg-gradient-to-r from-header-from to-header-to text-white shadow-md print:hidden">
        {/* relative จำเป็นสำหรับให้เมนูมือถือเลื่อนลงมาวางตำแหน่งถูกต้อง */}
        <div className="relative mx-auto flex max-w-[120rem] items-center gap-3 px-4 py-3 lg:px-6">
          <MobileNav links={links} />

          <Link href={homePath(user)} className="flex min-w-0 flex-1 items-center gap-2.5">
            {/* ตรารองพื้นวงกลมสีขาว ให้เห็นชัดบนแถบเขียว */}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-white/70">
              <Logo size={36} className="h-9 w-9" />
            </span>
            <span className="min-w-0">
              {/* ชื่อระบบยาว ให้ขึ้นบรรทัดใหม่ได้ไม่เกิน 2 บรรทัด แทนการตัดท้ายทิ้ง */}
              <span className="line-clamp-2 text-sm font-semibold leading-snug text-white">
                ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน
              </span>
              <span className="block truncate text-xs text-white/80">
                {department ? `${department.code} ${department.name}` : ROLE_LABEL[user.role]}
              </span>
            </span>
          </Link>

          <Link
            href="/notifications"
            aria-label={unread > 0 ? `แจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : "แจ้งเตือน"}
            title={unread > 0 ? `มีแจ้งเตือนใหม่ ${unread} รายการ` : "แจ้งเตือน"}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition ${
              unread > 0 ? "text-accent-300 hover:bg-white/15" : "text-white hover:bg-white/15"
            }`}
          >
            <svg viewBox="0 0 24 24" fill={unread > 0 ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} className="h-6 w-6" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-white/60 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>

      {viewYear && years.length > 0 && (
        <div
          className={`border-b print:hidden ${
            viewYear.isActive ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="mx-auto flex max-w-[120rem] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 lg:px-6">
            <YearPicker years={years} current={viewYear.year} />
            {!viewYear.isActive && (
              <p className="text-sm text-amber-900">
                กำลังดูข้อมูลปีบัญชี {viewYear.year}
                {activeYear !== null && ` · ปีปัจจุบันของระบบคือ ${activeYear}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* เมนูอยู่แถบซ้ายบนจอใหญ่ - จอเล็กซ่อนแถบนี้แล้วใช้ปุ่มเมนูบนหัวเว็บแทน */}
      <div className="mx-auto flex max-w-[120rem] gap-6 px-4 py-6 lg:px-6 print:block print:max-w-none print:p-0">
        <aside className="hidden w-64 shrink-0 md:block print:hidden">
          <SideNav links={links} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
