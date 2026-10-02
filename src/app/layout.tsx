import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

// ฟอนต์ไทยที่อ่านง่ายบนหน้าจอ - Next.js จะดาวน์โหลดมาเก็บไว้ในโปรเจกต์ให้เอง
const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน",
  description: "ระบบรายงานและติดตามผลการดำเนินงานตามบันทึกข้อตกลงประเมินผลการดำเนินงาน",
  // รูปเล็กที่แสดงบนแท็บเบราว์เซอร์ ใช้ตราสัญลักษณ์เดียวกับในระบบ
  icons: { icon: "/logo-mark.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="th" ช่วยให้เบราว์เซอร์ตัดคำและแสดงฟอนต์ไทยได้ถูกต้อง
    // ใช้โหมดสว่างอย่างเดียว ไม่สลับตามการตั้งค่าเครื่องของผู้ใช้
    <html lang="th" data-theme="light">
      {/* antialiased ทำให้ตัวอักษรคมขึ้น */}
      <body className={`${notoSansThai.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
