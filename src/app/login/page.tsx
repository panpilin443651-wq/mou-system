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
    // พื้นหลังเป็นภาพสวนยางพารา-ภูเขา (public/login-bg.jpg) ตำแหน่งข้อความและการ์ด
    // บนจอกว้างวางตามสัดส่วนของภาพต้นแบบ ใช้หน่วย vw จึงคงที่เมื่อย่อ-ขยายหน้าจอ
    <div
      className="relative isolate flex min-h-screen flex-col overflow-hidden bg-cover bg-[position:20%_center] lg:bg-center"
      style={{
        backgroundImage:
          "url(/login-bg.jpg), linear-gradient(180deg, #3f9fe6 0%, #94cdf3 40%, #cfe9c4 70%, #2f8a3e 100%)",
      }}
    >
      <main className="flex w-full flex-1 flex-col items-center justify-center gap-8 px-4 py-10 lg:flex-row lg:justify-between lg:gap-10 lg:py-12 lg:pl-[15vw] lg:pr-[10vw]">
        {/* ฝั่งซ้าย: ชื่อระบบ จอเล็กมีพื้นขาวโปร่งให้อ่านออก จอกว้างวางบนหมอกขาวในภาพ */}
        <section className="w-full max-w-xl rounded-3xl bg-white/60 px-6 py-7 backdrop-blur-sm sm:px-10 lg:max-w-none lg:flex-1 lg:-translate-y-[4.5vh] lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <MouWordmark />
          <h1 className="mt-6 text-xl font-bold leading-snug text-brand-800 sm:text-3xl lg:mt-[2.6vw] lg:text-[clamp(1.5rem,2.1vw,2.4rem)]">
            ระบบรายงานผลตามบันทึกข้อตกลง
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-900 sm:text-xl lg:mt-[1.2vw] lg:text-[clamp(1.05rem,1.55vw,1.7rem)]">
            การประเมินผลการดำเนินงานของส่วนงาน
            <br />
            และหน่วยงานที่ไม่สังกัดส่วนงาน
          </p>
        </section>

        {/* ฝั่งขวา: การ์ดเข้าสู่ระบบแบบกระจกฝ้า */}
        <section className="w-full max-w-md shrink-0 rounded-3xl border border-white/80 bg-white/85 px-6 py-8 shadow-2xl shadow-brand-900/20 backdrop-blur-md sm:px-10 sm:py-10 lg:w-[33vw] lg:min-w-[420px] lg:max-w-[600px] lg:flex lg:min-h-[35.3vw] lg:flex-col lg:justify-center lg:px-[2.9vw] lg:py-[2.4vw]">
          <div className="mb-7 flex items-center gap-5 lg:mb-[2.6vw] lg:pl-[1.5vw]">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-900 text-white sm:h-[4.75rem] sm:w-[4.75rem]">
              <svg viewBox="0 0 24 24" className="h-8 w-8 sm:h-10 sm:w-10" fill="currentColor" aria-hidden>
                <circle cx="12" cy="7.5" r="4.5" />
                <path d="M3 21c0-4.4 4-7.5 9-7.5s9 3.1 9 7.5z" />
              </svg>
            </span>
            <div>
              <h2 className="text-2xl font-bold text-brand-900 sm:text-[2.1rem]">เข้าสู่ระบบ</h2>
              <p className="mt-1 text-sm text-slate-700">กรุณากรอกข้อมูลเพื่อเข้าใช้งานระบบ</p>
            </div>
          </div>

          <LoginForm />

          <p className="mt-8 border-t border-slate-200 pt-6 lg:mt-[2.4vw] lg:pt-[2.2vw] text-center text-sm text-slate-800">
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
    <div className="flex flex-wrap items-center gap-x-[1.4vw] lg:flex-nowrap gap-y-2">
      <div className="relative inline-block pb-2 lg:pb-[0.6vw]">
        <svg viewBox="0 0 200 60" className="absolute -right-[18%] -top-[22%] h-[45%] w-[85%]" fill="none" aria-hidden>
          <defs>
            <linearGradient id="mou-gold" x1="0" x2="1">
              <stop offset="0" stopColor="#f5b81f" stopOpacity="0" />
              <stop offset="0.45" stopColor="#e0a00b" />
              <stop offset="1" stopColor="#fdd34d" />
            </linearGradient>
          </defs>
          <path d="M10 52 C 70 6, 160 -2, 196 34 C 165 14, 95 14, 18 56 Z" fill="url(#mou-gold)" />
        </svg>
        <span className="relative block text-7xl font-extrabold leading-none tracking-tight text-brand-900 sm:text-8xl lg:text-[clamp(4.5rem,6.9vw,8rem)]">
          MOU
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-gradient-to-r from-accent-600 via-accent-400 to-accent-200 lg:h-[0.3vw]" />
      </div>
      <div className="text-base font-semibold leading-snug text-brand-800 sm:text-xl lg:text-[clamp(1rem,1.38vw,1.55rem)]">
        <span className="block">PERFORMANCE AGREEMENT</span>
        <span className="block">Management System</span>
      </div>
    </div>
  );
}
