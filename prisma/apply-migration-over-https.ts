import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// ============================================================================
// สั่ง migration ผ่าน HTTPS แทนพอร์ต 5432
// ============================================================================
// ทำไมต้องมีสคริปต์นี้?
//   คำสั่ง `prisma migrate deploy` ต่อฐานข้อมูลทางพอร์ต 5432 เท่านั้น
//   ซึ่งเครือข่ายหลายที่บล็อกไว้ (ดูหมายเหตุใน src/lib/db.ts)
//   สคริปต์นี้ทำสิ่งเดียวกับ `migrate deploy` แต่ส่งคำสั่งผ่าน Neon adapter
//   ซึ่งวิ่งบน HTTPS พอร์ต 443 จึงใช้ได้ทุกเครือข่าย
//
// ทำอะไรบ้าง (เหมือน migrate deploy ทุกอย่าง)
//   1. อ่านโฟลเดอร์ prisma/migrations เรียงตามชื่อ
//   2. ข้ามตัวที่ตารางประวัติ _prisma_migrations บอกว่าลงแล้ว
//   3. รันคำสั่ง SQL ที่เหลือ แล้วบันทึกลงตารางประวัติพร้อม checksum
//      (checksum = SHA-256 ของไฟล์ migration.sql ตามที่ Prisma ใช้)
//      ถ้าไม่บันทึก ครั้งหน้าที่รัน prisma migrate บนเน็ตปกติ
//      Prisma จะคิดว่าฐานข้อมูลเพี้ยนแล้วขอล้างข้อมูลทิ้ง
//
// วิธีใช้
//   npx tsx prisma/apply-migration-over-https.ts           ดูว่ามีอะไรค้างบ้าง
//   npx tsx prisma/apply-migration-over-https.ts --apply   สั่งจริง
// ============================================================================

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * ตัดไฟล์ SQL เป็นคำสั่งทีละคำสั่ง
 *
 * แยกด้วยเครื่องหมาย ; ที่อยู่นอกเครื่องหมายคำพูดและนอกคอมเมนต์
 * เขียนเองเพราะ Neon adapter ส่งได้ทีละคำสั่ง ไม่รับทั้งไฟล์รวดเดียว
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (!inSingle && !inDouble && ch === "-" && next === "-") {
      current += ch;
      inLineComment = true;
      continue;
    }
    if (!inSingle && !inDouble && ch === "/" && next === "*") {
      current += ch + next;
      i++;
      inBlockComment = true;
      continue;
    }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;

    if (ch === ";" && !inSingle && !inDouble) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());

  // ทิ้งชิ้นที่มีแต่คอมเมนต์ ไม่มีคำสั่งจริง
  return out.filter((s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim());
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dir = resolve(import.meta.dirname, "migrations");

  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  // ตารางประวัติมีอยู่แล้วเสมอ ถ้าเคยรัน prisma migrate สำเร็จอย่างน้อยหนึ่งครั้ง
  const applied = await db.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null }[]>(
    `SELECT migration_name, finished_at FROM "_prisma_migrations"`
  );
  const doneNames = new Set(
    applied.filter((r) => r.finished_at !== null).map((r) => r.migration_name)
  );

  const pending = folders.filter((f) => !doneNames.has(f));

  console.log(`migration ทั้งหมด ${folders.length} ตัว · ลงแล้ว ${doneNames.size} ตัว`);
  if (pending.length === 0) {
    console.log("ไม่มีตัวที่ค้างอยู่ ฐานข้อมูลตรงกับ prisma/migrations แล้ว");
    await db.$disconnect();
    return;
  }

  console.log(`\nค้างอยู่ ${pending.length} ตัว:`);
  for (const name of pending) console.log("  - " + name);

  if (!apply) {
    console.log("\n(ยังไม่สั่งจริง - ใส่ --apply เพื่อรัน)");
    await db.$disconnect();
    return;
  }

  for (const name of pending) {
    const file = resolve(dir, name, "migration.sql");
    const content = readFileSync(file);
    const checksum = createHash("sha256").update(content).digest("hex");
    const statements = splitStatements(content.toString("utf8"));

    console.log(`\nกำลังรัน ${name} (${statements.length} คำสั่ง)`);
    const startedAt = new Date();
    for (const statement of statements) {
      await db.$executeRawUnsafe(statement);
    }

    await db.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6)`,
      crypto.randomUUID(),
      checksum,
      new Date(),
      name,
      startedAt,
      statements.length
    );
    console.log(`  เสร็จ - บันทึกลงตารางประวัติแล้ว (checksum ${checksum.slice(0, 12)}...)`);
  }

  await db.$disconnect();
}

main();
