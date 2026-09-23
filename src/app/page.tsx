import Link from "next/link";
import { db } from "@/lib/db";

// หน้านี้เปิดได้โดยไม่ต้อง login จึงแสดงแค่สถานะการติดตั้ง
// ไม่แสดงข้อมูลตัวชี้วัดหรือข้อมูลส่วนงานใดๆ
export const dynamic = "force-dynamic";

/**
 * ดึงข้อความอธิบายสาเหตุออกจาก error ให้ได้มากที่สุด
 *
 * ตัวเชื่อมต่อของ Neon บางกรณีไม่ได้โยน Error ออกมาตรงๆ
 * ถ้าเช็คแค่ `instanceof Error` จะได้คำว่า "ไม่ทราบสาเหตุ" ซึ่งไม่ช่วยอะไรเลย
 * ทั้งที่กล่องข้อความนี้มีไว้เพื่อบอกสาเหตุโดยเฉพาะ
 *
 * error ของการต่อฐานข้อมูลมักซ้อนสาเหตุจริงไว้ใน cause อีกชั้น จึงไล่ตามไปด้วย
 */
function describeError(error: unknown): string {
  const parts: string[] = [];

  // ไล่ตามสาเหตุที่ซ้อนกันไปทีละชั้น ทั้ง cause (ของ Error ปกติ)
  // และ error (ของ ErrorEvent ที่ตัวเชื่อมต่อ Neon โยนออกมา)
  for (let current: unknown = error, depth = 0; current != null && depth < 4; depth++) {
    if (typeof current !== "object") {
      parts.push(String(current));
      break;
    }
    const like = current as { message?: unknown; cause?: unknown; error?: unknown };
    if (typeof like.message === "string" && like.message) parts.push(like.message);
    current = like.cause ?? like.error;
  }

  const text = parts.join("\nสาเหตุ: ");

  // หน้านี้เปิดดูได้โดยไม่ต้อง login ข้อความ error ของฐานข้อมูล
  // บางครั้งมี connection string ที่มีรหัสผ่านติดมาด้วย จึงต้องปิดรหัสก่อนแสดง
  return text.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1********@");
}

/**
 * บอกว่ากำลังพยายามต่อไปที่เซิร์ฟเวอร์ไหน โดยไม่เปิดเผยรหัสผ่าน
 *
 * มีประโยชน์มากตอนตั้งค่าผิด เพราะจะเห็นทันทีว่าชี้ไปผิดที่
 * หรือไม่ได้ตั้งค่าเลย ซึ่งเป็นสาเหตุที่เจอบ่อยที่สุด
 */
function describeTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "ยังไม่ได้ตั้งค่า DATABASE_URL";
  try {
    return `พยายามต่อไปที่ ${new URL(url).hostname}`;
  } catch {
    return "ค่า DATABASE_URL ไม่ใช่ connection string ที่ถูกรูปแบบ";
  }
}

async function checkDatabase() {
  try {
    const departments = await db.department.count();
    const users = await db.user.count();
    return { connected: true as const, hasData: departments > 0, hasUsers: users > 0 };
  } catch (error) {
    // บางครั้งตัวเชื่อมต่อโยน ErrorEvent ที่ไม่มีข้อความอยู่ข้างในเลย
    // ถ้าปล่อยให้ขึ้นว่า "ไม่ทราบสาเหตุ" เฉยๆ จะไล่ปัญหาต่อไม่ถูก
    // จึงบอกอย่างน้อยว่ากำลังต่อไปที่ไหน และสาเหตุที่พบบ่อยคืออะไร
    const detail = describeError(error);
    const message = detail
      ? `${detail}\n\n${describeTarget()}`
      : `ต่อฐานข้อมูลไม่สำเร็จ และตัวเชื่อมต่อไม่ได้บอกสาเหตุมา\n\n${describeTarget()}\n\n` +
        "มักเกิดจาก: ตั้งค่า DATABASE_URL ผิดหรือยังไม่ได้ตั้ง · " +
        "ฐานข้อมูลบน Neon ถูกลบหรือหยุดทำงาน · เครือข่ายบล็อกการเชื่อมต่อ";
    return { connected: false as const, message };
  }
}

