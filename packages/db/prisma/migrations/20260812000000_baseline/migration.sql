-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AnnouncementAudience" AS ENUM ('EVERYONE', 'SECTION', 'LEVEL', 'CLASS', 'ROLE');

-- CreateEnum
CREATE TYPE "public"."ApplicationStatus" AS ENUM ('RECEIVED', 'REVIEWING', 'APPROVED', 'REJECTED', 'WAITLISTED');

-- CreateEnum
CREATE TYPE "public"."AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "public"."GuardianRelation" AS ENUM ('FATHER', 'MOTHER', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "public"."HostelAllocationStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "public"."IncidentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('DRAFT', 'UNPAID', 'PARTIAL', 'PAID', 'OVERPAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "public"."LiveClassStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."OverrideReason" AS ENUM ('SCHOLARSHIP', 'PAYMENT_PLAN', 'EXCEPTION', 'FREE');

-- CreateEnum
CREATE TYPE "public"."PaymentGateway" AS ENUM ('PAYSTACK', 'FLUTTERWAVE', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'USSD', 'TRANSFER', 'CASH');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."PlatformStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'SHUT_DOWN');

-- CreateEnum
CREATE TYPE "public"."QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('OWNER', 'ADMIN', 'TEACHER', 'PARENT', 'STUDENT');

