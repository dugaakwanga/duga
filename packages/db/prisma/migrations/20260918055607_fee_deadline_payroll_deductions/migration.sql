/*
  Warnings:

  - You are about to drop the column `latePenalty` on the `StaffSalary` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "StaffSalary" DROP COLUMN "latePenalty";

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "feesDueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Term" ADD COLUMN     "feesDueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StaffDeduction" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffDeduction_schoolId_userId_month_idx" ON "StaffDeduction"("schoolId", "userId", "month");

-- AddForeignKey
ALTER TABLE "StaffDeduction" ADD CONSTRAINT "StaffDeduction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
