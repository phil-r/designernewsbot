-- Nullable metadata only: existing rows are not populated or rewritten.
ALTER TABLE "BehanceProject" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "DribbbleShot" ADD COLUMN "imageUrl" TEXT;

-- Partial indexes keep legacy and non-gallery rows out of both pagination scans.
CREATE INDEX "BehanceProject_gallery_idx" ON "BehanceProject" ("createdAt" DESC, "id" DESC)
WHERE "imageUrl" IS NOT NULL AND "telegramMessageId" IS NOT NULL;
CREATE INDEX "DribbbleShot_gallery_idx" ON "DribbbleShot" ("createdAt" DESC, "id" DESC)
WHERE "imageUrl" IS NOT NULL AND "telegramMessageId" IS NOT NULL;
