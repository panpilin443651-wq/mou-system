-- ส่วนกลางกำหนดวันเวลาเปิด-ปิดของไตรมาสเองได้
-- false (ค่าเริ่มต้น) = ใช้ 3 เดือนของไตรมาสเหมือนเดิม แถวเดิมทั้งหมดจึงทำงานเหมือนก่อน migration

ALTER TABLE "SubmissionWindow" ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false;
