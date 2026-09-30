import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// ตั้งรหัสผ่านเข้าใช้งานให้ผู้ใช้ในระบบ
// ============================================================================
// ใช้ตอนไหน?
//   - ลืมรหัสแอดมิน เข้าหน้าเว็บไม่ได้ จึงรีเซ็ตผ่านหน้าเว็บไม่ได้
//   - เพิ่งติดตั้งระบบ ยังใช้รหัสตัวอย่างจาก .env.example อยู่
//   ถ้ายัง login ได้ ให้เปลี่ยนที่หน้า "บัญชีของฉัน" หรือหน้าจัดการผู้ใช้แทน
//
// ทำไมไม่รับรหัสผ่านทาง argument หรือ environment variable?
//   รหัสที่พิมพ์ต่อท้ายคำสั่งจะค้างอยู่ในประวัติคำสั่งของ terminal
//   สคริปต์นี้จึงถามตอนรันและปิดการแสดงผลขณะพิมพ์ รหัสไม่ถูกบันทึกที่ไหนเลย
//
// รหัสผ่านเก็บที่ Supabase Auth จึงตั้งผ่าน service_role key (SUPABASE_SERVICE_ROLE_KEY)
// ส่วนรายชื่อผู้ใช้อ่านจากฐานข้อมูลผ่าน DATABASE_URL
//
// วิธีใช้
//   npx tsx prisma/set-password.ts
// ============================================================================

/** อ่านค่าจาก .env เอง เพราะโปรเจกต์ไม่ได้ติดตั้ง dotenv */
function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const text = readFileSync(resolve(import.meta.dirname, "..", ".env"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
}

/** ถามคำถามแบบเห็นสิ่งที่พิมพ์ */
function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      done(answer.trim());
    })
  );
}

/**
 * ถามรหัสผ่านโดยไม่แสดงสิ่งที่พิมพ์บนหน้าจอ
 *
 * readline ปกติจะสะท้อนทุกตัวอักษรออกจอ จึงต้องสั่งปิดการสะท้อนเอง
 * โดยดักฟังก์ชัน _writeToOutput ของ readline ไว้ไม่ให้เขียนอะไรออกไป
 */
function askSecret(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const anyRl = rl as unknown as { _writeToOutput: (s: string) => void };
  let shown = false;
  anyRl._writeToOutput = (s: string) => {
    // ให้แสดงเฉพาะตัวคำถามครั้งแรก หลังจากนั้นเงียบสนิท
    if (!shown) {
      process.stdout.write(s);
      shown = true;
    }
  };
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      done(answer);
    })
  );
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
    select: { id: true, authId: true, email: true, name: true, role: true, isActive: true },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  if (users.length === 0) {
    console.error("ยังไม่มีผู้ใช้ในฐานข้อมูล - ให้รัน npm run db:seed ก่อน");
    await db.$disconnect();
    process.exit(1);
  }

  console.log(`\nผู้ใช้ในระบบ ${users.length} คน\n`);
  users.forEach((u, i) => {
    const flag = u.isActive ? "" : "  (ปิดใช้งาน)";
    console.log(`  ${String(i + 1).padStart(2)}. ${u.email}  [${u.role}]  ${u.name}${flag}`);
  });

  const pick = await ask("\nจะตั้งรหัสให้คนไหน? พิมพ์ลำดับหรืออีเมล: ");
  const index = Number(pick) - 1;
  const target =
    Number.isInteger(index) && index >= 0 && index < users.length
      ? users[index]
      : users.find((u) => u.email.toLowerCase() === pick.toLowerCase());

  if (!target) {
    console.error("ไม่พบผู้ใช้ที่เลือก");
    await db.$disconnect();
    process.exit(1);
  }

  console.log(`\nกำลังตั้งรหัสให้: ${target.email} (${target.name})`);

  const password = await askSecret("รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร ไม่แสดงขณะพิมพ์): ");
  if (password.length < 8 || password.length > 72) {
    console.error("รหัสผ่านต้องยาว 8-72 ตัวอักษร");
    await db.$disconnect();
    process.exit(1);
  }

  const confirm = await askSecret("พิมพ์รหัสผ่านใหม่อีกครั้ง: ");
  if (password !== confirm) {
    console.error("รหัสผ่านทั้งสองครั้งไม่ตรงกัน ยังไม่ได้เปลี่ยนอะไร");
    await db.$disconnect();
    process.exit(1);
  }

  // มีบัญชีใน Supabase แล้วก็เปลี่ยนรหัส ยังไม่มี (ผู้ใช้เก่า) ก็สร้างให้พร้อมรหัสนี้
  let authId = target.authId;
  if (authId) {
    const { error } = await supabase.auth.admin.updateUserById(authId, { password });
    if (error) {
      console.error(`ตั้งรหัสใน Supabase ไม่สำเร็จ: ${error.message}`);
      await db.$disconnect();
      process.exit(1);
    }
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: target.email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error(`สร้างบัญชีใน Supabase ไม่สำเร็จ: ${error?.message}`);
      await db.$disconnect();
      process.exit(1);
    }
    authId = data.user.id;
  }

  await db.user.update({
    where: { id: target.id },
    data: { authId, passwordHash: null, isActive: true },
  });

  console.log(`\nเรียบร้อย - ${target.email} ใช้รหัสใหม่ได้ทันที`);
  console.log("(ถ้าบัญชีนี้เคยถูกปิดใช้งาน ระบบเปิดให้ใช้งานแล้ว)");
  await db.$disconnect();
}

main();
