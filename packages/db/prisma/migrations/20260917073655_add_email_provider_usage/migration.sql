-- CreateTable
CREATE TABLE "EmailProviderUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EmailProviderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailProviderUsage_provider_day_key" ON "EmailProviderUsage"("provider", "day");
