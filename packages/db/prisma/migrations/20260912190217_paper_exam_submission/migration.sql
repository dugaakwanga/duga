-- CreateEnum
CREATE TYPE "PaperExamStatus" AS ENUM ('PENDING', 'AI_GRADED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PaperExamSubmission" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "termId" TEXT,
    "component" TEXT NOT NULL,
    "imageUrls" JSONB NOT NULL,
    "answerKey" TEXT,
    "maxScore" INTEGER NOT NULL,
    "aiScore" INTEGER,
    "aiFeedback" TEXT,
    "status" "PaperExamStatus" NOT NULL DEFAULT 'PENDING',
    "teacherScore" INTEGER,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperExamSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaperExamSubmission_schoolId_idx" ON "PaperExamSubmission"("schoolId");

-- CreateIndex
CREATE INDEX "PaperExamSubmission_studentId_idx" ON "PaperExamSubmission"("studentId");

-- CreateIndex
CREATE INDEX "PaperExamSubmission_classSubjectId_idx" ON "PaperExamSubmission"("classSubjectId");

-- AddForeignKey
ALTER TABLE "PaperExamSubmission" ADD CONSTRAINT "PaperExamSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperExamSubmission" ADD CONSTRAINT "PaperExamSubmission_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperExamSubmission" ADD CONSTRAINT "PaperExamSubmission_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;
