-- CreateEnum
CREATE TYPE "LedgerBookKind" AS ENUM ('CUSTOM', 'SYSTEM_FEES', 'SYSTEM_PAYROLL', 'SYSTEM_EXPENSE');

-- CreateEnum
CREATE TYPE "LedgerColumnKind" AS ENUM ('TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'SELECT');

-- CreateTable
CREATE TABLE "LedgerBook" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "LedgerBookKind" NOT NULL DEFAULT 'CUSTOM',
    "section" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerBookTab" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LedgerBookTab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerBookColumn" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "LedgerColumnKind" NOT NULL DEFAULT 'TEXT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "totals" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "optionsJson" JSONB,

    CONSTRAINT "LedgerBookColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerBookRow" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "valuesJson" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerBookRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerBook_schoolId_idx" ON "LedgerBook"("schoolId");

-- CreateIndex
CREATE INDEX "LedgerBookTab_bookId_idx" ON "LedgerBookTab"("bookId");

-- CreateIndex
CREATE INDEX "LedgerBookColumn_tabId_idx" ON "LedgerBookColumn"("tabId");

-- CreateIndex
CREATE INDEX "LedgerBookRow_tabId_idx" ON "LedgerBookRow"("tabId");

-- AddForeignKey
ALTER TABLE "LedgerBookTab" ADD CONSTRAINT "LedgerBookTab_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "LedgerBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerBookColumn" ADD CONSTRAINT "LedgerBookColumn_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "LedgerBookTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerBookColumn" ADD CONSTRAINT "LedgerBookColumn_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LedgerBookColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerBookRow" ADD CONSTRAINT "LedgerBookRow_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "LedgerBookTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
