import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";

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
// ต่อฐานข้อมูลผ่าน HTTPS (Neon adapter) ไม่ใช่พอร์ต 5432
//   เพราะเครือข่ายหลายที่บล็อกพอร์ต 5432 ไว้
//   (เหตุผลเดียวกับ prisma/apply-migration-over-https.ts)
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
  if (!process.env.DATABASE_URL) {
    console.error("ไม่พบ DATABASE_URL ใน .env");
    process.exit(1);
  }

  const db = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
  });

  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true },
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

  // cost 12 เท่ากับที่ระบบใช้ตอนสมัครและตอนเปลี่ยนรหัสผ่านบนหน้าเว็บ
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.update({
    where: { id: target.id },
    data: { passwordHash, isActive: true },
  });

  console.log(`\nเรียบร้อย - ${target.email} ใช้รหัสใหม่ได้ทันที`);
  console.log("(ถ้าบัญชีนี้เคยถูกปิดใช้งาน ระบบเปิดให้ใช้งานแล้ว)");
  await db.$disconnect();
}

main();
