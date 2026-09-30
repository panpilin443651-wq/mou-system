import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { Prisma, PrismaClient } from "@prisma/client";

// ============================================================================
// คัดลอกข้อมูลทั้งหมดจากฐานข้อมูล Neon เดิม ไปฐานข้อมูล Supabase
// ============================================================================
// ใช้ครั้งเดียวตอนย้ายระบบ (30 ก.ย. 2569)
//
// ต้นทาง  NEON_DATABASE_URL  อ่านผ่าน HTTPS (@neondatabase/serverless) ไม่ติดเน็ตที่บล็อกพอร์ต 5432
//         อ่านด้วย SQL ตรงๆ ไม่ใช้ Prisma เพราะ Neon ยังไม่มีคอลัมน์ใหม่ (authId, confirmedAt)
//         ถ้าอ่านด้วย Prisma จะพังเพราะหาคอลัมน์ไม่เจอ
// ปลายทาง DATABASE_URL        ฐานข้อมูล Supabase ที่ลง migration ครบแล้ว (npx prisma migrate deploy)
//                             และต้องยังว่างอยู่ สคริปต์จะไม่ยอมเขียนทับข้อมูลที่มีอยู่
//
// คัดลอกทีละตารางตามลำดับใน schema.prisma (เรียงตาม foreign key อยู่แล้ว)
// และคัดลอกเฉพาะคอลัมน์ที่มีใน schema ปัจจุบัน คอลัมน์ใหม่ที่ Neon ไม่มีจะได้ค่าเริ่มต้น
//
// ไฟล์แนบอยู่บน Vercel Blob ไม่ได้อยู่ในฐานข้อมูล จึงไม่ต้องย้าย (เก็บแค่ที่อยู่ไฟล์)
//
// วิธีใช้
//   npx tsx prisma/copy-neon-to-supabase.ts           ดูว่าจะคัดลอกอะไรบ้าง (ยังไม่เขียน)
//   npx tsx prisma/copy-neon-to-supabase.ts --apply   คัดลอกจริง
//   แล้วตามด้วย npm run db:migrate-users              ย้ายบัญชีผู้ใช้ไป Supabase Auth
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

const BATCH = 500;

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const { NEON_DATABASE_URL, DATABASE_URL } = process.env;

  if (!NEON_DATABASE_URL || !DATABASE_URL) {
    console.error("ต้องตั้งค่า NEON_DATABASE_URL (ต้นทาง) และ DATABASE_URL (Supabase ปลายทาง) ใน .env");
    process.exit(1);
  }
  if (DATABASE_URL.includes("neon.tech")) {
    console.error("DATABASE_URL ยังชี้ไปที่ Neon อยู่ ให้เปลี่ยนเป็นของ Supabase ก่อน");
    process.exit(1);
  }

  const source = neon(NEON_DATABASE_URL);
  const target = new PrismaClient({ datasourceUrl: DATABASE_URL });

  const models = Prisma.dmmf.datamodel.models;

  // ---- ปลายทางต้องว่าง ----
  for (const model of models) {
    const delegate = (target as unknown as Record<string, { count: () => Promise<number> }>)[
      lowerFirst(model.name)
    ];
    const count = await delegate.count();
    if (count > 0) {
      console.error(
        `ตาราง ${model.name} ใน Supabase มีข้อมูลอยู่แล้ว ${count} แถว ` +
          "สคริปต์นี้ใช้กับฐานข้อมูลว่างเท่านั้น (ไม่เขียนทับของเดิม)"
      );
      await target.$disconnect();
      process.exit(1);
    }
  }

  console.log(apply ? "เริ่มคัดลอกจริง\n" : "ทดลองดูก่อน (ยังไม่เขียน) - ใส่ --apply เพื่อคัดลอกจริง\n");

  let total = 0;
  for (const model of models) {
    const scalars = model.fields.filter((f) => f.kind === "scalar" || f.kind === "enum");
    const jsonFields = new Set(scalars.filter((f) => f.type === "Json").map((f) => f.name));

    // คอลัมน์ที่มีทั้งใน schema ปัจจุบันและในตารางของ Neon
    const existing = (await source.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [model.name]
    )) as { column_name: string }[];
    const sourceColumns = new Set(existing.map((c) => c.column_name));
    const columns = scalars.map((f) => f.name).filter((name) => sourceColumns.has(name));
    const skipped = scalars.map((f) => f.name).filter((name) => !sourceColumns.has(name));

    const rows = (await source.query(
      `SELECT ${columns.map((c) => `"${c}"`).join(", ")} FROM "${model.name}"`
    )) as Record<string, unknown>[];

    console.log(
      `  ${model.name.padEnd(18)} ${String(rows.length).padStart(6)} แถว` +
        (skipped.length ? `  (คอลัมน์ใหม่ใช้ค่าเริ่มต้น: ${skipped.join(", ")})` : "")
    );
    total += rows.length;
    if (!apply || rows.length === 0) continue;

    // Json ที่เป็น null ต้องส่งเป็น Prisma.DbNull ส่ง null ตรงๆ Prisma จะไม่ยอม
    const data = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const c of columns) {
        const v = row[c];
        out[c] = jsonFields.has(c) && v === null ? Prisma.DbNull : v;
      }
      return out;
    });

    const delegate = (
      target as unknown as Record<string, { createMany: (a: { data: unknown[] }) => Promise<unknown> }>
    )[lowerFirst(model.name)];
    for (let i = 0; i < data.length; i += BATCH) {
      await delegate.createMany({ data: data.slice(i, i + BATCH) });
    }
  }

  if (apply) {
    // FiscalYear.id เป็นเลขนับอัตโนมัติ ใส่ id เองแล้วตัวนับไม่ขยับตาม
    // ต้องตั้งตัวนับให้ต่อจากเลขสูงสุด ไม่งั้นเพิ่มปีบัญชีใหม่ครั้งแรกจะชนกับ id ที่มีอยู่
    await target.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"FiscalYear"', 'id'), COALESCE((SELECT MAX(id) FROM "FiscalYear"), 1), (SELECT COUNT(*) > 0 FROM "FiscalYear"))`
    );
  }

  console.log(`\nรวม ${total} แถว${apply ? " คัดลอกเรียบร้อย" : ""}`);
  if (apply) console.log("ต่อไป: npm run db:migrate-users เพื่อย้ายบัญชีผู้ใช้ไป Supabase Auth");
  await target.$disconnect();
}

function lowerFirst(name: string) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
