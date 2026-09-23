import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";

// ============================================================================
// การเลือกส่วนงาน ที่หน้า "ส่วนงานและหน่วยงาน" "รายงานผล" และ "แผนดำเนินงาน" ใช้ร่วมกัน
// ============================================================================
// ทั้งสามหน้าทำงานเป็นสองชั้นเหมือนกัน
//   ชั้นที่ 1  ยังไม่เลือกส่วนงาน -> แสดงรายชื่อส่วนงาน
//   ชั้นที่ 2  เลือกแล้ว          -> แสดงตัวชี้วัดของส่วนงานนั้น
//
// ทำไมไม่แสดงตัวชี้วัดทั้ง 301 รายการรวดเดียวเหมือนเดิม?
//   ผู้ใช้เข้ามาเพื่อทำงานของส่วนงานใดส่วนงานหนึ่งเสมอ ไม่ได้เข้ามาอ่านรวมทุกหน่วย
//   การให้เลือกส่วนงานก่อนจึงตรงกับวิธีทำงานจริง และทำให้หน้าแรกอ่านง่ายขึ้นมาก
//
// ผู้รับผิดชอบส่วนงานเห็นได้หน่วยเดียวอยู่แล้ว ระบบจึงข้ามชั้นที่ 1 ให้เลย
// ============================================================================

export type PickableDepartment = { id: string; code: string; name: string };

/**
 * ส่วนงานที่ผู้ใช้คนนี้มีสิทธิ์เห็น
 *
 * ผู้รับผิดชอบส่วนงานได้แค่หน่วยของตัวเอง ส่วนกลางและผู้บริหารได้ทุกหน่วย
 * กรองที่ฐานข้อมูล ไม่ใช่กรองตอนแสดงผล เพื่อให้กฎเดียวกันกับทั้งระบบ
 */
export async function visibleDepartments(actor: Actor): Promise<PickableDepartment[]> {
  const onlyOwn = actor.role !== "ADMIN" && actor.role !== "EXECUTIVE";

  return db.department.findMany({
    where: {
      isActive: true,
      ...(onlyOwn ? { id: actor.departmentId ?? "__ไม่มีสังกัด__" } : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}

/** กรองรายชื่อส่วนงานด้วยคำค้น เทียบทั้งรหัสย่อและชื่อเต็ม แบบไม่สนตัวพิมพ์ */
export function filterDepartments(
  departments: PickableDepartment[],
  q: string | undefined
): PickableDepartment[] {
  const term = q?.trim().toLowerCase();
  if (!term) return departments;

  return departments.filter(
    (d) => d.code.toLowerCase().includes(term) || d.name.toLowerCase().includes(term)
  );
}

/**
 * ส่วนงานที่กำลังเปิดดูอยู่ หรือ null ถ้ายังไม่ได้เลือก
 *
 * รับเฉพาะรหัสที่อยู่ในรายการที่ผู้ใช้เห็นได้จริง ถ้าใครแก้ dept ใน URL
 * เป็นของส่วนงานอื่น จะถือว่ายังไม่ได้เลือก ไม่ใช่หลุดไปเห็นข้อมูลหน่วยอื่น
 *
 * ผู้ที่เห็นได้หน่วยเดียว (ผู้รับผิดชอบส่วนงาน) ให้เลือกหน่วยนั้นอัตโนมัติ
 * จะได้ไม่ต้องกดผ่านหน้าที่มีรายการเดียว
 */
export function selectedDepartment(
  departments: PickableDepartment[],
  dept: string | undefined
): PickableDepartment | null {
  if (departments.length === 1) return departments[0];
  return departments.find((d) => d.id === dept) ?? null;
}
