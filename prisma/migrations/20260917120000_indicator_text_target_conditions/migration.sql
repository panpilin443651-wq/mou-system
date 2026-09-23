-- AlterTable
ALTER TABLE "Indicator" ADD COLUMN     "targetText" TEXT,
ALTER COLUMN "targetValue" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ScoreCriteria" ADD COLUMN     "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[];
