import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ============================================================================
// ต่ออายุ session ของ Supabase ทุกครั้งที่เปิดหน้า
// ============================================================================
// access token ของ Supabase หมดอายุทุกชั่วโมง ต้องมีคนคอยแลกใหม่ด้วย refresh token
// Server Component เขียนคุกกี้เองไม่ได้ จึงต้องทำที่ middleware ซึ่งเขียนคุกกี้ได้
//
// ไฟล์นี้ไม่ได้ตัดสินว่าใครเข้าหน้าไหนได้ การตรวจสิทธิ์ยังอยู่ที่ requireUser()
// ในแต่ละหน้าเหมือนเดิม (ตรวจกับฐานข้อมูลว่าบัญชียังเปิดใช้งานอยู่และมีสิทธิ์อะไร)
// ============================================================================

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // ยังไม่ได้ตั้งค่า - ปล่อยผ่าน ให้หน้าเว็บแสดงข้อความบอกวิธีตั้งค่าแทนหน้าพัง
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // เรียก getUser() เพื่อให้ Supabase แลก token ใหม่ถ้าใกล้หมดอายุ (อย่าลบบรรทัดนี้)
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // ข้ามไฟล์ของ Next.js และรูปภาพ ไม่ต้องต่ออายุ session ตอนโหลดไฟล์พวกนี้
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