export default async function HomePage() {
  const status = await checkDatabase();

  // Vercel ตั้งตัวแปรนี้ให้เองทุกครั้งที่รันบนเซิร์ฟเวอร์ของเขา
  // ใช้แยกว่าจะบอกวิธีแก้แบบ "ตั้งค่าที่ Vercel" หรือ "รันคำสั่งในเครื่อง"
  // เพราะสองกรณีนี้แก้คนละที่กันคนละวิธี บอกผิดกรณีจะยิ่งหลงทาง
  const onVercel = process.env.VERCEL === "1";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-bold sm:text-3xl">ระบบรายงานผลการดำเนินงานตาม MOU</h1>
      <p className="mt-2 text-slate-600">การยางแห่งประเทศไทย</p>

      {status.connected && status.hasData && status.hasUsers ? (
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-block rounded-lg bg-brand-700 px-5 py-2.5 font-medium text-white transition hover:bg-brand-800"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      ) : (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold">ยังติดตั้งไม่เสร็จ</h2>

          {!status.connected ? (
            <>
              <p className="mt-3 text-sm text-red-700">ยังเชื่อมต่อฐานข้อมูลไม่ได้</p>

              {onVercel ? (
                // เว็บที่รันบน Vercel ไม่ได้อ่านไฟล์ .env ในเครื่องใคร
                // จึงต้องบอกให้ไปตั้งค่าที่ Vercel ไม่ใช่บอกให้รันคำสั่งในเครื่อง
                <>
                  <p className="mt-3 text-sm text-slate-700">
                    เว็บนี้รันอยู่บน Vercel ซึ่งไม่ได้อ่านไฟล์{" "}
                    <code className="rounded bg-slate-100 px-1.5 py-0.5">.env</code> ในเครื่อง
                    ต้องตั้งค่าที่ Vercel แทน
                  </p>
                  <ol className="mt-3 list-inside list-decimal space-y-1.5 text-sm text-slate-700">
                    <li>เปิด Vercel เลือกโปรเจกต์นี้ ไปที่ Settings &gt; Environment Variables</li>
                    <li>
                      เพิ่ม <code className="rounded bg-slate-100 px-1.5 py-0.5">DATABASE_URL</code>{" "}
                      เป็น connection string จาก Neon (ตัวที่มีคำว่า{" "}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5">-pooler</code>)
                    </li>
                    <li>
                      เพิ่ม <code className="rounded bg-slate-100 px-1.5 py-0.5">AUTH_SECRET</code>{" "}
                      ด้วย ไม่อย่างนั้นจะเข้าสู่ระบบไม่ได้
                    </li>
                    <li>กลับไปแท็บ Deployments แล้วกด Redeploy</li>
                  </ol>
                </>
              ) : (
                <>
                  <ol className="mt-3 list-inside list-decimal space-y-1.5 text-sm text-slate-700">
                    <li>
                      ใส่ connection string จาก Neon ลงในไฟล์{" "}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5">.env</code> ที่ตัวแปร{" "}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5">DATABASE_URL</code>
                    </li>
                    <li>
                      สร้างตารางด้วย{" "}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5">
                        npx prisma migrate deploy
                      </code>
                    </li>
                    <li>
                      ใส่ข้อมูลตั้งต้นด้วย{" "}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run db:seed</code>
                    </li>
                  </ol>

                  {/* พอร์ต 5432 ถูกบล็อกบ่อยมาก ถ้าไม่บอกทางออกไว้ตรงนี้
                      ผู้ใช้จะเจอคำสั่งค้างแล้วไม่รู้ว่าเพราะอะไร */}
                  <p className="mt-3 text-sm text-slate-700">
                    ถ้าคำสั่งข้อ 2 ค้างไม่ยอมจบ แปลว่าเครือข่ายที่ใช้อยู่บล็อกพอร์ต 5432
                    ให้ใช้คำสั่งนี้แทน ซึ่งส่งผ่าน HTTPS จึงใช้ได้ทุกเครือข่าย{" "}
                    <code className="rounded bg-slate-100 px-1.5 py-0.5">
                      npx tsx prisma/apply-migration-over-https.ts --apply
                    </code>
                  </p>

                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    อย่าใช้ <code className="rounded bg-amber-100 px-1.5 py-0.5">npm run db:migrate</code>{" "}
                    หรือ <code className="rounded bg-amber-100 px-1.5 py-0.5">npm run db:reset</code>{" "}
                    กับฐานข้อมูลที่มีข้อมูลจริงอยู่แล้ว สองคำสั่งนี้มีไว้ตอนพัฒนา
                    และอาจล้างข้อมูลทั้งหมดทิ้งเพื่อสร้างตารางใหม่
                  </p>
                </>
              )}

              {/* whitespace-pre-wrap: ข้อความยาวๆ จะตัดบรรทัดเองบนจอมือถือ
                  ไม่ต้องเลื่อนตามแนวนอนไปอ่าน */}
              <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
                {status.message}
              </pre>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-700">
              เชื่อมต่อฐานข้อมูลได้แล้ว แต่ยังไม่มีข้อมูลตั้งต้น ให้รันคำสั่ง{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run db:seed</code>
              {onVercel && (
                // คำสั่ง seed รันบน Vercel ไม่ได้ ต้องรันจากเครื่องที่มีโค้ดอยู่
                // แต่ชี้ไปที่ฐานข้อมูลตัวเดียวกัน ข้อมูลจึงขึ้นบนเว็บนี้ด้วย
                <>
                  {" "}
                  จากเครื่องที่มีโค้ดอยู่ โดยตั้งค่า{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5">DATABASE_URL</code> ในไฟล์{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5">.env</code>{" "}
                  ให้ชี้มาที่ฐานข้อมูลตัวเดียวกับที่เว็บนี้ใช้ แล้วรีเฟรชหน้านี้
                </>
              )}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
