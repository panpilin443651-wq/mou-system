import type { Role } from "@prisma/client";

// ============================================================================
// กฎเรื่องสิทธิ์ทั้งหมดของระบบ - รวมไว้ที่ไฟล์เดียว
// ============================================================================
// ทำไมต้องรวมไว้ที่เดียว?
// เพราะกฎเหล่านี้ถูกเรียกใช้จากหลายหน้า ถ้าเขียนกระจายไปตามแต่ละหน้า
// เวลาแก้กฎจะแก้ไม่ทั่ว แล้วจะเกิดช่องโหว่ที่บางหน้าลืมตรวจ
//
// กฎที่ยืนยันแล้ว:
//   ADMIN      = ส่วนกลาง ทำได้ทุกอย่าง สร้าง/แก้ตัวชี้วัดให้ทุกส่วนงาน
//   DEPT_USER  = ผู้รายงาน เห็นเฉพาะคะแนนและรายงานผลการดำเนินงานของส่วนงานตัวเอง
//                (ไม่เห็นหน้าภาพรวม) แก้ตัวชี้วัดไม่ได้ กรอกแผน/ผลและบันทึกร่างได้ แต่กดส่งไม่ได้
//   DEPT_HEAD  = หัวหน้าส่วนงาน/หัวหน้าหน่วยงานที่ไม่สังกัดส่วนงาน เห็นและแก้ได้เหมือน DEPT_USER
//                และเป็นผู้กดส่งแผน/ส่งผล รับแจ้งเตือนเมื่อส่วนกลางตีกลับ
//   EXECUTIVE  = ดูได้ทุกส่วนงาน แต่แก้ไขอะไรไม่ได้เลย
// ============================================================================

/** ข้อมูลผู้ใช้เท่าที่จำเป็นต่อการตัดสินสิทธิ์ */
export type Actor = {
  role: Role;
  departmentId: string | null;
};

/** ผู้ใช้ของส่วนงาน (ผู้รายงาน หรือ หัวหน้าส่วนงาน) - เห็นและแก้ได้เฉพาะส่วนงานตัวเอง */
export function isDepartmentRole(role: Role): boolean {
  return role === "DEPT_USER" || role === "DEPT_HEAD";
}

// ---------------------------------------------------------------------------
// สิทธิ์ต่อตัวชี้วัด
// ---------------------------------------------------------------------------

/** สร้าง แก้ไข หรือลบตัวชี้วัดได้หรือไม่ - เฉพาะส่วนกลางเท่านั้น */
export function canManageIndicators(actor: Actor): boolean {
  return actor.role === "ADMIN";
}

/**
 * กรอกและแก้คะแนนประเมินรายตัวชี้วัดได้หรือไม่ - เฉพาะส่วนกลางเท่านั้น
 *
 * แยกจาก canSubmitReport เพราะคนละเรื่องกัน: ส่วนงานกรอก "ผลการดำเนินงาน"
 * ของตัวเองได้ แต่ "คะแนนที่ได้" ต้องเป็นส่วนกลางเป็นคนให้ ไม่งั้นก็ให้คะแนนตัวเอง
 */
export function canManageMouScores(actor: Actor): boolean {
  return actor.role === "ADMIN";
}

// ---------------------------------------------------------------------------
// สิทธิ์ต่อการรายงานผล
// ---------------------------------------------------------------------------

/** กรอกผลและแนบไฟล์ของส่วนงานนี้ได้หรือไม่ */
export function canSubmitReport(actor: Actor, departmentId: string): boolean {
  if (actor.role === "ADMIN") return true;
  if (isDepartmentRole(actor.role)) return actor.departmentId === departmentId;
  return false; // EXECUTIVE ดูได้อย่างเดียว
}

/**
 * กด "ส่งแผน" และ "ส่งผล" ของส่วนงานนี้ได้หรือไม่
 *
 * ผู้รายงานกรอกและบันทึกร่างได้ แต่การส่งต้องเป็นหัวหน้าส่วนงาน/หน่วยงาน (หรือส่วนกลาง)
 * แยกจาก canSubmitReport ซึ่งตอบแค่ว่า "กรอกได้ไหม"
 */
export function canSendForDepartment(actor: Actor, departmentId: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "DEPT_HEAD" && actor.departmentId === departmentId;
}

/** ตีกลับแผน/ผลที่ส่งมาแล้วให้ส่วนงานแก้ - เฉพาะส่วนกลาง */
export function canReturnSubmission(actor: Actor): boolean {
  return actor.role === "ADMIN";
}

// ---------------------------------------------------------------------------
// สิทธิ์ต่อแผนการดำเนินงาน (ข้อ 6)
// ---------------------------------------------------------------------------

/**
 * เพิ่ม แก้ไข หรือลบกิจกรรมในแผนของส่วนงานนี้ได้หรือไม่
 *
 * แผนงานเป็นของส่วนงานเจ้าของตัวชี้วัด ต่างจากตัวชี้วัดที่ส่วนกลางกำหนดให้
 * ส่วนงานจึงวางแผนของตัวเองได้ ส่วนกลางช่วยแก้ให้ได้ทุกส่วนงาน
 * ผู้บริหารดูได้อย่างเดียว
 */
