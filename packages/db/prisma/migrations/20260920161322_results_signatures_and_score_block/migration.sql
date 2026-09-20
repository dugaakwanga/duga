-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "signatureUrl" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "scoreEntryBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scoreEntryBlockedReason" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "signatureUrl" TEXT;
