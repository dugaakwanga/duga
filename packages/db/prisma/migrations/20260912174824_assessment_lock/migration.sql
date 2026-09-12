-- CreateTable
CREATE TABLE "AssessmentLock" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedByUserId" TEXT,

    CONSTRAINT "AssessmentLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentLock_schoolId_idx" ON "AssessmentLock"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentLock_classSubjectId_termId_component_key" ON "AssessmentLock"("classSubjectId", "termId", "component");

-- AddForeignKey
ALTER TABLE "AssessmentLock" ADD CONSTRAINT "AssessmentLock_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentLock" ADD CONSTRAINT "AssessmentLock_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
