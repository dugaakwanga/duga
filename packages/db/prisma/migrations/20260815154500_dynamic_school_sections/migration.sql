ALTER TABLE "Student" ALTER COLUMN "section" TYPE TEXT USING "section"::text;
ALTER TABLE "ClassLevel" ALTER COLUMN "section" TYPE TEXT USING "section"::text;
ALTER TABLE "Subject" ALTER COLUMN "section" TYPE TEXT USING "section"::text;
ALTER TABLE "Announcement" ALTER COLUMN "targetSection" TYPE TEXT USING "targetSection"::text;
ALTER TABLE "FeeStructure" ALTER COLUMN "section" TYPE TEXT USING "section"::text;
ALTER TABLE "Application" ALTER COLUMN "section" TYPE TEXT USING "section"::text;
DROP TYPE "Section";

CREATE TABLE "SchoolSection" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolSection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolSection_schoolId_name_key" ON "SchoolSection"("schoolId", "name");
CREATE INDEX "SchoolSection_schoolId_idx" ON "SchoolSection"("schoolId");
INSERT INTO "SchoolSection" ("id", "schoolId", "name", "order")
SELECT CONCAT('section-', md5(CONCAT("schoolId", '-', "section"))), "schoolId", "section", CASE "section" WHEN 'PRIMARY' THEN 1 WHEN 'SECONDARY' THEN 2 ELSE 99 END
FROM (SELECT DISTINCT "schoolId", "section" FROM "ClassLevel") AS existing_sections
ON CONFLICT ("schoolId", "name") DO NOTHING;
