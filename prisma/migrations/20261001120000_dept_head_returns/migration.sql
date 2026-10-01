-- หัวหน้าส่วนงาน/หัวหน้าหน่วยงานที่ไม่สังกัดส่วนงาน เป็นผู้กดส่งแผนและส่งผล
-- ส่วนกลางตีกลับแผน/ผลพร้อมเหตุผล แล้วแจ้งเตือนหัวหน้าส่วนงานผ่านกระดิ่ง

ALTER TYPE "Role" ADD VALUE 'DEPT_HEAD';

ALTER TABLE "PlanHeader" ADD COLUMN "returnedAt" TIMESTAMP(3);
ALTER TABLE "PlanHeader" ADD COLUMN "returnNote" TEXT;

ALTER TABLE "QuarterlyReport" ADD COLUMN "returnedAt" TIMESTAMP(3);
ALTER TABLE "QuarterlyReport" ADD COLUMN "returnNote" TEXT;

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ตารางใหม่ต้องปิด Data API ของ Supabase เหมือนตารางอื่น (ดู 20260930140000_lock_data_api)
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
