import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import scores from "./indicator-scores.json";

// ============================================================================
// ตรวจก่อนย้ายคะแนนรายตัวชี้วัดจากไฟล์ Excel เข้าฐานข้อมูล
// ============================================================================
// ตรวจ 2 เรื่องที่ถ้าพลาดแล้วข้อมูลจะเพี้ยนโดยไม่มีอะไรฟ้อง
//
//   1. ทุกเลขข้อในไฟล์ ต้องมีตัวชี้วัดรหัสเดียวกันอยู่ในระบบ
//      ถ้าไม่ตรง แปลว่าจับคู่ผิดและคะแนนจะไปลงผิดตัวชี้วัด
//
//   2. คะแนนถ่วงน้ำหนักสะสมในไฟล์ ต้องคำนวณกลับได้จาก (ผล x น้ำหนัก / 100)
//      ถ้าคำนวณกลับได้ ระบบก็คิดเองได้ ไม่ต้องเก็บตัวเลขสะสมไว้ในฐานข้อมูล
//      ซึ่งสำคัญ เพราะพอแอดมินแก้ "ผล" แล้วตัวเลขสะสมต้องขยับตามทันที
//
// รันด้วย: npx tsx prisma/check-indicator-scores.ts
// ต่อผ่าน Neon adapter (HTTPS) เหมือนตัวเว็บ จึงใช้ได้แม้เน็ตบล็อกพอร์ต 5432
// ============================================================================

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

/** งวดสะสมในไฟล์ ผูกกับไตรมาสไหน - 6 เดือนคือผลถึงไตรมาส 2 ไล่ไปจนครบปี */
const PERIOD_TO_QUARTER: Record<string, number> = {
  "6 เดือน": 2,
  "9 เดือน": 3,
  "12 เดือน": 4,
};

async function main() {
  const fiscalYear = await db.fiscalYear.findFirst({ where: { isActive: true } });
  if (!fiscalYear) throw new Error("ยังไม่ได้ตั้งปีบัญชีที่ใช้งานอยู่");

  const indicators = await db.indicator.findMany({
    where: { fiscalYearId: fiscalYear.id },
    select: { id: true, code: true, weight: true, department: { select: { code: true } } },
  });

  const byDeptCode = new Map<string, Map<string, (typeof indicators)[number]>>();
  for (const i of indicators) {
    const key = i.department.code;
    if (!byDeptCode.has(key)) byDeptCode.set(key, new Map());
    byDeptCode.get(key)!.set(i.code, i);
  }

  const missing: string[] = [];
  const extra: string[] = [];
  const weightMismatch: string[] = [];
  const cumulativeMismatch: string[] = [];
  let checkedRows = 0;
  let checkedCumulative = 0;

  for (const dept of scores.departments) {
    const inSystem = byDeptCode.get(dept.code);
    if (!inSystem) {
      missing.push(`${dept.code}: ไม่มีส่วนงานนี้ในระบบ`);
      continue;
    }

    const seen = new Set<string>();

    for (const row of dept.rows) {
      if (row.isGroup) continue;
      checkedRows++;
      seen.add(row.code);

      const ind = inSystem.get(row.code);
      if (!ind) {
        missing.push(`${dept.code} ข้อ ${row.code} (${row.name.slice(0, 40)}) ไม่มีในระบบ`);
        continue;
      }

      // น้ำหนักในไฟล์ต้องตรงกับน้ำหนักของตัวชี้วัดในระบบ
      if (row.weight !== null && Math.abs(row.weight - ind.weight) > 0.01) {
        weightMismatch.push(
          `${dept.code} ข้อ ${row.code}: ไฟล์ ${row.weight}% แต่ระบบ ${ind.weight}%`
        );
      }

      // ตรวจว่าคำนวณคะแนนสะสมกลับมาได้จาก ผล x น้ำหนัก / 100
      for (const c of row.cumulative) {
        if (c.value === null) continue;
        const q = PERIOD_TO_QUARTER[c.label];
        const actual = row.quarters.find((x) => x.quarter === q)?.actual ?? null;
        if (actual === null) {
          cumulativeMismatch.push(
            `${dept.code} ข้อ ${row.code} งวด ${c.label}: ไฟล์มีค่าสะสม ${c.value} แต่ไม่มี "ผล" ของไตรมาส ${q}`
          );
          continue;
        }
        checkedCumulative++;
        const computed = (actual * (row.weight ?? 0)) / 100;
        if (Math.abs(computed - c.value) > 0.0002) {
          cumulativeMismatch.push(
            `${dept.code} ข้อ ${row.code} งวด ${c.label}: ไฟล์ ${c.value} แต่คำนวณได้ ${computed.toFixed(5)}`
          );
        }
      }
    }

    for (const code of inSystem.keys()) {
      if (!seen.has(code)) extra.push(`${dept.code} ข้อ ${code}: มีในระบบแต่ไม่มีในไฟล์คะแนน`);
    }
  }

  console.log(`ตรวจตัวชี้วัด ${checkedRows} แถว และค่าคะแนนสะสม ${checkedCumulative} ค่า\n`);

  const report = (title: string, list: string[]) => {
    if (list.length === 0) {
      console.log(`  ${title}: ผ่าน`);
      return;
    }
    console.log(`  ${title}: พบ ${list.length} รายการ`);
    for (const line of list.slice(0, 15)) console.log(`      - ${line}`);
    if (list.length > 15) console.log(`      ... อีก ${list.length - 15} รายการ`);
  };

  report("เลขข้อในไฟล์มีในระบบครบ", missing);
  report("ไม่มีตัวชี้วัดในระบบที่ไฟล์ไม่มี", extra);
  report("น้ำหนักตรงกัน", weightMismatch);
  report("คำนวณคะแนนสะสมกลับได้", cumulativeMismatch);

  await db.$disconnect();
}

main();
