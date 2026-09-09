-- CreateEnum
CREATE TYPE "FamilyContentCategory" AS ENUM ('RECIPES', 'PARENTING_TIPS', 'CHILD_HEALTH', 'STUDY_SUPPORT', 'FUN_ACTIVITIES');

-- CreateTable
CREATE TABLE "FamilyContent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "category" "FamilyContentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyContent_schoolId_category_idx" ON "FamilyContent"("schoolId", "category");

-- CreateIndex
CREATE INDEX "FamilyContent_schoolId_isPublished_idx" ON "FamilyContent"("schoolId", "isPublished");
