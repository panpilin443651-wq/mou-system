-- ความเห็นส่วนกลางแยกตามส่วนของตารางแผน (ใต้เป้าหมายตัวชี้วัด และใต้ค่าเกณฑ์แต่ละระดับ)
-- quarter 0 = ความเห็นต่อแผน · 1-4 = ความเห็นต่อผลของไตรมาสนั้น

CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewComment_indicatorId_quarter_section_key" ON "ReviewComment"("indicatorId", "quarter", "section");

ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ตารางใหม่ต้องปิด Data API ของ Supabase เหมือนตารางอื่น (ดู 20260930140000_lock_data_api)
ALTER TABLE "ReviewComment" ENABLE ROW LEVEL SECURITY;
