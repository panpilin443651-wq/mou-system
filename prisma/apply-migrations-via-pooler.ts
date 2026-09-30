import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

// ============================================================================
// สั่ง migration ผ่าน connection pooler (พอร์ต 6543) แทนพอร์ต 5432
// ============================================================================
// ทำไมต้องมีสคริปต์นี้?
//   `prisma migrate deploy` ต่อฐานข้อมูลด้วย DIRECT_URL ทางพอร์ต 5432
//   ซึ่งเครือข่ายหลายที่บล็อกไว้ คำสั่งจะค้างเงียบๆ ไม่ขึ้น error
//   สคริปต์นี้ทำสิ่งเดียวกัน แต่ส่งคำสั่งผ่าน DATABASE_URL (Supabase pooler พอร์ต 6543)
//   ซึ่งเน็ตที่บล็อก 5432 มักยังเปิดให้ผ่าน
//
//   ถ้าเน็ตไม่บล็อกพอร์ต 5432 ใช้ `npx prisma migrate deploy` ตามปกติได้เลย ผลเหมือนกัน
//
// ทำอะไรบ้าง (เหมือน migrate deploy)
//   1. สร้างตารางประวัติ _prisma_migrations ถ้ายังไม่มี (โครงเดียวกับที่ Prisma สร้าง)
//   2. อ่านโฟลเดอร์ prisma/migrations เรียงตามชื่อ ข้ามตัวที่ลงแล้ว
//   3. รัน SQL ของแต่ละตัวในธุรกรรมเดียว (พังกลางทางจะไม่เหลือครึ่งๆ กลางๆ)
//      แล้วบันทึกลงตารางประวัติพร้อม checksum (SHA-256 ของไฟล์ แบบขึ้นบรรทัด LF ตามที่เก็บใน git)
//      ถ้าไม่บันทึก ครั้งหน้าที่รัน prisma migrate บนเน็ตปกติ Prisma จะคิดว่าฐานข้อมูลเพี้ยน
//
// วิธีใช้
//   npx tsx prisma/apply-migrations-via-pooler.ts           ดูว่ามีอะไรค้างบ้าง
//   npx tsx prisma/apply-migrations-via-pooler.ts --apply   สั่งจริง
// ============================================================================

/** อ่านค่าจาก .env เอง เพราะโปรเจกต์ไม่ได้ติดตั้ง dotenv */
function loadEnv() {
  let text: string;
  try {
    text = readFileSync(resolve(import.meta.dirname, "..", ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
}

/**
 * ตัดไฟล์ SQL เป็นคำสั่งทีละคำสั่ง
 *
 * Prisma Client ส่งได้ทีละคำสั่ง ไม่รับทั้งไฟล์รวดเดียว
 * แยกด้วย ; ที่อยู่นอกเครื่องหมายคำพูด นอกคอมเมนต์ และนอกบล็อก $$ ... $$
 * (บล็อก DO $$ ... $$ มี ; อยู่ข้างใน ถ้าตัดตรงนั้นคำสั่งจะขาดกลางทาง)
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else {
        current += ch;
      }
      continue;
    }
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
    if (!inSingle && !inDouble) {
      if (ch === "-" && next === "-") {
        current += ch;
        inLineComment = true;
        continue;
      }
      if (ch === "/" && next === "*") {
        current += ch + next;
        i++;
        inBlockComment = true;
        continue;
      }
      if (ch === "$") {
        const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/)?.[0];
        if (tag) {
          current += tag;
          i += tag.length - 1;
          dollarTag = tag;
          continue;
        }
      }
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

  // ทิ้งชิ้นที่มีแต่คอมเมนต์ (เช่น หัวไฟล์)
  return out.filter((s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim());
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  if (!process.env.DATABASE_URL) {
    console.error("ไม่พบ DATABASE_URL ใน .env");
    process.exit(1);
  }
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

  // โครงเดียวกับที่ Prisma สร้างเองตอน migrate ครั้งแรก
  const createHistory = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"            VARCHAR(64) NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )`;

  const hasHistory = await db.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists`
  );
  const applied = hasHistory[0].exists
    ? await db.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null }[]>(
        `SELECT migration_name, finished_at FROM "_prisma_migrations"`
      )
    : [];

  const failed = applied.filter((r) => r.finished_at === null);
  if (failed.length > 0) {
    console.error(
      `มี migration ที่ลงไม่สำเร็จค้างอยู่: ${failed.map((r) => r.migration_name).join(", ")}`
    );
    console.error("ต้องตรวจและแก้ด้วยมือก่อน (npx prisma migrate resolve)");
    await db.$disconnect();
    process.exit(1);
  }

  const dir = resolve(import.meta.dirname, "migrations");
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const doneNames = new Set(applied.map((r) => r.migration_name));
  const pending = folders.filter((f) => !doneNames.has(f));

  console.log(`migration ทั้งหมด ${folders.length} ตัว · ลงแล้ว ${doneNames.size} ตัว`);
  if (pending.length === 0) {
    console.log("ไม่มีตัวที่ค้างอยู่ ฐานข้อมูลตรงกับ prisma/migrations แล้ว");
    await db.$disconnect();
    return;
  }
  console.log(`ค้างอยู่ ${pending.length} ตัว:`);
  for (const name of pending) console.log("  - " + name);

  if (!apply) {
    console.log("\n(ยังไม่สั่งจริง - ใส่ --apply เพื่อรัน)");
    await db.$disconnect();
    return;
  }

  await db.$executeRawUnsafe(createHistory);

  for (const name of pending) {
    // checksum คิดจากไฟล์แบบขึ้นบรรทัด LF ให้ตรงกับไฟล์ที่ git เก็บ (และที่ Vercel / Linux เห็น)
    // บน Windows ไฟล์อาจเป็น CRLF ถ้าคิดตรงๆ จะได้ checksum ไม่ตรงกับเครื่องอื่น
    const text = readFileSync(resolve(dir, name, "migration.sql"), "utf8").replace(/\r\n/g, "\n");
    const checksum = createHash("sha256").update(text).digest("hex");
    const statements = splitStatements(text);
    process.stdout.write(`กำลังรัน ${name} (${statements.length} คำสั่ง) ... `);

    const startedAt = new Date();
    await db.$transaction(
      async (tx) => {
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        await tx.$executeRawUnsafe(
          `INSERT INTO "_prisma_migrations"
             (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
           VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6)`,
          randomUUID(),
          checksum,
          new Date(),
          name,
          startedAt,
          1
        );
      },
      { timeout: 120_000, maxWait: 30_000 }
    );
    console.log("เสร็จ");
  }

  console.log("\nลง migration ครบแล้ว");
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
