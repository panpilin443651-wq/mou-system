import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// ฟอนต์ไทยที่อ่านง่ายบนหน้าจอ - Next.js จะดาวน์โหลดมาเก็บไว้ในโปรเจกต์ให้เอง
const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ระบบรายงานผลการดำเนินงานตาม MOU",
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
    // suppressHydrationWarning: THEME_SCRIPT ตั้ง data-theme ก่อน React เริ่มทำงาน
    // ค่าจึงไม่ตรงกับที่เซิร์ฟเวอร์ส่งมา ซึ่งตั้งใจให้เป็นแบบนั้น
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* antialiased ทำให้ตัวอักษรคมขึ้น */}
      <body className={`${notoSansThai.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
