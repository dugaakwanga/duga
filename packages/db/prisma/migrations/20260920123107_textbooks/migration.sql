-- CreateTable
CREATE TABLE "Textbook" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "levelName" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Textbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextbookChunk" (
    "id" TEXT NOT NULL,
    "textbookId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "embedding" JSONB,

    CONSTRAINT "TextbookChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Textbook_schoolId_idx" ON "Textbook"("schoolId");

-- CreateIndex
CREATE INDEX "Textbook_subjectName_idx" ON "Textbook"("subjectName");

-- CreateIndex
CREATE INDEX "Textbook_levelName_idx" ON "Textbook"("levelName");

-- CreateIndex
CREATE INDEX "TextbookChunk_textbookId_idx" ON "TextbookChunk"("textbookId");

-- AddForeignKey
ALTER TABLE "TextbookChunk" ADD CONSTRAINT "TextbookChunk_textbookId_fkey" FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
