-- CreateEnum
CREATE TYPE "FeeApplicability" AS ENUM ('ALL', 'BOARDING', 'DAY');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'CARRIED_FORWARD';

-- AlterTable
ALTER TABLE "FeeStructure" ADD COLUMN     "appliesTo" "FeeApplicability" NOT NULL DEFAULT 'ALL';