export function canManagePlan(actor: Actor, departmentId: string): boolean {
  if (actor.role === "ADMIN") return true;
  if (isDepartmentRole(actor.role)) return actor.departmentId === departmentId;
  return false;
}

// ---------------------------------------------------------------------------
// สิทธิ์ต่อการตั้งค่าระบบ (ปีบัญชี, ช่วงเวลาเปิด-ปิด, ผู้ใช้, ส่วนงาน)
// ---------------------------------------------------------------------------

export function canManageSystem(actor: Actor): boolean {
  return actor.role === "ADMIN";
}

// ---------------------------------------------------------------------------
// การมองเห็นข้อมูล - ส่วนที่สำคัญที่สุด
// ---------------------------------------------------------------------------

/** ดูข้อมูลของส่วนงานนี้ได้หรือไม่ */
export function canViewDepartment(actor: Actor, departmentId: string): boolean {
  if (actor.role === "ADMIN" || actor.role === "EXECUTIVE") return true;
  return actor.departmentId === departmentId;
}

/**
 * เงื่อนไขกรองส่วนงานสำหรับใส่ใน Prisma query
 *
 * ใช้แบบนี้:
 *   const indicators = await db.indicator.findMany({
 *     where: { fiscalYearId, ...departmentScope(actor) },
 *   });
 *
 * ADMIN / EXECUTIVE  -> {}                    (ไม่กรอง เห็นทุกส่วนงาน)
 * DEPT_USER          -> { departmentId: "..." } (เห็นเฉพาะของตัวเอง)
 *
 * กรณี DEPT_USER ที่ไม่มีสังกัด จะคืนเงื่อนไขที่ไม่ match อะไรเลย
 * เพื่อไม่ให้หลุดเห็นข้อมูลทั้งหมดโดยไม่ตั้งใจ
 */
export function departmentScope(actor: Actor): { departmentId?: string } {
  if (actor.role === "ADMIN" || actor.role === "EXECUTIVE") return {};
  return { departmentId: actor.departmentId ?? "__ไม่มีสังกัด__" };
}

/**
 * เข้าหน้าภาพรวม (และดาวน์โหลด Excel สรุปภาพรวม) ได้หรือไม่
 *
 * ผู้รับผิดชอบส่วนงานไม่เห็นหน้าภาพรวม เห็นแค่คะแนนและรายงานผลของส่วนงานตัวเอง
 * หน้าที่ตอบ false ต้อง redirect ไปหน้า homePath แทน
 */
export function canViewDashboard(actor: Actor): boolean {
  return actor.role === "ADMIN" || actor.role === "EXECUTIVE";
}

/** หน้าแรกหลัง login ของ role นี้ */
export function homePath(actor: Actor): string {
  return canViewDashboard(actor) ? "/dashboard" : "/reports";
}

/**
 * ชื่อเมนูและหัวข้อหน้า /indicators ตาม role
 *
 * ผู้รับผิดชอบส่วนงานเห็นหน้านี้เพื่อดูคะแนนของหน่วยตัวเอง จึงใช้ชื่อที่บอกตรงๆ ว่าเป็นคะแนน
 */
export function indicatorsMenuLabel(actor: Actor): string {
  return isDepartmentRole(actor.role) ? "คะแนนของส่วนงาน/หน่วยงาน" : "ส่วนงานและหน่วยงาน";
}

// ---------------------------------------------------------------------------
// ตัวช่วยสำหรับหน้าเว็บ
// ---------------------------------------------------------------------------

/** ชื่อ role ภาษาไทย ใช้แสดงบนหน้าจอ */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "ผู้ดูแลระบบ (ส่วนกลาง)",
  DEPT_USER: "ผู้รับผิดชอบส่วนงาน (ผู้รายงาน)",
  DEPT_HEAD: "หัวหน้าส่วนงาน/หัวหน้าหน่วยงานที่ไม่สังกัดส่วนงาน",
  EXECUTIVE: "ผู้บริหาร",
};

/** ชื่อ role แบบสั้น ใช้บนป้ายเล็กๆ เช่นรายชื่อผู้ใช้ในโหมดจำลองสิทธิ์ */
export const ROLE_BADGE: Record<Role, string> = {
  ADMIN: "ผู้ดูแลระบบ",
  DEPT_USER: "ผู้บันทึกข้อมูล",
  DEPT_HEAD: "หัวหน้าส่วนงาน",
  EXECUTIVE: "ผู้บริหาร",
};

/** เมนูที่ role นี้เห็น - ใช้ซ่อนเมนูให้หน้าจอสะอาด ไม่ใช่มาตรการความปลอดภัย */
export function visibleMenus(actor: Actor) {
  const isAdmin = actor.role === "ADMIN";
  return {
    dashboard: canViewDashboard(actor),
    indicators: true,
    // ผู้บริหารต้องเห็นเมนูรายงานผลด้วย เพราะเป็นคนอ่านผลเป็นหลัก
    // หน้าเหล่านั้นจะแสดงแบบอ่านอย่างเดียวให้เอง ไม่มีปุ่มกรอกหรือแก้
    reports: true,
    plans: true,
    admin: isAdmin,
  };
}
