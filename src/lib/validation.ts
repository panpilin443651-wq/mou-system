import { z } from "zod";

// ============================================================================
// กฎการตรวจสอบข้อมูลที่ผู้ใช้กรอก
// ============================================================================
// ตรวจที่ฝั่งเซิร์ฟเวอร์เสมอ ไม่ใช่แค่ attribute required ในฟอร์ม
// เพราะข้อมูลอาจถูกส่งมาโดยไม่ผ่านหน้าเว็บของเรา
// ============================================================================

/** แปลงค่าจากฟอร์ม (ได้มาเป็น string เสมอ) ให้เป็นตัวเลข */
const numberFromForm = (fieldName: string) =>
  z
    .string()
    .trim()
    .min(1, `กรุณากรอก${fieldName}`)
    .refine((v) => !Number.isNaN(Number(v)), `${fieldName}ต้องเป็นตัวเลข`)
    .transform(Number);

/** ช่องที่เว้นว่างได้ ถ้าว่างให้เก็บเป็น null ไม่ใช่ "" */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const optionalNumber = z
  .string()
  .trim()
  .transform((v) => (v === "" || v === "-" ? null : Number(v)))
  .refine((v) => v === null || !Number.isNaN(v), "ต้องเป็นตัวเลข")
  .nullable();

/** ค่าเกณฑ์ระดับหนึ่ง ต้องกรอก เป็นตัวเลขหรือข้อความก็ได้ */
const criteriaText = (fieldName: string) =>
  z
    .string()
    .trim()
    .min(1, `กรุณากรอก${fieldName}`)
    .max(1000, `${fieldName}ยาวเกินไป (ไม่เกิน 1,000 ตัวอักษร)`);

/** รายการเงื่อนไขของตัวชี้วัด */
const conditionList = z
  .array(z.string().trim().max(500, "เงื่อนไขยาวเกินไป (ไม่เกิน 500 ตัวอักษรต่อข้อ)"))
  .max(30, "เงื่อนไขมากเกินไป (ไม่เกิน 30 ข้อ)")
  .transform((list) => list.filter((c) => c !== ""));

export const indicatorSchema = z.object({
  departmentId: z.string().min(1, "กรุณาเลือกส่วนงาน"),
  fiscalYearId: numberFromForm("ปีบัญชี"),

  code: z
    .string()
    .trim()
    .min(1, "กรุณากรอกลำดับตัวชี้วัด")
    .max(20, "ลำดับตัวชี้วัดยาวเกินไป")
    .regex(/^[\d.]+$/, "ลำดับตัวชี้วัดใช้ได้เฉพาะตัวเลขและจุด เช่น 1 หรือ 4.1"),

  name: z.string().trim().min(4, "ชื่อตัวชี้วัดสั้นเกินไป").max(300, "ชื่อตัวชี้วัดยาวเกินไป"),
  description: optionalText,
  dimension: optionalText,
  groupName: optionalText,

  unit: z.string().trim().min(1, "กรุณากรอกหน่วยวัด").max(30, "หน่วยวัดยาวเกินไป"),
  baselineValue: optionalNumber,
  adjustmentNote: optionalText,

  weight: numberFromForm("น้ำหนัก")
    .refine((v) => v >= 0, "น้ำหนักต้องไม่ติดลบ")
    .refine((v) => v <= 100, "น้ำหนักต้องไม่เกิน 100"),

  direction: z.enum(["HIGHER_IS_BETTER", "LOWER_IS_BETTER"]),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),

  // ค่าเกณฑ์วัดระดับ 1-5 ตามรูปแบบ MOU - เป็นตัวเลขหรือข้อความก็ได้
  // (แยกว่าเป็นตัวเลขหรือไม่ที่ parseTargetInput ตอนบันทึก)
  level1: criteriaText("ค่าเกณฑ์ระดับ 1"),
  level2: criteriaText("ค่าเกณฑ์ระดับ 2"),
  level3: criteriaText("ค่าเกณฑ์ระดับ 3 (ค่าเป้าหมายหลัก)"),
  level4: criteriaText("ค่าเกณฑ์ระดับ 4"),
  level5: criteriaText("ค่าเกณฑ์ระดับ 5"),

  // เงื่อนไขของตัวชี้วัด มีได้หลายข้อ ช่องที่เว้นว่างถูกตัดทิ้ง
  conditions: conditionList,
});

