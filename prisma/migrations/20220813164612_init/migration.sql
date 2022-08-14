-- CreateTable
CREATE TABLE "DesignerNewsStory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "message" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "shortUrl" TEXT NOT NULL,
    "shortDnUrl" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "telegramMessageId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BehanceProject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "shortUrl" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "telegramMessageId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DribbbleShot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "shortUrl" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "telegramMessageId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DesignerNewsStory_shortUrl_key" ON "DesignerNewsStory"("shortUrl");

-- CreateIndex
CREATE UNIQUE INDEX "DesignerNewsStory_shortDnUrl_key" ON "DesignerNewsStory"("shortDnUrl");

-- CreateIndex
CREATE UNIQUE INDEX "DesignerNewsStory_telegramMessageId_key" ON "DesignerNewsStory"("telegramMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "BehanceProject_shortUrl_key" ON "BehanceProject"("shortUrl");

-- CreateIndex
CREATE UNIQUE INDEX "BehanceProject_telegramMessageId_key" ON "BehanceProject"("telegramMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "DribbbleShot_shortUrl_key" ON "DribbbleShot"("shortUrl");

-- CreateIndex
CREATE UNIQUE INDEX "DribbbleShot_telegramMessageId_key" ON "DribbbleShot"("telegramMessageId");
