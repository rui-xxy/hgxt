-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 1;

-- E2: username / email 统一小写存储（幂等：已是小写的行不受影响；
-- 若小写化后与既有行冲突，迁移会失败以暴露数据问题）
UPDATE "User" SET "username" = lower("username") WHERE "username" <> lower("username");
UPDATE "User" SET "email" = lower("email") WHERE "email" IS NOT NULL AND "email" <> lower("email");
