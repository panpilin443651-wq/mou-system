import { PrismaClient } from "@prisma/client";

// ----------------------------------------------------------------------------
// ตัวเชื่อมต่อฐานข้อมูล (ใช้ร่วมกันทั้งระบบ)
//
// ต่อ PostgreSQL ของ Supabase ผ่าน connection pooler (Supavisor พอร์ต 6543)
// ไม่ต่อตรงพอร์ต 5432 เพราะฟังก์ชันบน Vercel เกิดใหม่ตลอด
// ถ้าต่อตรง การเชื่อมต่อจะค้างสะสมจนฐานข้อมูลปฏิเสธ
//
// DATABASE_URL ต้องต่อท้ายด้วย ?pgbouncer=true เสมอ
// ไม่งั้น Prisma จะใช้ prepared statement ซึ่ง pooler แบบ transaction ไม่รองรับ
// แล้วจะเจอ error "prepared statement already exists" แบบสุ่มๆ
//
// หมายเหตุ: prisma migrate ใช้ DIRECT_URL (พอร์ต 5432) ถ้าเน็ตบล็อกพอร์ตนั้น
// ให้ใช้ Session pooler ของ Supabase (พอร์ต 5432 ผ่าน pooler) หรือรันบนเน็ตอื่น
//
// ----------------------------------------------------------------------------
// ทำไมต้องสร้างตัวเชื่อมต่อแบบ "รอจนกว่าจะใช้จริง"?
//
// ตอน build Next.js จะไล่โหลดไฟล์ของทุกหน้าเพื่อเก็บข้อมูล
// ถ้าอ่าน DATABASE_URL ตั้งแต่ตอนโหลดไฟล์ แล้วยังไม่ได้ตั้งค่าไว้
// การ build จะล้มทันทีด้วยข้อความ "Failed to collect page data"
// ทั้งที่ตอน build ไม่ได้ต้องใช้ฐานข้อมูลเลยสักนิด
//
// จึงเลื่อนไปสร้างตอนมีคนเรียกใช้จริง (ตอนมีคนเปิดเว็บ) ซึ่งตอนนั้น
// ค่าที่ตั้งไว้บน Vercel จะพร้อมแล้วเสมอ
// ----------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (client) return client;

  // ตอนพัฒนา Next.js โหลดไฟล์ใหม่ทุกครั้งที่แก้โค้ด ถ้าสร้างตัวใหม่ทุกครั้ง
  // จะเปิดการเชื่อมต่อค้างไว้เรื่อยๆ จนฐานข้อมูลปฏิเสธ จึงใช้ตัวเดิมซ้ำ
  if (globalForPrisma.prisma) {
    client = globalForPrisma.prisma;
    return client;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า DATABASE_URL — ถ้ารันบนเครื่องให้ใส่ในไฟล์ .env " +
        "ถ้าอยู่บน Vercel ให้ใส่ที่ Project Settings > Environment Variables"
    );
  }

  client = new PrismaClient({
    datasourceUrl: connectionString,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

/**
 * ใช้งานเหมือน PrismaClient ทุกอย่าง เช่น `db.user.findMany()`
 * ต่างกันแค่ตัวเชื่อมต่อจริงจะถูกสร้างตอนเรียกใช้ครั้งแรกเท่านั้น
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const instance = getClient();
    const value = Reflect.get(instance, property, receiver);
    // ผูก this กลับไปที่ตัวจริง ไม่งั้นเมธอดอย่าง $transaction จะหา this ไม่เจอ
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
