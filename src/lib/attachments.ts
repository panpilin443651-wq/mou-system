// ============================================================================
// กฎเรื่องไฟล์แนบหลักฐาน (ข้อ 4)
// ============================================================================
// ไฟล์เก็บบน Vercel Blob ไม่ได้เก็บบนเซิร์ฟเวอร์เอง
// เพราะ Vercel ล้างไฟล์ที่เขียนลงดิสก์ทิ้งทุกครั้งที่ deploy ใหม่
//
// เบราว์เซอร์อัปโหลดตรงไปที่ Blob ไม่ผ่านเซิร์ฟเวอร์ของเรา
// เพราะ Vercel จำกัดขนาดข้อมูลที่ส่งเข้าฟังก์ชันไว้ที่ 4.5 MB
// ถ้าให้ไฟล์ 10 MB วิ่งผ่านเซิร์ฟเวอร์ จะอัปโหลดไม่สำเร็จตอนขึ้นระบบจริง
//
// จุดที่ต้องระวัง: ต้องตรวจสิทธิ์ "ตอนออกบัตรผ่าน" (ก่อนเบราว์เซอร์เริ่มอัปโหลด)
// ไม่ใช่ตรวจหลังอัปโหลดเสร็จ เพราะตอนนั้นไฟล์ขึ้นไปอยู่บน Blob แล้ว
// ============================================================================

/** ขนาดสูงสุดต่อไฟล์ 1 ไฟล์ */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** หลักฐานประกอบผลการดำเนินงานของแผน แนบได้ไม่เกินกี่ไฟล์ต่อ 1 ขั้นตอน/รายการ */
export const MAX_PLAN_FILES_PER_ROW = 4;

/**
 * ชนิดไฟล์ที่อนุญาต: PDF, Word, Excel และรูปภาพ
 *
 * ไม่อนุญาตไฟล์ที่รันได้ (.exe .bat .js) หรือไฟล์บีบอัด (.zip)
 * เพราะเปิดช่องให้อัปโหลดโปรแกรมอันตรายเข้ามาเก็บไว้ในระบบ
 */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** ใช้ในช่องเลือกไฟล์ เพื่อให้หน้าต่างเลือกไฟล์กรองให้ตั้งแต่แรก */
export const FILE_INPUT_ACCEPT = [
  ...ALLOWED_MIME_TYPES,
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
].join(",");

export const ALLOWED_LABEL = "PDF, Word, Excel หรือรูปภาพ (JPG, PNG, WebP)";

export function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** แปลงจำนวนไบต์เป็นข้อความอ่านง่าย เช่น "2.4 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** ไอคอนสั้นๆ แทนชนิดไฟล์ ใช้แสดงในรายการไฟล์แนบ */
export function fileKindLabel(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("word")) return "Word";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "Excel";
  if (mimeType.startsWith("image/")) return "รูปภาพ";
  return "ไฟล์";
}

/**
 * ตรวจว่า URL ที่ส่งกลับมาหลังอัปโหลด เป็นของที่เก็บไฟล์ของเราจริง
 *
 * เบราว์เซอร์เป็นคนส่ง URL นี้กลับมาให้เซิร์ฟเวอร์บันทึก
 * ถ้าไม่ตรวจ จะมีคนส่ง URL ของเว็บอื่นเข้ามาแทน แล้วระบบจะพาผู้ใช้ไปโหลดไฟล์จากที่นั่น
 */
export function isBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}
