ALTER TABLE "EnrollmentContent"
  ADD COLUMN "targetParentIds" JSONB NOT NULL DEFAULT '[]';
