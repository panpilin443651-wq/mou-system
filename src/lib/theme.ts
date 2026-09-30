// ค่าที่ใช้ร่วมกันระหว่าง layout.tsx (ฝั่งเซิร์ฟเวอร์) กับปุ่มสลับธีม (ฝั่งเบราว์เซอร์)
// แยกไว้ไฟล์นี้เพราะค่าที่ export จากไฟล์ "use client" ใช้เป็นข้อความในฝั่งเซิร์ฟเวอร์ไม่ได้

/** ชื่อช่องใน localStorage ที่เก็บธีมที่ผู้ใช้เลือก ("light" / "dark" / ไม่มี = ตามเครื่อง) */
export const THEME_STORAGE_KEY = "theme";

/** สคริปต์ที่ใส่ใน <head> ตั้งธีมให้ถูกตั้งแต่ก่อนหน้าเว็บแสดงผล หน้าจึงไม่กระพริบ */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;
