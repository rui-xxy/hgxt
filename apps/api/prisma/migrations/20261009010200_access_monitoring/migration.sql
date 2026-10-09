-- AlterEnum
ALTER TYPE "RevokedReason" ADD VALUE 'FORCE_OFFLINE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" TEXT;

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "department" TEXT,
    "action" TEXT NOT NULL,
    "page" TEXT,
    "detail" TEXT,
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "client" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessEvent_createdAt_idx" ON "AccessEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AccessEvent_userId_createdAt_idx" ON "AccessEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessEvent_action_createdAt_idx" ON "AccessEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AccessEvent_page_createdAt_idx" ON "AccessEvent"("page", "createdAt");

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
