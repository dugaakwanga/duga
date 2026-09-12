-- CreateTable
CREATE TABLE "SchemeOfWork" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemeOfWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchemeOfWorkChunk" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "levelName" TEXT,
    "subjectName" TEXT NOT NULL,
    "term" TEXT,
    "text" TEXT NOT NULL,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,

    CONSTRAINT "SchemeOfWorkChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchemeOfWork_schoolId_idx" ON "SchemeOfWork"("schoolId");

-- CreateIndex
CREATE INDEX "SchemeOfWorkChunk_schemeId_idx" ON "SchemeOfWorkChunk"("schemeId");

-- CreateIndex
CREATE INDEX "SchemeOfWorkChunk_levelName_idx" ON "SchemeOfWorkChunk"("levelName");

-- CreateIndex
CREATE INDEX "SchemeOfWorkChunk_subjectName_idx" ON "SchemeOfWorkChunk"("subjectName");

-- AddForeignKey
ALTER TABLE "SchemeOfWorkChunk" ADD CONSTRAINT "SchemeOfWorkChunk_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "SchemeOfWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
