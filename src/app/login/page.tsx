import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "เข้าสู่ระบบ | ระบบรายงานผล MOU" };

export default async function LoginPage() {
  // ถ้า login อยู่แล้วก็ไม่ต้องเห็นหน้านี้อีก
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      {/* เส้นทองด้านบนสุด สีเดียวกับหยดน้ำยางในตราสัญลักษณ์
          เป็นสีเน้นของระบบ ใช้เฉพาะเส้นบางๆ แบบนี้ ไม่ใช้เป็นพื้นกว้าง */}
      <div className="h-1 bg-accent-400" aria-hidden="true" />

      {/* แถบหัวเว็บ บอกว่าเป็นระบบของหน่วยงานไหนตั้งแต่ก่อนเข้าสู่ระบบ
          ใช้ตราแบบไม่มีตัวหนังสือ เพราะขนาดเล็กเกินกว่าจะอ่านชื่อในตราออก */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Logo size={40} className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-700">การยางแห่งประเทศไทย</p>
            <p className="truncate text-xs text-slate-500">Rubber Authority of Thailand</p>
          </div>
        </div>
      </header>

      <main className="flex justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          {/* overflow-hidden จำเป็น เพื่อให้เส้นคั่นในการ์ดไม่ทะลุมุมโค้ง */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-7 text-center sm:px-9">
              {/* ตราฉบับเต็มพร้อมชื่อหน่วยงานไทย-อังกฤษ */}
              <Logo variant="full" size={96} className="mx-auto mb-3 h-24 w-24" />
              <h1 className="text-lg font-bold leading-relaxed sm:text-xl">
                ระบบรายงานผลการดำเนินงาน
                <br />
                ตามบันทึกข้อตกลง (MOU)
              </h1>
            </div>

            <div className="px-6 py-7 sm:px-9">
              <LoginForm />

              <p className="mt-5 rounded-lg bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-800">
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
