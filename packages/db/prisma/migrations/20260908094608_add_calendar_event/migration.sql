-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('HOLIDAY', 'MIDTERM_BREAK', 'ASSESSMENT_WINDOW', 'GENERIC');

-- CreateEnum
CREATE TYPE "AssessmentTargetType" AS ENUM ('ASSIGNMENT', 'TEST', 'CBT', 'RESULTS');

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "termId" TEXT,
    "title" TEXT NOT NULL,
    "type" "CalendarEventType" NOT NULL DEFAULT 'GENERIC',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "appliesToSection" TEXT,
    "targetType" "AssessmentTargetType",
    "classSubjectId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_schoolId_startDate_endDate_idx" ON "CalendarEvent"("schoolId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "CalendarEvent_schoolId_type_idx" ON "CalendarEvent"("schoolId", "type");

-- CreateIndex
CREATE INDEX "CalendarEvent_classSubjectId_idx" ON "CalendarEvent"("classSubjectId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;
