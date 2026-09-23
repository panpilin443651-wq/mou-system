-- AlterTable
ALTER TABLE "ActionPlan" ADD COLUMN     "criteriaLevel" INTEGER;

-- CreateTable
CREATE TABLE "PlanLevelReport" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanLevelReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanAttachment" (
    "id" TEXT NOT NULL,
    "actionPlanId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanLevelReport_indicatorId_level_key" ON "PlanLevelReport"("indicatorId", "level");

-- CreateIndex
CREATE INDEX "PlanAttachment_actionPlanId_idx" ON "PlanAttachment"("actionPlanId");

-- AddForeignKey
ALTER TABLE "PlanLevelReport" ADD CONSTRAINT "PlanLevelReport_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAttachment" ADD CONSTRAINT "PlanAttachment_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "ActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAttachment" ADD CONSTRAINT "PlanAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
