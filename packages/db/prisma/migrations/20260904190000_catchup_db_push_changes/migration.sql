-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'SECURITY';

-- DropForeignKey
ALTER TABLE "public"."ClassSubject" DROP CONSTRAINT "ClassSubject_teacherId_fkey";

-- DropIndex
DROP INDEX "public"."GradingScheme_schoolId_name_key";

-- AlterTable
ALTER TABLE "public"."Admin" ADD COLUMN     "staffNumber" TEXT;

-- AlterTable
ALTER TABLE "public"."ClassSubject" ALTER COLUMN "teacherId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."EducationalGame" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'classic';

-- AlterTable
ALTER TABLE "public"."GradingScheme" ADD COLUMN     "section" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "public"."LibraryBook" ADD COLUMN     "targetClassGroupIds" JSONB,
ADD COLUMN     "targetStudentIds" JSONB;

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "coversFrom" TIMESTAMP(3),
ADD COLUMN     "coversTo" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."SuperAdmin" ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "public"."AdmissionsQuestion" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "type" "public"."QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdmissionsQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdmissionsTest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "section" TEXT,
    "title" TEXT NOT NULL,
    "instruction" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "passMark" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionsTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdmissionsTestAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "scoreAwarded" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AdmissionsTestAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdmissionsTestAttempt" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "maxScore" INTEGER,
    "percentage" DOUBLE PRECISION,
    "isSubmitted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AdmissionsTestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameInvite" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "inviterStudentId" TEXT NOT NULL,
    "guestName" TEXT,
    "guestEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "startedAt" TIMESTAMP(3),
    "playedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameLiveParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GameLiveParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameLiveSession" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameLiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameQuestion" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GameQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GateLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkInMethod" TEXT,
    "checkInByUserId" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "checkOutMethod" TEXT,
    "checkOutByUserId" TEXT,
    "permittedExitAt" TIMESTAMP(3),
    "permittedExitReason" TEXT,
    "permittedExitByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "permittedReturnAt" TIMESTAMP(3),
    "permittedReturnByUserId" TEXT,

    CONSTRAINT "GateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ResultConfig" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "caCap" INTEGER NOT NULL DEFAULT 40,
    "examCap" INTEGER NOT NULL DEFAULT 60,
    "components" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ResultConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SubjectScore" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "caTotal" INTEGER NOT NULL DEFAULT 0,
    "examTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "enteredByTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VisitorLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "purpose" TEXT,
    "hostName" TEXT,
    "timeIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeOut" TIMESTAMP(3),
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hostUserId" TEXT,

    CONSTRAINT "VisitorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdmissionsQuestion_testId_idx" ON "public"."AdmissionsQuestion"("testId" ASC);

-- CreateIndex
CREATE INDEX "AdmissionsTest_schoolId_idx" ON "public"."AdmissionsTest"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "AdmissionsTestAnswer_attemptId_idx" ON "public"."AdmissionsTestAnswer"("attemptId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionsTestAnswer_attemptId_questionId_key" ON "public"."AdmissionsTestAnswer"("attemptId" ASC, "questionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionsTestAttempt_applicationId_key" ON "public"."AdmissionsTestAttempt"("applicationId" ASC);

-- CreateIndex
CREATE INDEX "AdmissionsTestAttempt_schoolId_idx" ON "public"."AdmissionsTestAttempt"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "AdmissionsTestAttempt_testId_idx" ON "public"."AdmissionsTestAttempt"("testId" ASC);

-- CreateIndex
CREATE INDEX "GameInvite_gameId_idx" ON "public"."GameInvite"("gameId" ASC);

-- CreateIndex
CREATE INDEX "GameInvite_guestEmail_idx" ON "public"."GameInvite"("guestEmail" ASC);

-- CreateIndex
CREATE INDEX "GameInvite_schoolId_idx" ON "public"."GameInvite"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "GameLiveParticipant_sessionId_idx" ON "public"."GameLiveParticipant"("sessionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GameLiveParticipant_sessionId_studentId_key" ON "public"."GameLiveParticipant"("sessionId" ASC, "studentId" ASC);

-- CreateIndex
CREATE INDEX "GameLiveSession_gameId_idx" ON "public"."GameLiveSession"("gameId" ASC);

-- CreateIndex
CREATE INDEX "GameLiveSession_schoolId_idx" ON "public"."GameLiveSession"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "GameQuestion_gameId_idx" ON "public"."GameQuestion"("gameId" ASC);

-- CreateIndex
CREATE INDEX "GateLog_schoolId_date_idx" ON "public"."GateLog"("schoolId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GateLog_studentId_date_key" ON "public"."GateLog"("studentId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "GateLog_studentId_idx" ON "public"."GateLog"("studentId" ASC);

-- CreateIndex
CREATE INDEX "ResultConfig_schoolId_idx" ON "public"."ResultConfig"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ResultConfig_schoolId_section_key" ON "public"."ResultConfig"("schoolId" ASC, "section" ASC);

-- CreateIndex
CREATE INDEX "SubjectScore_classSubjectId_idx" ON "public"."SubjectScore"("classSubjectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SubjectScore_classSubjectId_studentId_termId_key" ON "public"."SubjectScore"("classSubjectId" ASC, "studentId" ASC, "termId" ASC);

-- CreateIndex
CREATE INDEX "SubjectScore_schoolId_idx" ON "public"."SubjectScore"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "SubjectScore_studentId_idx" ON "public"."SubjectScore"("studentId" ASC);

-- CreateIndex
CREATE INDEX "VisitorLog_schoolId_timeIn_idx" ON "public"."VisitorLog"("schoolId" ASC, "timeIn" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GradingScheme_schoolId_section_name_key" ON "public"."GradingScheme"("schoolId" ASC, "section" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_email_key" ON "public"."SuperAdmin"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."AdmissionsQuestion" ADD CONSTRAINT "AdmissionsQuestion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "public"."AdmissionsTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdmissionsTestAnswer" ADD CONSTRAINT "AdmissionsTestAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."AdmissionsTestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdmissionsTestAnswer" ADD CONSTRAINT "AdmissionsTestAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."AdmissionsQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdmissionsTestAttempt" ADD CONSTRAINT "AdmissionsTestAttempt_testId_fkey" FOREIGN KEY ("testId") REFERENCES "public"."AdmissionsTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClassSubject" ADD CONSTRAINT "ClassSubject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameInvite" ADD CONSTRAINT "GameInvite_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."EducationalGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameLiveParticipant" ADD CONSTRAINT "GameLiveParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."GameLiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameLiveSession" ADD CONSTRAINT "GameLiveSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."EducationalGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameQuestion" ADD CONSTRAINT "GameQuestion_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."EducationalGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GateLog" ADD CONSTRAINT "GateLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ResultConfig" ADD CONSTRAINT "ResultConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolSection" ADD CONSTRAINT "SchoolSection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubjectScore" ADD CONSTRAINT "SubjectScore_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "public"."ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubjectScore" ADD CONSTRAINT "SubjectScore_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubjectScore" ADD CONSTRAINT "SubjectScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubjectScore" ADD CONSTRAINT "SubjectScore_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

