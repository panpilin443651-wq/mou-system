-- ส่วนกลางกำหนดวันที่ต้องแก้ไขให้เสร็จ ตอนตีกลับแผน/ผล
-- เป็นช่องว่างได้ทั้งหมด แถวเดิมจึงไม่กระทบ (แสดงเหมือนเดิมคือไม่มีกำหนด)

ALTER TABLE "PlanHeader" ADD COLUMN "returnDueAt" TIMESTAMP(3);
ALTER TABLE "QuarterlyReport" ADD COLUMN "returnDueAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "dueAt" TIMESTAMP(3);
