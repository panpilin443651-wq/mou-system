-- ขั้นตอน "ยืนยันแผน" ของผู้รับผิดชอบส่วนงาน
-- ยืนยันแล้วแผนรายเดือน เป้าหมาย ค่าเป้าหมาย หน่วยนับ และขั้นตอนการดำเนินงานจะล็อก

ALTER TABLE "PlanHeader" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "PlanHeader" ADD COLUMN "confirmedById" TEXT;
