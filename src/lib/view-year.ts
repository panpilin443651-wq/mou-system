import { cookies } from "next/headers";
import { db } from "@/lib/db";

// ============================================================================
// ปีบัญชีที่ผู้ใช้เลือกดู
// ============================================================================
// ทุกสิทธิ์เลือกดูปีบัญชีย้อนหลังหรือปีอื่นได้ (แถบใต้หัวเว็บ) โดยไม่กระทบคนอื่น
// เก็บเป็น cookie ของเครื่องผู้ใช้ ไม่เปลี่ยน "ปีบัญชีที่ใช้งานอยู่" ของระบบ (isActive)
// ซึ่งยังเป็นสิทธิ์ของส่วนกลางที่หน้าตั้งค่าระบบ > ปีบัญชี
//
// ไม่ได้เลือก หรือปีที่เลือกถูกลบไปแล้ว = ใช้ปีบัญชีที่ใช้งานอยู่
// การกรอก/แก้ข้อมูลของปีที่ไม่ใช่ปีปัจจุบัน ยังถูกคุมด้วยช่วงเวลาเปิด-ปิดระบบเหมือนเดิม
// ============================================================================

export const VIEW_YEAR_COOKIE = "viewFiscalYear";

export type ViewFiscalYear = {
  id: number;
  year: number;
  isActive: boolean;
};

/** ปีบัญชีที่หน้านี้ควรแสดง - null เมื่อระบบยังไม่มีปีบัญชีเลย */
export async function getViewFiscalYear(): Promise<ViewFiscalYear | null> {
  const select = { id: true, year: true, isActive: true } as const;
  const chosen = Number((await cookies()).get(VIEW_YEAR_COOKIE)?.value);
  if (Number.isInteger(chosen) && chosen > 0) {
    const year = await db.fiscalYear.findUnique({ where: { year: chosen }, select });
    if (year) return year;
  }
  return db.fiscalYear.findFirst({ where: { isActive: true }, select });
}
