-- เงื่อนไขย้ายจากรายระดับ (ScoreCriteria) มาเป็นของทั้งตัวชี้วัด
-- ตรวจแล้วว่ายังไม่มีข้อมูลในคอลัมน์เดิม (0 แถว) จึงลบคอลัมน์เดิมได้เลย

-- AlterTable
ALTER TABLE "Indicator" ADD COLUMN     "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ScoreCriteria" DROP COLUMN "conditions";
