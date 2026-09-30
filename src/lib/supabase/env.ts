// ============================================================================
// ค่าตั้งค่า Supabase - อ่านที่เดียว แล้วบอกให้ชัดว่าลืมตั้งอะไร
// ============================================================================
// หาค่าได้ที่ Supabase Dashboard -> Project Settings -> API
//   NEXT_PUBLIC_SUPABASE_URL      = Project URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY = anon public key (เปิดเผยได้ ใช้ login)
//   SUPABASE_SERVICE_ROLE_KEY     = service_role key (ความลับ! ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
//                                   สำหรับแอดมินสร้างบัญชีและตั้งรหัสผ่านให้ผู้อื่น)
//
// อ่านตอนเรียกใช้ ไม่ใช่ตอนโหลดไฟล์ ด้วยเหตุผลเดียวกับ lib/db.ts
// (ตอน build ยังไม่มีค่าเหล่านี้ ถ้าอ่านตั้งแต่โหลดไฟล์ การ build จะล้ม)
// ============================================================================

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `ยังไม่ได้ตั้งค่า ${name} — ถ้ารันบนเครื่องให้ใส่ในไฟล์ .env ` +
        "ถ้าอยู่บน Vercel ให้ใส่ที่ Project Settings > Environment Variables"
    );
  }
  return value;
}

export function supabaseUrl(): string {
  // ต้องเขียนชื่อเต็มตรงๆ Next.js จึงจะแทนค่า NEXT_PUBLIC_* ให้ตอน build
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function supabaseServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}
