-- สายบังคับบัญชา: ย้ายจากไฟล์คะแนน (ปี 2569) มาเก็บในฐานข้อมูล ให้ส่วนกลางแก้ไขได้เอง
-- ข้อมูลตั้งต้นคัดจาก prisma/department-scores.json ซึ่งนำเข้าจาก "คะแนนจัดลำดับ MOU 69.xlsx"

-- CreateTable
CREATE TABLE "CommandLine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommandLine_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "commandLineId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CommandLine_name_key" ON "CommandLine"("name");

-- CreateIndex
CREATE INDEX "CommandLine_sortOrder_idx" ON "CommandLine"("sortOrder");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_commandLineId_fkey" FOREIGN KEY ("commandLineId") REFERENCES "CommandLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ข้อมูลตั้งต้น
INSERT INTO "CommandLine" ("id", "name", "sortOrder", "updatedAt") VALUES ('cmdline_1', 'ผวก.กยท.', 1, CURRENT_TIMESTAMP);
INSERT INTO "CommandLine" ("id", "name", "sortOrder", "updatedAt") VALUES ('cmdline_2', 'รองผวก. (ป.)', 2, CURRENT_TIMESTAMP);
INSERT INTO "CommandLine" ("id", "name", "sortOrder", "updatedAt") VALUES ('cmdline_3', 'รองผวก. (บ.)', 3, CURRENT_TIMESTAMP);
INSERT INTO "CommandLine" ("id", "name", "sortOrder", "updatedAt") VALUES ('cmdline_4', 'รองผวก. (ธ.)', 4, CURRENT_TIMESTAMP);
UPDATE "Department" SET "commandLineId" = 'cmdline_2' WHERE "code" IN ('กจร.4', 'กจร.6', 'กยท.ข.กอ.', 'ฝพก.', 'กจร.5', 'กยท.ข.ตก.', 'กยท.ข.ตบ.', 'กยท.ข.อนล.', 'กยท.ข.ตล.', 'ฝสผ.', 'กยท.ข.น.', 'กยท.ข.อนบ.', 'ฝศย.');
UPDATE "Department" SET "commandLineId" = 'cmdline_3' WHERE "code" IN ('ฝกม.', 'ฝยศ.', 'ฝกค.', 'ฝทม.', 'สผว.', 'ฝบท.', 'สตส.', 'ฝทส.', 'หกป.');
UPDATE "Department" SET "commandLineId" = 'cmdline_4' WHERE "code" IN ('ฝอย.', 'สวย.', 'กจร.2', 'กจร.1', 'กจส.3', 'กจส.1', 'นธก.', 'กจส.2');
