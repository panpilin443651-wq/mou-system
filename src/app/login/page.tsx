import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { homePath, ROLE_BADGE } from "@/lib/permissions";
import { isDemoLoginEnabled } from "@/auth";
import { demoLoginAction } from "@/actions/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

// ต้องอ่านสวิตช์โหมดจำลองสิทธิ์และรายชื่อผู้ใช้ใหม่ทุกครั้ง ห้ามเก็บหน้าไว้ล่วงหน้า
export const dynamic = "force-dynamic";

/** รายชื่อผู้ใช้ให้เลือกในโหมดจำลองสิทธิ์ - ผู้ดูแลระบบอยู่ท้ายสุดตามรูปแบบที่ใช้ทดลอง */
async function demoUsers() {
  const users = await db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      department: { select: { code: true, sortOrder: true } },
    },
    orderBy: { name: "asc" },
  });

  const roleOrder = { DEPT_USER: 0, DEPT_HEAD: 1, EXECUTIVE: 2, ADMIN: 3 } as const;
  return users.sort(
    (a, b) =>
      roleOrder[a.role] - roleOrder[b.role] ||
      (a.department?.sortOrder ?? 0) - (b.department?.sortOrder ?? 0)
  );
}

/** หน้าเลือกผู้ใช้ของโหมดจำลองสิทธิ์ แทนฟอร์มอีเมล-รหัสผ่าน */
async function DemoLogin() {
  const users = await demoUsers();

  return (
    <div className="flex min-h-screen justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-3xl">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-surface shadow-sm">
          <div className="border-b border-slate-200 bg-brand-50 px-5 py-3">
            <h1 className="font-semibold text-brand-ink">เข้าสู่ระบบ</h1>
          </div>

          <div className="px-5 py-6">
            <Logo variant="full" size={120} className="mx-auto mb-5 h-28 w-28" />

            <p className="mb-4 text-sm text-slate-600">
              เลือกผู้ใช้เพื่อเข้าใช้งานระบบ (รอบนี้เป็นการจำลองสิทธิ์
              ยังไม่ได้เชื่อมต่อระบบยืนยันตัวตนขององค์กร)
            </p>

            {users.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                ยังไม่มีบัญชีผู้ใช้ที่เปิดใช้งานอยู่
              </p>
            ) : (
              <ul className="space-y-2">
                {users.map((u) => (
                  <li key={u.id}>
                    {/* ฟอร์มแยกต่อคน ปุ่มทั้งแถวจึงกดได้ และใช้ได้แม้ JavaScript ยังโหลดไม่เสร็จ */}
                    <form action={demoLoginAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button
                        type="submit"
                        className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-surface px-4 py-3 text-left transition hover:border-brand-600 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      >
                        <span className="font-semibold text-slate-900">{u.name}</span>
                        <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-ink">
                          {ROLE_BADGE[u.role]}
                        </span>
                        <span className="ml-auto text-sm text-slate-500">
                          {u.department?.code ?? ""}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: "เข้าสู่ระบบ | ระบบรายงานผล MOU" };

export default async function LoginPage() {
  // ถ้า login อยู่แล้วก็ไม่ต้องเห็นหน้านี้อีก
  const user = await getCurrentUser();
  if (user) redirect(homePath(user));

  if (isDemoLoginEnabled()) return <DemoLogin />;

  return (
    <div className="min-h-screen">
      {/* เส้นทองด้านบนสุด สีเดียวกับหยดน้ำยางในตราสัญลักษณ์
          เป็นสีเน้นของระบบ ใช้เฉพาะเส้นบางๆ แบบนี้ ไม่ใช้เป็นพื้นกว้าง */}
      <div className="h-1 bg-accent-400" aria-hidden="true" />

      {/* แถบหัวเว็บ บอกว่าเป็นระบบของหน่วยงานไหนตั้งแต่ก่อนเข้าสู่ระบบ
          ใช้ตราแบบไม่มีตัวหนังสือ เพราะขนาดเล็กเกินกว่าจะอ่านชื่อในตราออก */}
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Logo size={40} className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-ink">การยางแห่งประเทศไทย</p>
            <p className="truncate text-xs text-slate-500">Rubber Authority of Thailand</p>
          </div>
        </div>
      </header>

      <main className="flex justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          {/* overflow-hidden จำเป็น เพื่อให้เส้นคั่นในการ์ดไม่ทะลุมุมโค้ง */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-sm">
            <div className="border-b border-slate-100 px-6 py-7 text-center sm:px-9">
              {/* ตราฉบับเต็มพร้อมชื่อหน่วยงานไทย-อังกฤษ */}
              <Logo variant="full" size={96} className="mx-auto mb-3 h-24 w-24" />
              <h1 className="text-lg font-bold leading-relaxed sm:text-xl">
                ระบบรายงานผลการดำเนินงาน
                <br />
                ตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน
              </h1>
            </div>

            <div className="px-6 py-7 sm:px-9">
              <LoginForm />

              <p className="mt-5 rounded-lg bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-ink">
                ระบบนี้ใช้สำหรับเจ้าหน้าที่ที่ได้รับสิทธิ์เท่านั้น การเข้าใช้งานทุกครั้งจะถูกบันทึกไว้
              </p>

              <p className="mt-5 text-center text-xs text-slate-500">
                หากเข้าใช้งานไม่ได้ กรุณาติดต่อผู้ดูแลระบบ
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
