import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// ย้ายบัญชีผู้ใช้เดิมไป Supabase Auth
// ============================================================================
// ใช้ครั้งเดียวหลังย้ายข้อมูลมาฐานข้อมูล Supabase และลง migration แล้ว
//
// ทำอะไร?
//   ผู้ใช้ที่ยังไม่มี authId จะถูกสร้างบัญชีใน Supabase Auth ด้วยอีเมลเดิม
//   และเอารหัสผ่านเดิม (bcrypt ใน passwordHash) ไปใช้ต่อ ผู้ใช้จึง login ด้วยรหัสเดิมได้เลย
//   ไม่ต้องตั้งรหัสใหม่ทั้ง 30 ส่วนงาน
//
//   ถ้าอีเมลนั้นมีบัญชีใน Supabase อยู่แล้ว (เช่น สร้างเองใน Dashboard) จะผูกกับบัญชีนั้นแทน
//   และไม่แตะรหัสผ่านของบัญชีนั้น
//
// รันซ้ำได้ ผู้ใช้ที่ย้ายแล้ว (มี authId) จะถูกข้าม
//
// วิธีใช้
//   npx tsx prisma/migrate-users-to-supabase.ts
// ============================================================================

/** อ่านค่าจาก .env เอง เพราะโปรเจกต์ไม่ได้ติดตั้ง dotenv */
function loadEnv() {
  let text: string;
  try {
    text = readFileSync(resolve(import.meta.dirname, "..", ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnv();
  const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!DATABASE_URL || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "ต้องตั้งค่า DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env"
    );
    process.exit(1);
  }

  const db = new PrismaClient({ datasourceUrl: DATABASE_URL });
  const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = await db.user.findMany({
    where: { authId: null },
    select: { id: true, email: true, passwordHash: true },
    orderBy: { email: "asc" },
  });
  console.log(`ผู้ใช้ที่ยังไม่ได้ย้าย ${users.length} คน\n`);

  // บัญชีที่มีอยู่แล้วใน Supabase ดึงมาครั้งเดียว ไว้จับคู่ด้วยอีเมล
  const existing = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) existing.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }

  let created = 0;
  let linked = 0;
  let failed = 0;

  for (const user of users) {
    const email = user.email.toLowerCase();
    let authId = existing.get(email) ?? null;

    if (authId) {
      linked++;
      console.log(`  ผูกกับบัญชีเดิม   ${email}`);
    } else {
      // password_hash รับรหัสแบบ bcrypt ($2a$ / $2b$) ที่ระบบเดิมเก็บไว้ได้ตรงๆ
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        ...(user.passwordHash ? { password_hash: user.passwordHash } : {}),
      });
      if (error || !data.user) {
        failed++;
        console.error(`  ไม่สำเร็จ         ${email}: ${error?.message}`);
        continue;
      }
      authId = data.user.id;
      created++;
      console.log(
        `  สร้างบัญชีใหม่    ${email}${user.passwordHash ? "" : "  (ไม่มีรหัสเดิม ต้องตั้งรหัสให้ใหม่)"}`
      );
    }

    await db.user.update({ where: { id: user.id }, data: { authId } });
  }

  console.log(`\nสร้างใหม่ ${created} · ผูกกับบัญชีเดิม ${linked} · ไม่สำเร็จ ${failed}`);
  await db.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
