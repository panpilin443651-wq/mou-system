/*
  Warnings:

  - You are about to drop the column `progressReport` on the `QuarterlyReport` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "QuarterlyReport" DROP COLUMN "progressReport";

-- CreateTable
CREATE TABLE "CriteriaProgress" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriteriaProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CriteriaProgress_reportId_idx" ON "CriteriaProgress"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "CriteriaProgress_reportId_level_key" ON "CriteriaProgress"("reportId", "level");

-- AddForeignKey
ALTER TABLE "CriteriaProgress" ADD CONSTRAINT "CriteriaProgress_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "QuarterlyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
