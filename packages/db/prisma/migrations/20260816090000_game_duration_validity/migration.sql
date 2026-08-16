-- AlterTable
ALTER TABLE "EducationalGame" ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN "validDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "validUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EducationalGame_validUntil_idx" ON "EducationalGame"("validUntil");