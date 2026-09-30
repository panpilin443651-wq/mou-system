import { PrismaClient, ScoreDirection } from "@prisma/client";
import bcrypt from "bcryptjs";
import { departments } from "./departments";
import indicatorData from "./indicators.json";

/// รูปแบบข้อมูลตัวชี้วัดที่ดึงมาจากไฟล์ MOU (Word) ทั้ง 30 ฉบับ
type IndicatorSeed = {
  code: string;
  name: string;
  dimension: string | null;
  groupName: string | null;
  unit: string;
  baselineValue: number | null;
  weight: number;
  direction: string;
  adjustmentNote: string | null;
  targetValue: number;
  /// ค่าเกณฑ์วัดระดับ 1-5 เรียงจากระดับ 1 ถึง 5
  levels: number[];
};

const indicatorsByDept = indicatorData as Record<string, IndicatorSeed[]>;

// ============================================================================
// สคริปต์ใส่ข้อมูลตั้งต้นลงฐานข้อมูล
// รันด้วยคำสั่ง: npm run db:seed
//
// สคริปต์นี้รันซ้ำได้โดยไม่เกิดข้อมูลซ้ำ (ใช้ upsert)
// ============================================================================

const prisma = new PrismaClient();

/**
 * แปลงเวลาประเทศไทยเป็นเวลา UTC สำหรับเก็บลงฐานข้อมูล
 *
 * ฐานข้อมูลเก็บเวลาเป็น UTC เสมอ ส่วนไทยคือ UTC+7
 * ดังนั้น "1 ม.ค. 2569 เวลา 00:00 น. ตามเวลาไทย" = "31 ธ.ค. 2568 เวลา 17:00 UTC"
 *
 * ถ้าไม่แปลง ระบบจะเปิด-ปิดคลาดเคลื่อนไป 7 ชั่วโมง
 */
function bangkokTime(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}

