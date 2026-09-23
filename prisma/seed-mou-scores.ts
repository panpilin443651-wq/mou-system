import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import scores from "./indicator-scores.json";

// ============================================================================
// ใส่คะแนนรายตัวชี้วัดจากไฟล์ Excel ลงฐานข้อมูล (ตาราง MouScore)
// ============================================================================
// ใช้ครั้งแรกตอนย้ายข้อมูลเข้าระบบ และใช้ซ้ำได้เมื่อได้ไฟล์ Excel ชุดใหม่
//
// ลำดับงานทั้งหมดเมื่อได้ไฟล์ใหม่:
//   1. วางไฟล์ทับใน "คะแนน MOU/"
//   2. npx tsx prisma/import-indicator-scores.ts --apply   Excel -> JSON
//   3. npx tsx prisma/seed-mou-scores.ts                   ดูก่อนว่าจะเปลี่ยนอะไร
//   4. npx tsx prisma/seed-mou-scores.ts --apply           เขียนลงฐานข้อมูล
//
// ค่าเริ่มต้นจะ "ไม่ทับ" แถวที่แอดมินแก้ไว้ในระบบแล้ว (ดูที่ updatedById)
// ถ้าต้องการให้ไฟล์ทับทุกอย่าง ใส่ --overwrite-edited เพิ่ม
// ============================================================================

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

/** ชื่อที่ตัดช่องว่างออกหมด ใช้เทียบชื่อตัวชี้วัดที่เว้นวรรคไม่เหมือนกัน */
const squash = (s: string) => s.replace(/\s+/g, "");

