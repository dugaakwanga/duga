-- Additional printable report-card assessments. Nullable fields keep all
-- historic report cards valid while schools progressively enter the data.
ALTER TABLE "ReportCard"
  ADD COLUMN "psychomotor" JSONB,
  ADD COLUMN "coCurricular" JSONB,
  ADD COLUMN "attendanceRemark" TEXT;
