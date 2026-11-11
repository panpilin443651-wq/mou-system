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

export const metadata = { title: "เข้าสู่ระบบ | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน" };

export default async function LoginPage() {
  // ถ้า login อยู่แล้วก็ไม่ต้องเห็นหน้านี้อีก
  const user = await getCurrentUser();
  if (user) redirect(homePath(user));

  if (isDemoLoginEnabled()) return <DemoLogin />;

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden">
      <LoginBackground />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-8 px-4 py-10 lg:flex-row lg:justify-between lg:gap-16 lg:px-12">
        {/* ฝั่งซ้าย: ชื่อระบบ บนพื้นขาวโปร่งให้อ่านออกบนภาพพื้นหลัง */}
        <section className="w-full max-w-xl rounded-3xl bg-white/50 lg:max-w-2xl px-6 py-8 backdrop-blur-sm sm:px-10">
          <MouWordmark />
          <h1 className="mt-7 text-xl font-bold leading-snug text-brand-800 sm:text-3xl">
            ระบบรายงานผลตามบันทึกข้อตกลง
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-800 sm:text-xl">
            การประเมินผลการดำเนินงานของส่วนงาน
            <br />
            และหน่วยงานที่ไม่สังกัดส่วนงาน
          </p>
        </section>

        {/* ฝั่งขวา: การ์ดเข้าสู่ระบบแบบกระจกฝ้า */}
        <section className="w-full max-w-md rounded-3xl border border-white/70 bg-white/85 px-6 py-8 shadow-2xl shadow-brand-900/20 backdrop-blur-md sm:px-10 sm:py-10">
          <div className="mb-7 flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-800 text-white sm:h-[4.5rem] sm:w-[4.5rem]">
              <svg viewBox="0 0 24 24" className="h-8 w-8 sm:h-9 sm:w-9" fill="currentColor" aria-hidden>
                <circle cx="12" cy="7.5" r="4.5" />
                <path d="M3 21c0-4.4 4-7.5 9-7.5s9 3.1 9 7.5z" />
              </svg>
            </span>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">เข้าสู่ระบบ</h2>
              <p className="mt-1 text-sm text-slate-600">กรุณากรอกข้อมูลเพื่อเข้าใช้งานระบบ</p>
            </div>
          </div>

          <LoginForm />

          <p className="mt-8 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
            © สงวนลิขสิทธิ์ โดย การยางแห่งประเทศไทย
          </p>
        </section>
      </main>
    </div>
  );
}

/** ตัวอักษร MOU สีเขียวเข้ม มีเส้นโค้งสีทองพาดด้านบนขวาและเส้นทองขีดใต้ */
function MouWordmark() {
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
      <div className="relative inline-block pb-2">
        <svg viewBox="0 0 200 60" className="absolute -right-6 -top-6 h-14 w-32 sm:h-16 sm:w-40" fill="none" aria-hidden>
          <defs>
            <linearGradient id="mou-gold" x1="0" x2="1">
              <stop offset="0" stopColor="#f5b81f" stopOpacity="0" />
              <stop offset="0.45" stopColor="#e0a00b" />
              <stop offset="1" stopColor="#fdd34d" />
            </linearGradient>
          </defs>
          <path d="M10 48 C 70 4, 160 -2, 192 40 C 165 16, 95 14, 18 52 Z" fill="url(#mou-gold)" />
        </svg>
        <span className="relative block text-7xl font-extrabold leading-none tracking-tight text-brand-900 sm:text-8xl">
          MOU
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-gradient-to-r from-accent-500 via-accent-400 to-accent-200" />
      </div>
      <div className="pb-3 text-base font-semibold leading-tight text-brand-800 sm:text-xl">
        <span className="block tracking-wide">PERFORMANCE AGREEMENT</span>
        <span className="block font-medium">Management System</span>
      </div>
    </div>
  );
}

/**
 * พื้นหลังหน้าเข้าสู่ระบบ: ท้องฟ้า เนินเขาเขียว และคลื่นเขียว-ทองด้านล่าง
 * ถ้าต้องการใช้ภาพถ่ายจริง (เช่น สวนยางพารา) ให้วางไฟล์ไว้ที่ public/login-bg.jpg
 * ภาพจะทับท้องฟ้าที่วาดไว้อัตโนมัติ ถ้าไม่มีไฟล์ก็แสดงภาพวาดนี้แทน
 */
function LoginBackground() {
  return (
    <div className="absolute inset-0 -z-10" aria-hidden>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url(/login-bg.jpg), radial-gradient(circle at 10% 6%, rgba(255,250,205,0.95), rgba(255,250,205,0) 26%), linear-gradient(180deg, #3f9fe6 0%, #94cdf3 36%, #e2f2fb 56%, #c9e7bd 68%, #6fbd5e 100%)",
        }}
      />
      <svg className="absolute inset-x-0 bottom-0 h-[58%] w-full" viewBox="0 0 1440 600" preserveAspectRatio="none">
        <path d="M0 260 C 240 170, 420 230, 640 200 S 1100 120, 1440 180 V600 H0Z" fill="#8cc8a0" opacity="0.55" />
        <path d="M0 330 C 260 250, 520 320, 760 280 S 1200 220, 1440 260 V600 H0Z" fill="#4f9f5c" opacity="0.75" />
        <path d="M0 400 C 300 330, 600 390, 900 350 S 1300 320, 1440 340 V600 H0Z" fill="#2f8a3e" />
        <path d="M0 470 C 360 420, 760 500, 1100 440 S 1380 400, 1440 410 V600 H0Z" fill="#dff2df" opacity="0.9" />
        <path d="M0 500 C 420 460, 820 540, 1160 470 S 1400 440, 1440 445 V600 H0Z" fill="#f5b81f" opacity="0.85" />
        <path d="M0 515 C 420 480, 820 560, 1160 490 S 1400 465, 1440 470 V600 H0Z" fill="#1b7a3b" />
        <path d="M0 555 C 400 530, 900 590, 1440 520 V600 H0Z" fill="#0c5a2e" />
      </svg>
    </div>
  );
}