async function main() {
  console.log("เริ่มใส่ข้อมูลตั้งต้น...\n");

  // --------------------------------------------------------------------------
  // 1. ส่วนงาน 30 หน่วย
  // --------------------------------------------------------------------------
  for (const [index, dept] of departments.entries()) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, type: dept.type, sortOrder: index },
      create: { ...dept, sortOrder: index },
    });
  }
  console.log(`  สร้างส่วนงานแล้ว ${departments.length} หน่วย`);

  // --------------------------------------------------------------------------
  // 2. ปีบัญชี 2569 (1 ต.ค. 2568 - 30 ก.ย. 2569)
  //    ช่วงวันที่ตรงกับที่ระบุในข้อ 2 ของ MOU ฉบับลงนามทุกฉบับ
  // --------------------------------------------------------------------------
  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { year: 2569 },
    update: {},
    create: {
      year: 2569,
      startDate: bangkokTime(2025, 10, 1),
      endDate: bangkokTime(2026, 9, 30, 23, 59),
      isActive: true,
    },
  });
  console.log(`  สร้างปีงบประมาณ ${fiscalYear.year} แล้ว`);

  // --------------------------------------------------------------------------
  // 3. ช่วงเวลาเปิด-ปิดรับรายงาน 4 ไตรมาส
  //
  //    ไตรมาสของปีงบประมาณไทย:
  //      Q1 = ต.ค.-ธ.ค. | Q2 = ม.ค.-มี.ค. | Q3 = เม.ย.-มิ.ย. | Q4 = ก.ค.-ก.ย.
  //
  //    ช่วงรายงานผล = 3 เดือนของไตรมาสนั้น (ระบบคิดจากวันที่เองใน lib/submission-window.ts
  //    ค่าในตารางนี้เก็บไว้ให้ตรงกัน และใช้ผูกการปิดฉุกเฉิน / ขยายเวลาเฉพาะส่วนงาน)
  // --------------------------------------------------------------------------
  const windows = [
    { quarter: 1, openAt: bangkokTime(2025, 10, 1), closeAt: bangkokTime(2025, 12, 31, 23, 59) },
    { quarter: 2, openAt: bangkokTime(2026, 1, 1), closeAt: bangkokTime(2026, 3, 31, 23, 59) },
    { quarter: 3, openAt: bangkokTime(2026, 4, 1), closeAt: bangkokTime(2026, 6, 30, 23, 59) },
    { quarter: 4, openAt: bangkokTime(2026, 7, 1), closeAt: bangkokTime(2026, 9, 30, 23, 59) },
  ];

  for (const w of windows) {
    await prisma.submissionWindow.upsert({
      where: { fiscalYearId_quarter: { fiscalYearId: fiscalYear.id, quarter: w.quarter } },
      update: {},
      create: { fiscalYearId: fiscalYear.id, ...w },
    });
  }
  console.log(`  สร้างช่วงเวลาเปิด-ปิดระบบแล้ว ${windows.length} ไตรมาส`);

  // --------------------------------------------------------------------------
  // 4. ตัวชี้วัดและเกณฑ์คะแนน 1-5 (ดึงจาก MOU ฉบับลงนาม ปีบัญชี 2569)
  // --------------------------------------------------------------------------
  const deptIdByCode = new Map(
    (await prisma.department.findMany({ select: { id: true, code: true } })).map((d) => [
      d.code,
      d.id,
    ])
  );

  let indicatorCount = 0;
  let criteriaCount = 0;

  for (const [deptCode, list] of Object.entries(indicatorsByDept)) {
    const departmentId = deptIdByCode.get(deptCode);
    if (!departmentId) {
      console.log(`  ข้าม: ไม่พบส่วนงานรหัส "${deptCode}" ในฐานข้อมูล`);
      continue;
    }

    for (const item of list) {
      const indicator = await prisma.indicator.upsert({
        where: {
          fiscalYearId_departmentId_code: {
            fiscalYearId: fiscalYear.id,
            departmentId,
            code: item.code,
          },
        },
        update: {
          name: item.name,
          dimension: item.dimension,
          groupName: item.groupName,
          unit: item.unit,
          targetValue: item.targetValue,
          baselineValue: item.baselineValue,
          weight: item.weight,
          direction: item.direction as ScoreDirection,
          adjustmentNote: item.adjustmentNote,
        },
        create: {
          fiscalYearId: fiscalYear.id,
          departmentId,
          code: item.code,
          name: item.name,
          dimension: item.dimension,
          groupName: item.groupName,
          unit: item.unit,
          targetValue: item.targetValue,
          baselineValue: item.baselineValue,
          weight: item.weight,
          direction: item.direction as ScoreDirection,
          adjustmentNote: item.adjustmentNote,
        },
      });
      indicatorCount++;

      // เกณฑ์คะแนน 5 ระดับของตัวชี้วัดนี้
      for (const [index, value] of item.levels.entries()) {
        const level = index + 1;
        await prisma.scoreCriteria.upsert({
          where: { indicatorId_level: { indicatorId: indicator.id, level } },
          update: { targetValue: value },
          create: {
            indicatorId: indicator.id,
            level,
            targetValue: value,
            description: `ระดับ ${level} = ${value} ${item.unit}`,
          },
        });
        criteriaCount++;
      }
    }
  }
  console.log(`  สร้างตัวชี้วัดแล้ว ${indicatorCount} รายการ`);
  console.log(`  สร้างเกณฑ์คะแนนแล้ว ${criteriaCount} รายการ`);

  // --------------------------------------------------------------------------
  // 5. บัญชีผู้ดูแลระบบคนแรก
  // --------------------------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log("\n  ข้ามการสร้างบัญชี ADMIN");
    console.log("  (ยังไม่ได้ตั้งค่า SEED_ADMIN_EMAIL และ SEED_ADMIN_PASSWORD ในไฟล์ .env)");
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        name: "ผู้ดูแลระบบ",
        passwordHash,
        role: "ADMIN",
      },
    });
    console.log(`\n  สร้างบัญชีผู้ดูแลระบบแล้ว: ${adminEmail}`);
    console.log("  >>> กรุณาเปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก <<<");
  }

  console.log("\nใส่ข้อมูลตั้งต้นเรียบร้อย");
}

main()
  .catch((error) => {
    console.error("เกิดข้อผิดพลาดขณะใส่ข้อมูลตั้งต้น:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
