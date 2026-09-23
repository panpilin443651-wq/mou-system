# mou-system

ระบบติดตามผลการดำเนินงานตามบันทึกข้อตกลง (MOU) ของการยางแห่งประเทศไทย (กยท.)
ครอบคลุม 30 ส่วนงาน — จัดการตัวชี้วัด แผนดำเนินงาน รายงานผลรายไตรมาส และสรุปคะแนน

สร้างด้วย Next.js (App Router) + Prisma + PostgreSQL (Neon) ใช้งานบน Vercel

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env    # แล้วใส่ค่าจริง
npx prisma migrate deploy
npm run db:seed
npm run dev
```
