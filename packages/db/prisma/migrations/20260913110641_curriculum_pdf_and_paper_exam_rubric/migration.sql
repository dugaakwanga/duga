-- AlterTable
ALTER TABLE "PaperExamSubmission" ADD COLUMN     "aiBreakdown" JSONB,
ADD COLUMN     "paperExamId" TEXT;

-- AlterTable
ALTER TABLE "SchemeOfWork" ADD COLUMN     "fileUrl" TEXT;

-- CreateTable
CREATE TABLE "PaperExam" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "termId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "component" TEXT NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperExamQuestion" (
    "id" TEXT NOT NULL,
    "paperExamId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "question" TEXT NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "markingNotes" TEXT NOT NULL,

    CONSTRAINT "PaperExamQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaperExam_classSubjectId_idx" ON "PaperExam"("classSubjectId");

-- CreateIndex
CREATE INDEX "PaperExam_schoolId_idx" ON "PaperExam"("schoolId");

-- CreateIndex
CREATE INDEX "PaperExamQuestion_paperExamId_idx" ON "PaperExamQuestion"("paperExamId");

-- CreateIndex
CREATE INDEX "PaperExamSubmission_paperExamId_idx" ON "PaperExamSubmission"("paperExamId");

-- AddForeignKey
ALTER TABLE "PaperExam" ADD CONSTRAINT "PaperExam_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperExam" ADD CONSTRAINT "PaperExam_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperExamQuestion" ADD CONSTRAINT "PaperExamQuestion_paperExamId_fkey" FOREIGN KEY ("paperExamId") REFERENCES "PaperExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperExamSubmission" ADD CONSTRAINT "PaperExamSubmission_paperExamId_fkey" FOREIGN KEY ("paperExamId") REFERENCES "PaperExam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
