-- AlterTable
ALTER TABLE "ReportCard" ADD COLUMN     "daysPresent" INTEGER,
ADD COLUMN     "feesOwed" DECIMAL(65,30),
ADD COLUMN     "feesPayableBy" TIMESTAMP(3),
ADD COLUMN     "formMasterName" TEXT,
ADD COLUMN     "nextTermFees" DECIMAL(65,30),
ADD COLUMN     "principalComment" TEXT,
ADD COLUMN     "principalName" TEXT,
ADD COLUMN     "schoolDaysOpened" INTEGER,
ADD COLUMN     "studentAge" INTEGER;

-- AlterTable
ALTER TABLE "ReportCardConfig" ADD COLUMN     "motto" TEXT,
ADD COLUMN     "sectionLabel" TEXT,
ADD COLUMN     "showFees" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "town" TEXT;

-- AlterTable
ALTER TABLE "ReportCardItem" ADD COLUMN     "classAverage" DOUBLE PRECISION,
ADD COLUMN     "componentScores" JSONB;
