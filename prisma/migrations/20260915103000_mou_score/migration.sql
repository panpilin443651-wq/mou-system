-- CreateTable
CREATE TABLE "MouScore" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "plan" DOUBLE PRECISION,
    "actual" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MouScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MouScore_indicatorId_idx" ON "MouScore"("indicatorId");

-- CreateIndex
CREATE UNIQUE INDEX "MouScore_indicatorId_quarter_key" ON "MouScore"("indicatorId", "quarter");

-- AddForeignKey
ALTER TABLE "MouScore" ADD CONSTRAINT "MouScore_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouScore" ADD CONSTRAINT "MouScore_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
