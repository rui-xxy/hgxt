-- AlterTable
ALTER TABLE "Form" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Form_code_key" ON "Form"("code");
