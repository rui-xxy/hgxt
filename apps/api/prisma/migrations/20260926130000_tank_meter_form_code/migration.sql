-- AlterTable
ALTER TABLE "Tank" ADD COLUMN "formCode" TEXT NOT NULL DEFAULT 'sulfuric_daily';
ALTER TABLE "Meter" ADD COLUMN "formCode" TEXT NOT NULL DEFAULT 'sulfuric_daily';