async function main() {
  const apply = process.argv.includes("--apply");
  const overwriteEdited = process.argv.includes("--overwrite-edited");

  const fiscalYear = await db.fiscalYear.findFirst({ where: { isActive: true } });
  if (!fiscalYear) throw new Error("ยังไม่ได้ตั้งปีบัญชีที่ใช้งานอยู่");

  const indicators = await db.indicator.findMany({
    where: { fiscalYearId: fiscalYear.id },
    select: { id: true, code: true, name: true, department: { select: { code: true } } },
  });

  const byDept = new Map<string, typeof indicators>();
  for (const i of indicators) {
    const list = byDept.get(i.department.code) ?? [];
    list.push(i);
    byDept.set(i.department.code, list);
  }

  type Pending = { indicatorId: string; quarter: number; plan: number | null; actual: number | null; score: number | null; note: string | null };
  const pending: Pending[] = [];
  const corrections: string[] = [];
  const problems: string[] = [];

  for (const dept of scores.departments) {
    const list = byDept.get(dept.code);
    if (!list) {
      problems.push(`${dept.code}: ไม่มีส่วนงานนี้ในระบบ`);
      continue;
    }
    const byCode = new Map(list.map((i) => [i.code, i]));
    const byName = new Map(list.map((i) => [squash(i.name), i]));
    const used = new Set<string>();

    for (const row of dept.rows) {
      if (row.isGroup) continue;

      // ปกติจับคู่ด้วยเลขข้อ
      let ind = byCode.get(row.code);

      // ไฟล์ Excel บางชีตพิมพ์เลขข้อซ้ำ (สวย. มีข้อ "8" สองแถว ที่จริงแถวหลังคือข้อ 9)
      // ถ้าเลขข้อนั้นถูกใช้ไปแล้ว ให้จับคู่ด้วยชื่อตัวชี้วัดแทน แล้วบันทึกไว้ว่าแก้ให้
      if (!ind || used.has(ind.id)) {
        const byNameMatch = byName.get(squash(row.name));
        if (byNameMatch && !used.has(byNameMatch.id)) {
          corrections.push(
            `${dept.code}: ไฟล์เขียนข้อ "${row.code}" ซ้ำ - จับคู่ "${row.name.slice(0, 45)}" กับข้อ ${byNameMatch.code} ในระบบด้วยชื่อแทน`
          );
          ind = byNameMatch;
        }
      }

      if (!ind) {
        problems.push(`${dept.code} ข้อ ${row.code} (${row.name.slice(0, 40)}): หาตัวชี้วัดในระบบไม่เจอ`);
        continue;
      }
      if (used.has(ind.id)) {
        problems.push(`${dept.code} ข้อ ${row.code}: ตัวชี้วัดนี้ถูกจับคู่ไปแล้ว ข้ามแถวนี้`);
        continue;
      }
      used.add(ind.id);

      for (const q of row.quarters) {
        // ไตรมาสที่ไม่มีตัวเลขเลยและไม่มีหมายเหตุ ไม่ต้องสร้างแถวเปล่าไว้ในฐานข้อมูล
        if (q.plan === null && q.actual === null && q.score === null && !row.note) continue;
        pending.push({
          indicatorId: ind.id,
          quarter: q.quarter,
          plan: q.plan,
          actual: q.actual,
          score: q.score,
          // ไฟล์มีหมายเหตุช่องเดียวต่อแถว ไม่ได้แยกรายไตรมาส
          // จึงใส่ไว้ที่ไตรมาสสุดท้ายที่มีตัวเลข ซึ่งเป็นงวดที่หมายเหตุพูดถึง
          note: null,
        });
      }

      if (row.note) {
        const lastWithData = [...row.quarters].reverse().find((q) => q.actual !== null || q.score !== null);
        const target = pending.find(
          (p) => p.indicatorId === ind!.id && p.quarter === (lastWithData?.quarter ?? row.quarters.at(-1)?.quarter)
        );
        if (target) target.note = row.note;
      }
    }
  }

  // ---------- เทียบกับของที่มีอยู่แล้ว ----------
  const existing = await db.mouScore.findMany({
    where: { indicator: { fiscalYearId: fiscalYear.id } },
    select: { indicatorId: true, quarter: true, updatedById: true },
  });
  const existingKey = new Map(
    existing.map((e) => [`${e.indicatorId}:${e.quarter}`, e.updatedById])
  );

  const toWrite = pending.filter((p) => {
    const editedBy = existingKey.get(`${p.indicatorId}:${p.quarter}`);
    if (editedBy === undefined) return true; // ยังไม่มีในฐานข้อมูล
    if (editedBy === null) return true; // มีอยู่แต่ยังไม่มีใครแก้ด้วยมือ
    return overwriteEdited; // มีคนแก้ไว้แล้ว - ทับเฉพาะเมื่อสั่ง
  });
  const skipped = pending.length - toWrite.length;

  console.log(`ไฟล์คะแนนมีข้อมูล ${pending.length} แถว (ตัวชี้วัด x ไตรมาส)`);
  console.log(`  จะเขียน ${toWrite.length} แถว`);
  if (skipped > 0) {
    console.log(`  ข้าม ${skipped} แถว เพราะแอดมินแก้ไว้ในระบบแล้ว (ใส่ --overwrite-edited เพื่อทับ)`);
  }

  if (corrections.length) {
    console.log(`\nแก้การจับคู่ให้ ${corrections.length} รายการ:`);
    for (const c of corrections) console.log("  - " + c);
  }
  if (problems.length) {
    console.log(`\nพบปัญหา ${problems.length} รายการ:`);
    for (const p of problems) console.log("  - " + p);
  }

  if (!apply) {
    console.log("\n(ยังไม่เขียนจริง - ใส่ --apply เพื่อเขียนลงฐานข้อมูล)");
    await db.$disconnect();
    return;
  }

  let written = 0;
  for (const p of toWrite) {
    await db.mouScore.upsert({
      where: { indicatorId_quarter: { indicatorId: p.indicatorId, quarter: p.quarter } },
      create: { ...p },
      // ไม่แตะ updatedById ตอนนำเข้าจากไฟล์ เพื่อให้แยกออกว่าแถวไหนมาจากไฟล์
      // แถวไหนคนแก้เอง ซึ่งเป็นตัวตัดสินว่าการนำเข้าครั้งหน้าจะทับหรือข้าม
      update: { plan: p.plan, actual: p.actual, score: p.score, note: p.note },
    });
    written++;
    if (written % 100 === 0) console.log(`  เขียนแล้ว ${written}/${toWrite.length}`);
  }

  console.log(`\nเขียนลงฐานข้อมูลเรียบร้อย ${written} แถว`);
  await db.$disconnect();
}

main();