-- CreateEnum
CREATE TYPE "public"."Section" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."StudentStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'WITHDRAWN', 'TRANSFERRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."SubscriptionPlan" AS ENUM ('FREE_TRIAL', 'BASIC', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."TermStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."TestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "public"."AcademicSession" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "public"."SessionStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Admin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "designation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Announcement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "public"."AnnouncementAudience" NOT NULL DEFAULT 'EVERYONE',
    "targetClassGroupId" TEXT,
    "targetLevelId" TEXT,
    "targetSection" "public"."Section",
    "targetRole" "public"."Role",
    "attachments" JSONB,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Application" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "applicantType" TEXT NOT NULL DEFAULT 'STUDENT',
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "section" "public"."Section" NOT NULL,
    "levelApplied" TEXT,
    "previousSchool" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "guardianRelation" "public"."GuardianRelation",
    "gender" "public"."Gender",
    "dateOfBirth" TIMESTAMP(3),
    "status" "public"."ApplicationStatus" NOT NULL DEFAULT 'RECEIVED',
    "notes" TEXT,
    "parentId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Assignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "termId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "attachments" JSONB,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "targetStudentIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssignmentSubmission" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT,
    "attachments" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER,
    "feedback" TEXT,
    "gradedAt" TIMESTAMP(3),
    "gradedByTeacherId" TEXT,

    CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookLoan" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'BORROWED',
    "note" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BusLocation" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CaScore" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT,
    "ca1" INTEGER,
    "ca2" INTEGER,
    "ca3" INTEGER,
    "test" INTEGER,
    "assignment" INTEGER,
    "total" INTEGER,
    "enteredByTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClassGroup" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "formTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClassLevel" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "section" "public"."Section" NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClassPeriod" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "ClassPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClassSubject" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "weeklyPeriods" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactMessage" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentProgress" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Conversation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DIRECT',
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Driver" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "licenseNumber" TEXT,
    "vehicleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EducationalGame" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'QUIZ',
    "gameUrl" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "targetClassGroupIds" JSONB NOT NULL,
    "targetStudentIds" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EducationalGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EnrollmentContent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'VIDEO',
    "url" TEXT,
    "body" TEXT,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "targetClassGroupIds" JSONB NOT NULL,
    "targetStudentIds" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExamScore" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT,
    "examScore" INTEGER,
    "total" INTEGER,
    "enteredByTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExamTimetableEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "termId" TEXT,
    "subjectId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "venue" TEXT,

    CONSTRAINT "ExamTimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeeOverride" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT,
    "reason" "public"."OverrideReason" NOT NULL DEFAULT 'EXCEPTION',
    "note" TEXT,
    "discountAmount" DECIMAL(65,30),
    "dueDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeeStructure" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "feeTypeId" TEXT NOT NULL,
    "termId" TEXT,
    "section" "public"."Section",
    "levelId" TEXT,
    "classGroupId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeeType" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FileUpload" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT,
    "size" INTEGER,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GalleryImage" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Students',
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameProgress" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "lastPlayedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GradingScheme" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "scale" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradingScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Hostel" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "public"."Gender",
    "capacity" INTEGER NOT NULL,
    "wardenUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hostel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HostelAllocation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "termId" TEXT,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedBy" TEXT,
    "status" "public"."HostelAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostelAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HostelBed" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bedNumber" TEXT NOT NULL,
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HostelBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HostelIncident" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "reportedByUserId" TEXT NOT NULL,
    "studentId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "actionTaken" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostelIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HostelRoom" (
    "id" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "floor" INTEGER,
    "capacity" INTEGER NOT NULL,
    "gender" "public"."Gender",

    CONSTRAINT "HostelRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balance" DECIMAL(65,30) NOT NULL,
    "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "dueDate" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discountAmount" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "feeTypeId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LessonNote" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "termId" TEXT,
    "week" INTEGER,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LibraryBook" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "shelfLocation" TEXT,
    "totalCopies" INTEGER NOT NULL DEFAULT 1,
    "availableCopies" INTEGER NOT NULL DEFAULT 1,
    "coverUrl" TEXT,
    "description" TEXT,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "coverKey" TEXT,
    "fileKey" TEXT,
    "fileMime" TEXT,
    "fileSize" INTEGER,
    "fileUrl" TEXT,

    CONSTRAINT "LibraryBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LiveClass" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classSubjectId" TEXT,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "provider" TEXT NOT NULL DEFAULT 'JITSI',
    "roomName" TEXT NOT NULL,
    "joinLink" TEXT NOT NULL,
    "status" "public"."LiveClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attendanceLogged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LiveClassAttendance" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "isPresent" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'auto',

    CONSTRAINT "LiveClassAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "replyToMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NewsPost" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Announcement',
    "excerpt" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "coverUrl" TEXT,
    "authorId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBSCRIBED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NightAttendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "public"."AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "remark" TEXT,
    "checkedByUserId" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NightAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "channel" "public"."NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Parent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "occupation" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "termId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "method" "public"."PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "gateway" "public"."PaymentGateway" NOT NULL DEFAULT 'PAYSTACK',
    "gatewayRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "receiptNumber" TEXT,
    "recordedByUserId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlacementHistory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromClassGroupId" TEXT,
    "toClassGroupId" TEXT NOT NULL,
    "sessionId" TEXT,
    "reason" TEXT,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacementHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PtaContribution" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PtaContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PtaExecutive" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PtaExecutive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PtaMeeting" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "agenda" TEXT,
    "minutes" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PtaMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReportCard" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "sessionId" TEXT,
    "classGroupId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "total" INTEGER,
    "average" DOUBLE PRECISION,
    "position" INTEGER,
    "classSize" INTEGER,
    "subjectCount" INTEGER,
    "remark" TEXT,
    "isPaidGated" BOOLEAN NOT NULL DEFAULT true,
    "feeOverrideApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReportCardItem" (
    "id" TEXT NOT NULL,
    "reportCardId" TEXT NOT NULL,
    "classSubjectId" TEXT,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "ca" INTEGER,
    "exam" INTEGER,
    "total" INTEGER,
    "grade" TEXT,
    "remark" TEXT,
    "position" INTEGER,

    CONSTRAINT "ReportCardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "platformStatus" "public"."PlatformStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolSetting" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffAttendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInDistanceM" DOUBLE PRECISION,
    "checkInWithinRadius" BOOLEAN NOT NULL DEFAULT false,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutDistanceM" DOUBLE PRECISION,
    "checkOutWithinRadius" BOOLEAN NOT NULL DEFAULT false,
    "locationLabel" TEXT,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "section" "public"."Section" NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "public"."Gender",
    "photoUrl" TEXT,
    "isBoarding" BOOLEAN NOT NULL DEFAULT false,
    "enrollmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentClassGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "feeAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "feeDays" INTEGER NOT NULL DEFAULT 0,
    "feePaidThrough" TIMESTAMP(3),

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudentAttendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "termId" TEXT,
    "classGroupId" TEXT,
    "subjectId" TEXT,
    "studentId" TEXT NOT NULL,
    "status" "public"."AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "remark" TEXT,
    "takenByTeacherId" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudentParent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relation" "public"."GuardianRelation" NOT NULL DEFAULT 'GUARDIAN',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentParent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subject" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "section" "public"."Section" NOT NULL,
    "levelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "plan" "public"."SubscriptionPlan" NOT NULL DEFAULT 'FREE_TRIAL',
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "price" DECIMAL(65,30),
    "seats" INTEGER,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SuperAdmin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SuperAdminActivity" (
    "id" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Teacher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffNumber" TEXT NOT NULL,
    "specialty" TEXT,
    "designation" TEXT,
    "hireDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Term" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "termNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "public"."TermStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Test" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "termId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instruction" TEXT,
    "passMark" DOUBLE PRECISION,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "public"."TestStatus" NOT NULL DEFAULT 'DRAFT',
    "isAutoGraded" BOOLEAN NOT NULL DEFAULT true,
    "isExam" BOOLEAN NOT NULL DEFAULT false,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "showResults" BOOLEAN NOT NULL DEFAULT false,
    "targetStudentIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TestAttempt" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "maxScore" INTEGER,
    "percentage" DOUBLE PRECISION,
    "isGraded" BOOLEAN NOT NULL DEFAULT false,
    "isSubmitted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TestAttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "scoreAwarded" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TestAttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TestQuestion" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "type" "public"."QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TestQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TimetableEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "termId" TEXT,
    "classGroupId" TEXT NOT NULL,
    "classSubjectId" TEXT,
    "subjectId" TEXT,
    "teacherId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT,

    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TransportAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "stopId" TEXT,
    "termId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TransportRoute" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fee" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TransportStop" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,
    "pickupTime" TEXT,

    CONSTRAINT "TransportStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Vehicle" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "model" TEXT,
    "capacity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "routeId" TEXT,
    "gpsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicSession_schoolId_idx" ON "public"."AcademicSession"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicSession_schoolId_name_key" ON "public"."AcademicSession"("schoolId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "Admin_schoolId_idx" ON "public"."Admin"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_userId_key" ON "public"."Admin"("userId" ASC);

-- CreateIndex
CREATE INDEX "Announcement_schoolId_createdAt_idx" ON "public"."Announcement"("schoolId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "public"."AnnouncementRead"("announcementId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "AnnouncementRead_userId_idx" ON "public"."AnnouncementRead"("userId" ASC);

-- CreateIndex
CREATE INDEX "Application_email_idx" ON "public"."Application"("email" ASC);

-- CreateIndex
CREATE INDEX "Application_schoolId_status_idx" ON "public"."Application"("schoolId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Assignment_classSubjectId_idx" ON "public"."Assignment"("classSubjectId" ASC);

-- CreateIndex
CREATE INDEX "Assignment_schoolId_idx" ON "public"."Assignment"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "AssignmentSubmission_assignmentId_idx" ON "public"."AssignmentSubmission"("assignmentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmission_assignmentId_studentId_key" ON "public"."AssignmentSubmission"("assignmentId" ASC, "studentId" ASC);

-- CreateIndex
CREATE INDEX "AssignmentSubmission_schoolId_idx" ON "public"."AssignmentSubmission"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "AssignmentSubmission_studentId_idx" ON "public"."AssignmentSubmission"("studentId" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "public"."AuditLog"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_createdAt_idx" ON "public"."AuditLog"("schoolId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog"("userId" ASC);

-- CreateIndex
CREATE INDEX "BookLoan_bookId_idx" ON "public"."BookLoan"("bookId" ASC);

-- CreateIndex
CREATE INDEX "BookLoan_schoolId_status_idx" ON "public"."BookLoan"("schoolId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "BookLoan_studentId_idx" ON "public"."BookLoan"("studentId" ASC);

-- CreateIndex
CREATE INDEX "BusLocation_vehicleId_recordedAt_idx" ON "public"."BusLocation"("vehicleId" ASC, "recordedAt" ASC);

-- CreateIndex
CREATE INDEX "CaScore_classSubjectId_idx" ON "public"."CaScore"("classSubjectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CaScore_classSubjectId_studentId_termId_key" ON "public"."CaScore"("classSubjectId" ASC, "studentId" ASC, "termId" ASC);

-- CreateIndex
CREATE INDEX "CaScore_schoolId_idx" ON "public"."CaScore"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "CaScore_studentId_idx" ON "public"."CaScore"("studentId" ASC);

-- CreateIndex
CREATE INDEX "ClassGroup_schoolId_sessionId_idx" ON "public"."ClassGroup"("schoolId" ASC, "sessionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ClassGroup_schoolId_sessionId_levelId_name_key" ON "public"."ClassGroup"("schoolId" ASC, "sessionId" ASC, "levelId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "ClassLevel_schoolId_section_idx" ON "public"."ClassLevel"("schoolId" ASC, "section" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ClassLevel_schoolId_section_name_key" ON "public"."ClassLevel"("schoolId" ASC, "section" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ClassPeriod_schoolId_termId_dayOfWeek_periodNumber_key" ON "public"."ClassPeriod"("schoolId" ASC, "termId" ASC, "dayOfWeek" ASC, "periodNumber" ASC);

-- CreateIndex
CREATE INDEX "ClassPeriod_termId_idx" ON "public"."ClassPeriod"("termId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ClassSubject_classGroupId_subjectId_key" ON "public"."ClassSubject"("classGroupId" ASC, "subjectId" ASC);

-- CreateIndex
CREATE INDEX "ClassSubject_schoolId_idx" ON "public"."ClassSubject"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "ClassSubject_teacherId_idx" ON "public"."ClassSubject"("teacherId" ASC);

-- CreateIndex
CREATE INDEX "ContactMessage_schoolId_status_idx" ON "public"."ContactMessage"("schoolId" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ContentProgress_contentId_studentId_key" ON "public"."ContentProgress"("contentId" ASC, "studentId" ASC);

-- CreateIndex
CREATE INDEX "ContentProgress_schoolId_idx" ON "public"."ContentProgress"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "ContentProgress_studentId_idx" ON "public"."ContentProgress"("studentId" ASC);

-- CreateIndex
CREATE INDEX "Conversation_schoolId_idx" ON "public"."Conversation"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "public"."ConversationParticipant"("conversationId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "public"."ConversationParticipant"("userId" ASC);

-- CreateIndex
CREATE INDEX "Driver_schoolId_idx" ON "public"."Driver"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_vehicleId_key" ON "public"."Driver"("vehicleId" ASC);

-- CreateIndex
CREATE INDEX "EducationalGame_schoolId_idx" ON "public"."EducationalGame"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "EducationalGame_teacherId_idx" ON "public"."EducationalGame"("teacherId" ASC);

-- CreateIndex
CREATE INDEX "EnrollmentContent_schoolId_idx" ON "public"."EnrollmentContent"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "EnrollmentContent_teacherId_idx" ON "public"."EnrollmentContent"("teacherId" ASC);

-- CreateIndex
CREATE INDEX "ExamScore_classSubjectId_idx" ON "public"."ExamScore"("classSubjectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ExamScore_classSubjectId_studentId_termId_key" ON "public"."ExamScore"("classSubjectId" ASC, "studentId" ASC, "termId" ASC);

-- CreateIndex
CREATE INDEX "ExamScore_schoolId_idx" ON "public"."ExamScore"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "ExamScore_studentId_idx" ON "public"."ExamScore"("studentId" ASC);

-- CreateIndex
CREATE INDEX "ExamTimetableEntry_classGroupId_idx" ON "public"."ExamTimetableEntry"("classGroupId" ASC);

-- CreateIndex
CREATE INDEX "ExamTimetableEntry_schoolId_idx" ON "public"."ExamTimetableEntry"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "ExamTimetableEntry_subjectId_idx" ON "public"."ExamTimetableEntry"("subjectId" ASC);

-- CreateIndex
CREATE INDEX "FeeOverride_schoolId_idx" ON "public"."FeeOverride"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "FeeOverride_studentId_idx" ON "public"."FeeOverride"("studentId" ASC);

-- CreateIndex
CREATE INDEX "FeeStructure_classGroupId_idx" ON "public"."FeeStructure"("classGroupId" ASC);

-- CreateIndex
CREATE INDEX "FeeStructure_schoolId_idx" ON "public"."FeeStructure"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "FeeType_schoolId_idx" ON "public"."FeeType"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FeeType_schoolId_name_key" ON "public"."FeeType"("schoolId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "FileUpload_schoolId_idx" ON "public"."FileUpload"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "FileUpload_uploadedByUserId_idx" ON "public"."FileUpload"("uploadedByUserId" ASC);

-- CreateIndex
CREATE INDEX "GalleryImage_schoolId_idx" ON "public"."GalleryImage"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "GalleryImage_uploadedByUserId_idx" ON "public"."GalleryImage"("uploadedByUserId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GameProgress_gameId_studentId_key" ON "public"."GameProgress"("gameId" ASC, "studentId" ASC);

-- CreateIndex
CREATE INDEX "GameProgress_schoolId_idx" ON "public"."GameProgress"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "GameProgress_studentId_idx" ON "public"."GameProgress"("studentId" ASC);

-- CreateIndex
CREATE INDEX "GradingScheme_schoolId_idx" ON "public"."GradingScheme"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GradingScheme_schoolId_name_key" ON "public"."GradingScheme"("schoolId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "Hostel_schoolId_idx" ON "public"."Hostel"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "HostelAllocation_bedId_idx" ON "public"."HostelAllocation"("bedId" ASC);

-- CreateIndex
CREATE INDEX "HostelAllocation_schoolId_idx" ON "public"."HostelAllocation"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "HostelAllocation_studentId_idx" ON "public"."HostelAllocation"("studentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "HostelBed_roomId_bedNumber_key" ON "public"."HostelBed"("roomId" ASC, "bedNumber" ASC);

-- CreateIndex
CREATE INDEX "HostelBed_roomId_idx" ON "public"."HostelBed"("roomId" ASC);

-- CreateIndex
CREATE INDEX "HostelIncident_hostelId_idx" ON "public"."HostelIncident"("hostelId" ASC);

-- CreateIndex
CREATE INDEX "HostelIncident_schoolId_idx" ON "public"."HostelIncident"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "HostelRoom_hostelId_idx" ON "public"."HostelRoom"("hostelId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "HostelRoom_hostelId_roomNumber_key" ON "public"."HostelRoom"("hostelId" ASC, "roomNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "public"."Invoice"("invoiceNumber" ASC);

-- CreateIndex
CREATE INDEX "Invoice_schoolId_status_idx" ON "public"."Invoice"("schoolId" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_schoolId_studentId_termId_key" ON "public"."Invoice"("schoolId" ASC, "studentId" ASC, "termId" ASC);

-- CreateIndex
CREATE INDEX "Invoice_studentId_idx" ON "public"."Invoice"("studentId" ASC);

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "public"."InvoiceItem"("invoiceId" ASC);

-- CreateIndex
CREATE INDEX "LessonNote_classSubjectId_idx" ON "public"."LessonNote"("classSubjectId" ASC);

-- CreateIndex
CREATE INDEX "LessonNote_schoolId_idx" ON "public"."LessonNote"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "LessonNote_teacherId_idx" ON "public"."LessonNote"("teacherId" ASC);

-- CreateIndex
CREATE INDEX "LibraryBook_category_idx" ON "public"."LibraryBook"("category" ASC);

-- CreateIndex
CREATE INDEX "LibraryBook_schoolId_idx" ON "public"."LibraryBook"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "LiveClass_scheduledAt_idx" ON "public"."LiveClass"("scheduledAt" ASC);

-- CreateIndex
CREATE INDEX "LiveClass_schoolId_idx" ON "public"."LiveClass"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "LiveClass_teacherId_idx" ON "public"."LiveClass"("teacherId" ASC);

-- CreateIndex
CREATE INDEX "LiveClassAttendance_liveClassId_idx" ON "public"."LiveClassAttendance"("liveClassId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LiveClassAttendance_liveClassId_studentId_key" ON "public"."LiveClassAttendance"("liveClassId" ASC, "studentId" ASC);

-- CreateIndex
CREATE INDEX "LiveClassAttendance_studentId_idx" ON "public"."LiveClassAttendance"("studentId" ASC);

-- CreateIndex
CREATE INDEX "Message_conversationId_sentAt_idx" ON "public"."Message"("conversationId" ASC, "sentAt" ASC);

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "public"."Message"("senderId" ASC);

-- CreateIndex
CREATE INDEX "NewsPost_schoolId_isPublished_idx" ON "public"."NewsPost"("schoolId" ASC, "isPublished" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NewsPost_schoolId_slug_key" ON "public"."NewsPost"("schoolId" ASC, "slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_schoolId_email_key" ON "public"."NewsletterSubscriber"("schoolId" ASC, "email" ASC);

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_schoolId_status_idx" ON "public"."NewsletterSubscriber"("schoolId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "NightAttendance_hostelId_date_idx" ON "public"."NightAttendance"("hostelId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "NightAttendance_schoolId_idx" ON "public"."NightAttendance"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NightAttendance_studentId_date_hostelId_key" ON "public"."NightAttendance"("studentId" ASC, "date" ASC, "hostelId" ASC);

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "public"."Notification"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_schoolId_idx" ON "public"."Notification"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "public"."Notification"("userId" ASC, "isRead" ASC);

-- CreateIndex
CREATE INDEX "Parent_schoolId_idx" ON "public"."Parent"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Parent_userId_key" ON "public"."Parent"("userId" ASC);

-- CreateIndex
CREATE INDEX "Payment_reference_idx" ON "public"."Payment"("reference" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "public"."Payment"("reference" ASC);

-- CreateIndex
CREATE INDEX "Payment_schoolId_status_idx" ON "public"."Payment"("schoolId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Payment_studentId_idx" ON "public"."Payment"("studentId" ASC);

-- CreateIndex
CREATE INDEX "PlacementHistory_studentId_idx" ON "public"."PlacementHistory"("studentId" ASC);

-- CreateIndex
CREATE INDEX "PtaContribution_date_idx" ON "public"."PtaContribution"("date" ASC);

-- CreateIndex
CREATE INDEX "PtaContribution_schoolId_idx" ON "public"."PtaContribution"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "PtaExecutive_schoolId_idx" ON "public"."PtaExecutive"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "PtaMeeting_date_idx" ON "public"."PtaMeeting"("date" ASC);

-- CreateIndex
CREATE INDEX "PtaMeeting_schoolId_idx" ON "public"."PtaMeeting"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "ReportCard_schoolId_idx" ON "public"."ReportCard"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "ReportCard_studentId_idx" ON "public"."ReportCard"("studentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ReportCard_studentId_termId_key" ON "public"."ReportCard"("studentId" ASC, "termId" ASC);

-- CreateIndex
CREATE INDEX "ReportCard_termId_idx" ON "public"."ReportCard"("termId" ASC);

-- CreateIndex
CREATE INDEX "ReportCardItem_reportCardId_idx" ON "public"."ReportCardItem"("reportCardId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ReportCardItem_reportCardId_subjectId_key" ON "public"."ReportCardItem"("reportCardId" ASC, "subjectId" ASC);

-- CreateIndex
CREATE INDEX "School_domain_idx" ON "public"."School"("domain" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "School_domain_key" ON "public"."School"("domain" ASC);

-- CreateIndex
CREATE INDEX "SchoolSetting_schoolId_idx" ON "public"."SchoolSetting"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSetting_schoolId_key_key" ON "public"."SchoolSetting"("schoolId" ASC, "key" ASC);

-- CreateIndex
CREATE INDEX "StaffAttendance_schoolId_date_idx" ON "public"."StaffAttendance"("schoolId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StaffAttendance_userId_date_key" ON "public"."StaffAttendance"("userId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "StaffAttendance_userId_idx" ON "public"."StaffAttendance"("userId" ASC);

-- CreateIndex
CREATE INDEX "Student_currentClassGroupId_idx" ON "public"."Student"("currentClassGroupId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_admissionNumber_key" ON "public"."Student"("schoolId" ASC, "admissionNumber" ASC);

-- CreateIndex
CREATE INDEX "Student_schoolId_idx" ON "public"."Student"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "public"."Student"("userId" ASC);

-- CreateIndex
CREATE INDEX "StudentAttendance_classGroupId_date_idx" ON "public"."StudentAttendance"("classGroupId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "StudentAttendance_schoolId_date_idx" ON "public"."StudentAttendance"("schoolId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StudentAttendance_studentId_date_classGroupId_key" ON "public"."StudentAttendance"("studentId" ASC, "date" ASC, "classGroupId" ASC);

-- CreateIndex
CREATE INDEX "StudentAttendance_studentId_idx" ON "public"."StudentAttendance"("studentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StudentParent_parentId_studentId_key" ON "public"."StudentParent"("parentId" ASC, "studentId" ASC);

-- CreateIndex
CREATE INDEX "StudentParent_schoolId_idx" ON "public"."StudentParent"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "StudentParent_studentId_idx" ON "public"."StudentParent"("studentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Subject_schoolId_name_section_key" ON "public"."Subject"("schoolId" ASC, "name" ASC, "section" ASC);

-- CreateIndex
CREATE INDEX "Subject_schoolId_section_idx" ON "public"."Subject"("schoolId" ASC, "section" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_schoolId_key" ON "public"."Subscription"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_username_key" ON "public"."SuperAdmin"("username" ASC);

-- CreateIndex
CREATE INDEX "SuperAdminActivity_superAdminId_createdAt_idx" ON "public"."SuperAdminActivity"("superAdminId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "SystemLog_level_createdAt_idx" ON "public"."SystemLog"("level" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "SystemLog_schoolId_createdAt_idx" ON "public"."SystemLog"("schoolId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Teacher_schoolId_idx" ON "public"."Teacher"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_schoolId_staffNumber_key" ON "public"."Teacher"("schoolId" ASC, "staffNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_userId_key" ON "public"."Teacher"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Term_schoolId_sessionId_termNumber_key" ON "public"."Term"("schoolId" ASC, "sessionId" ASC, "termNumber" ASC);

-- CreateIndex
CREATE INDEX "Term_sessionId_idx" ON "public"."Term"("sessionId" ASC);

-- CreateIndex
CREATE INDEX "Test_classSubjectId_idx" ON "public"."Test"("classSubjectId" ASC);

-- CreateIndex
CREATE INDEX "Test_schoolId_idx" ON "public"."Test"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "TestAttempt_schoolId_idx" ON "public"."TestAttempt"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "TestAttempt_studentId_idx" ON "public"."TestAttempt"("studentId" ASC);

-- CreateIndex
CREATE INDEX "TestAttempt_testId_idx" ON "public"."TestAttempt"("testId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TestAttempt_testId_studentId_key" ON "public"."TestAttempt"("testId" ASC, "studentId" ASC);

-- CreateIndex
CREATE INDEX "TestAttemptAnswer_attemptId_idx" ON "public"."TestAttemptAnswer"("attemptId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TestAttemptAnswer_attemptId_questionId_key" ON "public"."TestAttemptAnswer"("attemptId" ASC, "questionId" ASC);

-- CreateIndex
CREATE INDEX "TestQuestion_testId_idx" ON "public"."TestQuestion"("testId" ASC);

-- CreateIndex
CREATE INDEX "TimetableEntry_classGroupId_idx" ON "public"."TimetableEntry"("classGroupId" ASC);

-- CreateIndex
CREATE INDEX "TimetableEntry_schoolId_idx" ON "public"."TimetableEntry"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "TimetableEntry_teacherId_idx" ON "public"."TimetableEntry"("teacherId" ASC);

-- CreateIndex
CREATE INDEX "TransportAssignment_routeId_idx" ON "public"."TransportAssignment"("routeId" ASC);

-- CreateIndex
CREATE INDEX "TransportAssignment_schoolId_idx" ON "public"."TransportAssignment"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "TransportAssignment_studentId_idx" ON "public"."TransportAssignment"("studentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TransportAssignment_studentId_status_key" ON "public"."TransportAssignment"("studentId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "TransportRoute_schoolId_idx" ON "public"."TransportRoute"("schoolId" ASC);

-- CreateIndex
CREATE INDEX "TransportStop_routeId_idx" ON "public"."TransportStop"("routeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_schoolId_email_key" ON "public"."User"("schoolId" ASC, "email" ASC);

-- CreateIndex
CREATE INDEX "User_schoolId_role_idx" ON "public"."User"("schoolId" ASC, "role" ASC);

-- CreateIndex
CREATE INDEX "User_schoolId_status_idx" ON "public"."User"("schoolId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Vehicle_schoolId_idx" ON "public"."Vehicle"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_schoolId_plateNumber_key" ON "public"."Vehicle"("schoolId" ASC, "plateNumber" ASC);

-- AddForeignKey
ALTER TABLE "public"."Admin" ADD CONSTRAINT "Admin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Announcement" ADD CONSTRAINT "Announcement_targetClassGroupId_fkey" FOREIGN KEY ("targetClassGroupId") REFERENCES "public"."ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Announcement" ADD CONSTRAINT "Announcement_targetLevelId_fkey" FOREIGN KEY ("targetLevelId") REFERENCES "public"."ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "public"."Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Application" ADD CONSTRAINT "Application_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "public"."ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookLoan" ADD CONSTRAINT "BookLoan_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "public"."LibraryBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookLoan" ADD CONSTRAINT "BookLoan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusLocation" ADD CONSTRAINT "BusLocation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "public"."Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaScore" ADD CONSTRAINT "CaScore_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "public"."ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaScore" ADD CONSTRAINT "CaScore_enteredByTeacherId_fkey" FOREIGN KEY ("enteredByTeacherId") REFERENCES "public"."Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaScore" ADD CONSTRAINT "CaScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaScore" ADD CONSTRAINT "CaScore_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClassGroup" ADD CONSTRAINT "ClassGroup_formTeacherId_fkey" FOREIGN KEY ("formTeacherId") REFERENCES "public"."Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClassGroup" ADD CONSTRAINT "ClassGroup_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "public"."ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClassGroup" ADD CONSTRAINT "ClassGroup_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClassPeriod" ADD CONSTRAINT "ClassPeriod_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClassSubject" ADD CONSTRAINT "ClassSubject_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "public"."ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClassSubject" ADD CONSTRAINT "ClassSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public"."Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClassSubject" ADD CONSTRAINT "ClassSubject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentProgress" ADD CONSTRAINT "ContentProgress_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "public"."EnrollmentContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentProgress" ADD CONSTRAINT "ContentProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Driver" ADD CONSTRAINT "Driver_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "public"."Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EducationalGame" ADD CONSTRAINT "EducationalGame_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EnrollmentContent" ADD CONSTRAINT "EnrollmentContent_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamScore" ADD CONSTRAINT "ExamScore_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "public"."ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamScore" ADD CONSTRAINT "ExamScore_enteredByTeacherId_fkey" FOREIGN KEY ("enteredByTeacherId") REFERENCES "public"."Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamScore" ADD CONSTRAINT "ExamScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamScore" ADD CONSTRAINT "ExamScore_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamTimetableEntry" ADD CONSTRAINT "ExamTimetableEntry_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "public"."ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamTimetableEntry" ADD CONSTRAINT "ExamTimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public"."Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamTimetableEntry" ADD CONSTRAINT "ExamTimetableEntry_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeeOverride" ADD CONSTRAINT "FeeOverride_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeeOverride" ADD CONSTRAINT "FeeOverride_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeeOverride" ADD CONSTRAINT "FeeOverride_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeeStructure" ADD CONSTRAINT "FeeStructure_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "public"."ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeeStructure" ADD CONSTRAINT "FeeStructure_feeTypeId_fkey" FOREIGN KEY ("feeTypeId") REFERENCES "public"."FeeType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeeStructure" ADD CONSTRAINT "FeeStructure_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "public"."ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeeStructure" ADD CONSTRAINT "FeeStructure_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameProgress" ADD CONSTRAINT "GameProgress_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."EducationalGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameProgress" ADD CONSTRAINT "GameProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HostelAllocation" ADD CONSTRAINT "HostelAllocation_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "public"."HostelBed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HostelAllocation" ADD CONSTRAINT "HostelAllocation_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "public"."Hostel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HostelAllocation" ADD CONSTRAINT "HostelAllocation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."HostelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HostelAllocation" ADD CONSTRAINT "HostelAllocation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HostelAllocation" ADD CONSTRAINT "HostelAllocation_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HostelBed" ADD CONSTRAINT "HostelBed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."HostelRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HostelIncident" ADD CONSTRAINT "HostelIncident_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "public"."Hostel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HostelIncident" ADD CONSTRAINT "HostelIncident_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HostelRoom" ADD CONSTRAINT "HostelRoom_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "public"."Hostel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceItem" ADD CONSTRAINT "InvoiceItem_feeTypeId_fkey" FOREIGN KEY ("feeTypeId") REFERENCES "public"."FeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LessonNote" ADD CONSTRAINT "LessonNote_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "public"."ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LessonNote" ADD CONSTRAINT "LessonNote_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LessonNote" ADD CONSTRAINT "LessonNote_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LiveClass" ADD CONSTRAINT "LiveClass_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "public"."ClassSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LiveClass" ADD CONSTRAINT "LiveClass_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LiveClass" ADD CONSTRAINT "LiveClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LiveClassAttendance" ADD CONSTRAINT "LiveClassAttendance_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "public"."LiveClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LiveClassAttendance" ADD CONSTRAINT "LiveClassAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NewsPost" ADD CONSTRAINT "NewsPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NightAttendance" ADD CONSTRAINT "NightAttendance_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "public"."Hostel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NightAttendance" ADD CONSTRAINT "NightAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Parent" ADD CONSTRAINT "Parent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlacementHistory" ADD CONSTRAINT "PlacementHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PtaContribution" ADD CONSTRAINT "PtaContribution_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PtaMeeting" ADD CONSTRAINT "PtaMeeting_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCard" ADD CONSTRAINT "ReportCard_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "public"."ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCard" ADD CONSTRAINT "ReportCard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."AcademicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCard" ADD CONSTRAINT "ReportCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCard" ADD CONSTRAINT "ReportCard_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCardItem" ADD CONSTRAINT "ReportCardItem_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "public"."ClassSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCardItem" ADD CONSTRAINT "ReportCardItem_reportCardId_fkey" FOREIGN KEY ("reportCardId") REFERENCES "public"."ReportCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCardItem" ADD CONSTRAINT "ReportCardItem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public"."Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolSetting" ADD CONSTRAINT "SchoolSetting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffAttendance" ADD CONSTRAINT "StaffAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Student" ADD CONSTRAINT "Student_currentClassGroupId_fkey" FOREIGN KEY ("currentClassGroupId") REFERENCES "public"."ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentAttendance" ADD CONSTRAINT "StudentAttendance_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "public"."ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentAttendance" ADD CONSTRAINT "StudentAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentAttendance" ADD CONSTRAINT "StudentAttendance_takenByTeacherId_fkey" FOREIGN KEY ("takenByTeacherId") REFERENCES "public"."Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentAttendance" ADD CONSTRAINT "StudentAttendance_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentParent" ADD CONSTRAINT "StudentParent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentParent" ADD CONSTRAINT "StudentParent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subject" ADD CONSTRAINT "Subject_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "public"."ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SuperAdminActivity" ADD CONSTRAINT "SuperAdminActivity_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "public"."SuperAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemLog" ADD CONSTRAINT "SystemLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Term" ADD CONSTRAINT "Term_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Test" ADD CONSTRAINT "Test_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "public"."ClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Test" ADD CONSTRAINT "Test_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Test" ADD CONSTRAINT "Test_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Test" ADD CONSTRAINT "Test_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TestAttempt" ADD CONSTRAINT "TestAttempt_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "public"."ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TestAttempt" ADD CONSTRAINT "TestAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TestAttempt" ADD CONSTRAINT "TestAttempt_testId_fkey" FOREIGN KEY ("testId") REFERENCES "public"."Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TestAttemptAnswer" ADD CONSTRAINT "TestAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."TestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TestAttemptAnswer" ADD CONSTRAINT "TestAttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."TestQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TestQuestion" ADD CONSTRAINT "TestQuestion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "public"."Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimetableEntry" ADD CONSTRAINT "TimetableEntry_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "public"."ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimetableEntry" ADD CONSTRAINT "TimetableEntry_classSubjectId_fkey" FOREIGN KEY ("classSubjectId") REFERENCES "public"."ClassSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public"."Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimetableEntry" ADD CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimetableEntry" ADD CONSTRAINT "TimetableEntry_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransportAssignment" ADD CONSTRAINT "TransportAssignment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."TransportRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransportAssignment" ADD CONSTRAINT "TransportAssignment_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "public"."TransportStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransportAssignment" ADD CONSTRAINT "TransportAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransportAssignment" ADD CONSTRAINT "TransportAssignment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransportStop" ADD CONSTRAINT "TransportStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Vehicle" ADD CONSTRAINT "Vehicle_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."TransportRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
