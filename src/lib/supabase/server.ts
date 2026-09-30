import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } from "./env";

// ============================================================================
// ตัวเชื่อมต่อ Supabase ฝั่งเซิร์ฟเวอร์
// ============================================================================
// ระบบนี้คุยกับ Supabase จากฝั่งเซิร์ฟเวอร์เท่านั้น (Server Component / Server Action)
// หน้าเว็บในเบราว์เซอร์ไม่ได้เรียก Supabase ตรง ข้อมูลของระบบยังอ่านเขียนผ่าน Prisma
// Supabase ในที่นี้ใช้ทำหน้าที่ยืนยันตัวตน (login / session / รหัสผ่าน) อย่างเดียว
// ============================================================================

/**
 * ตัวเชื่อมต่อที่ผูกกับคุกกี้ของผู้ใช้ที่กำลังใช้งาน ใช้ anon key
 *
 * session ของ Supabase เก็บในคุกกี้ ตัวนี้อ่าน/เขียนคุกกี้ให้เอง
 * login สำเร็จแล้วคุกกี้จะถูกตั้ง logout แล้วคุกกี้จะถูกลบ
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component เขียนคุกกี้ไม่ได้ (เขียนได้เฉพาะ Server Action / Route Handler)
          // ไม่เป็นไร เพราะ middleware.ts ต่ออายุ session ให้ทุกครั้งที่เปิดหน้าอยู่แล้ว
        }
      },
    },
  });
}

/**
 * ตัวเชื่อมต่อแบบไม่จำ session - ใช้ตรวจรหัสผ่านเฉยๆ โดยไม่ไปแตะคุกกี้ของผู้ใช้
 * เช่น ยืนยันรหัสผ่านเดิมก่อนเปลี่ยนรหัสผ่าน
 */
export function createSupabaseStatelessClient() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * ตัวเชื่อมต่อสิทธิ์ผู้ดูแล (service_role) - ข้ามกฎความปลอดภัยทั้งหมดของ Supabase
 *
 * ใช้เฉพาะงานที่ส่วนกลางทำ: สร้างบัญชี ตั้งรหัสผ่านใหม่ เปลี่ยนอีเมล
 * ห้าม import ไฟล์นี้ในไฟล์ "use client" เด็ดขาด ไม่งั้น key จะหลุดไปถึงเบราว์เซอร์
 * (SUPABASE_SERVICE_ROLE_KEY ไม่มีคำว่า NEXT_PUBLIC_ นำหน้า Next.js จึงไม่ส่งไปเบราว์เซอร์อยู่แล้ว
 *  แต่ถ้าเผลอ import ในฝั่งเบราว์เซอร์ จะได้ค่าว่างและพังตั้งแต่ตอนนั้น)
 */
export function createSupabaseAdminClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