export type IndicatorInput = z.infer<typeof indicatorSchema>;

export const userSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "กรุณากรอกอีเมล")
      .email("รูปแบบอีเมลไม่ถูกต้อง")
      .transform((v) => v.toLowerCase()),
    name: z.string().trim().min(2, "กรุณากรอกชื่อ-นามสกุล").max(150, "ชื่อยาวเกินไป"),
    role: z.enum(["ADMIN", "DEPT_USER", "EXECUTIVE"]),
    departmentId: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
  })
  .refine((v) => v.role !== "DEPT_USER" || v.departmentId !== null, {
    // ถ้า DEPT_USER ไม่มีสังกัด จะมองไม่เห็นข้อมูลอะไรเลยและใช้งานไม่ได้
    message: "ผู้รับผิดชอบส่วนงานต้องระบุสังกัด",
    path: ["departmentId"],
  });

/** รหัสผ่านที่ ADMIN ตั้งให้ตอนสร้างบัญชีหรือรีเซ็ต */
export const initialPasswordSchema = z
  .string()
  .min(8, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
  .max(72, "รหัสผ่านยาวเกินไป");

export const fiscalYearSchema = z
  .object({
    year: z
      .string()
      .trim()
      .refine((v) => /^\d{4}$/.test(v), "ปีบัญชีต้องเป็นตัวเลข 4 หลัก (พ.ศ.)")
      .transform(Number)
      .refine((v) => v >= 2500 && v <= 2700, "ปีบัญชีต้องอยู่ระหว่าง 2500-2700 (พ.ศ.)"),
    startDate: z.string().min(1, "กรุณาเลือกวันเริ่มต้นปีบัญชี"),
    endDate: z.string().min(1, "กรุณาเลือกวันสิ้นสุดปีบัญชี"),
  })
  .refine((v) => v.startDate < v.endDate, {
    message: "วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น",
    path: ["endDate"],
  });

/** ช่องข้อความยาวที่เว้นว่างได้ ถ้าว่างเก็บเป็น null ไม่ใช่ "" */
const longText = (fieldName: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${fieldName}ยาวเกินไป (ไม่เกิน ${max.toLocaleString("th-TH")} ตัวอักษร)`)
    .transform((v) => (v === "" ? null : v))
    .nullable();

/**
 * ผลการดำเนินงานรายไตรมาส (ข้อ 4, 5)
 *
 * `intent` บอกว่าผู้ใช้กด "บันทึกร่าง" หรือ "ส่งผล"
 * ร่างยอมให้เว้นช่องผลงานจริงไว้ก่อนได้ แต่ตอนส่งต้องกรอกให้ครบ
 * เพราะระบบอ่านตัวเลขจากไฟล์แนบเองไม่ได้ ต้องอาศัยเลขที่ส่วนงานกรอก
 */
export const reportSchema = z
  .object({
    intent: z.enum(["draft", "submit"]),
    actualValue: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .refine((v) => v === null || !Number.isNaN(v), "ผลงานที่ทำได้ต้องเป็นตัวเลข")
      .nullable(),

    // ช่องตามแบบฟอร์มรายงานผล
    // เอาช่อง คำอธิบายผล / ผู้รับผิดชอบ / วัตถุประสงค์ / แผนงานสำคัญ ออกแล้ว (17 ก.ย. 2569)
    // คอลัมน์ในฐานข้อมูลยังอยู่ ข้อมูลที่เคยกรอกไว้จึงไม่หาย แค่ไม่ได้แสดงและแก้ไม่ได้
    /** เว้นว่าง = ใช้คะแนนที่ระบบคำนวณให้ */
    scoreOverride: z
      .string()
      .trim()
      .refine((v) => v === "" || /^[0-5]$/.test(v), "คะแนนที่ปรับต้องอยู่ระหว่าง 0-5")
      .transform((v) => (v === "" ? null : Number(v))),
    scoreNote: z
      .string()
      .trim()
      .max(500, "เหตุผลยาวเกินไป")
      .transform((v) => (v === "" ? null : v))
      .nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.intent === "submit" && v.actualValue === null) {
      ctx.addIssue({
        code: "custom",
        message: "ต้องกรอกผลงานที่ทำได้ก่อนจึงจะส่งผลได้ (ถ้ายังไม่มีตัวเลข ให้กดบันทึกร่างไว้ก่อน)",
        path: ["actualValue"],
      });
    }
    // การปรับคะแนนด้วยมือต้องมีเหตุผลกำกับเสมอ เพื่อให้ตรวจสอบย้อนหลังได้
    if (v.scoreOverride !== null && v.scoreNote === null) {
      ctx.addIssue({
        code: "custom",
        message: "ถ้าปรับคะแนนด้วยมือ ต้องระบุเหตุผลด้วย",
        path: ["scoreNote"],
      });
    }
  });

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "กรุณากรอกรหัสผ่านปัจจุบัน"),
    newPassword: z
      .string()
      .min(8, "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร")
      .max(72, "รหัสผ่านยาวเกินไป"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม",
    path: ["newPassword"],
  });

/** รวบรวมข้อความ error จาก Zod ให้เป็นข้อความเดียวสำหรับแสดงบนหน้าจอ */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
}

// ----------------------------------------------------------------------------
// แผนดำเนินงานตามแบบฟอร์มเอกสารแนบ 4
// ----------------------------------------------------------------------------

/** ส่วนหัวของแบบฟอร์ม (ผู้รับผิดชอบตัวชี้วัด · งบประมาณ) */
export const planHeaderSchema = z.object({
  owner: longText("ผู้รับผิดชอบตัวชี้วัด", 300),
  budget: longText("งบประมาณ", 100),
});

/**
 * ตัวเลขในช่องเดือน และช่องค่าเป้าหมาย
 *
 * ช่องว่างกับเลข 0 ไม่เหมือนกัน — ว่าง = เดือนนั้นไม่ได้วางแผนอะไรไว้
 * ส่วน 0 = วางแผนไว้ว่าไม่ทำ ทั้งสองอย่างต้องเก็บแยกกันให้ได้
 * ผู้ใช้พิมพ์เลขหลักพันมักติดจุลภาคมาด้วย จึงตัดออกให้ก่อนแปลงเป็นตัวเลข
 */
export const planNumber = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .refine((v) => v === "" || /^-?\d+(\.\d+)?$/.test(v), "ช่องตัวเลขกรอกได้เฉพาะตัวเลข")
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), "ตัวเลขไม่ถูกต้อง");

/**
 * หนึ่งบรรทัดในตารางแผน (ยังไม่รวมตัวเลขรายเดือน ซึ่งตรวจด้วย planNumber ทีละช่อง)
 *
 * ชื่อรายการปล่อยว่างได้ เพราะคนกรอกมักกดเพิ่มบรรทัดเปล่าไว้หลายบรรทัดก่อน
 * แล้วค่อยไล่พิมพ์ทีหลัง ถ้าบังคับให้กรอกจะกดเพิ่มบรรทัดที่สองไม่ได้เลย
 * (บรรทัดเปล่าไม่ทำให้ตัวเลขเพี้ยน เพราะยอดรวมคิดจากช่องเดือนล้วน ๆ)
 */
/** "รายงานผลการดำเนินงาน" ของค่าเกณฑ์หนึ่งระดับ ในตารางติดตามการดำเนินงานตามแผน */
export const planLevelReportText = longText("รายงานผลการดำเนินงานของระดับ", 4000);

export const planRowSchema = z.object({
  title: z.string().trim().max(500, "ชื่อรายการยาวเกินไป (ไม่เกิน 500 ตัวอักษร)"),
  targetValue: planNumber,
  unit: longText("หน่วยนับ", 50),
  causeNote: longText("สาเหตุที่ไม่สามารถดำเนินการได้", 1000),
  correctiveAction: longText("แนวทางการดำเนินการแก้ไข", 1000),
  // "คำอธิบายเพิ่มเติม" เอาออกจากแบบฟอร์มแล้ว (17 ก.ย. 2569) - ไม่อ่านไม่เขียน ข้อความเดิมในฐานข้อมูลไม่หาย
});


