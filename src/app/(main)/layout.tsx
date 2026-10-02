import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ROLE_LABEL, homePath, indicatorsMenuLabel, visibleMenus } from "@/lib/permissions";
import { db } from "@/lib/db";
import { logoutAction } from "@/actions/auth";
import { Logo } from "@/components/logo";
import { MobileNav } from "./mobile-nav";
import { unreadCount } from "@/lib/notifications";

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
      {/* เส้นเหลืองบางๆ ด้านบน เป็นสีเน้นของธีม ใช้เฉพาะจุดแบบนี้
          ไม่ใช้เป็นพื้นกว้าง เพราะตัวหนังสือบนพื้นเหลืองอ่านยาก */}
      <div className="h-1 bg-accent-400 print:hidden" aria-hidden="true" />

      <header className="border-b border-slate-200 bg-surface shadow-sm print:hidden">
        {/* relative จำเป็นสำหรับให้เมนูมือถือเลื่อนลงมาวางตำแหน่งถูกต้อง */}
        <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <MobileNav links={links} />

          <Link href={homePath(user)} className="flex min-w-0 flex-1 items-center gap-2.5">
            <Logo size={36} className="h-9 w-9 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-brand-ink">ระบบรายงานผล MOU</span>
              <span className="block truncate text-xs text-slate-500">
                {department ? `${department.code} ${department.name}` : ROLE_LABEL[user.role]}
              </span>
            </span>
          </Link>

          {/* เมนูแนวนอนสำหรับจอใหญ่ - จอเล็กใช้เมนูแบบเลื่อนออกแทน */}
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/notifications"
            aria-label={unread > 0 ? `แจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : "แจ้งเตือน"}
            title={unread > 0 ? `มีแจ้งเตือนใหม่ ${unread} รายการ` : "แจ้งเตือน"}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition ${
              unread > 0 ? "text-red-600 hover:bg-red-50" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <svg viewBox="0 0 24 24" fill={unread > 0 ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} className="h-6 w-6" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-surface">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium transition hover:bg-slate-50"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
