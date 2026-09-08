-- CreateTable
CREATE TABLE "ReportCardConfig" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "showCognitive" BOOLEAN NOT NULL DEFAULT true,
    "showPsychomotor" BOOLEAN NOT NULL DEFAULT true,
    "showAffective" BOOLEAN NOT NULL DEFAULT true,
    "showAttendance" BOOLEAN NOT NULL DEFAULT true,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showWatermark" BOOLEAN NOT NULL DEFAULT false,
    "signatureLabels" JSONB NOT NULL DEFAULT '["Class Teacher", "Principal"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportCardConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportCardConfig_schoolId_idx" ON "ReportCardConfig"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCardConfig_schoolId_section_key" ON "ReportCardConfig"("schoolId", "section");

-- AddForeignKey
ALTER TABLE "ReportCardConfig" ADD CONSTRAINT "ReportCardConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
