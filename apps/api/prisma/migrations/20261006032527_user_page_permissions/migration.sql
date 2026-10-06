-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pagePermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 已有普通用户此前可访问设备页，迁移后保留这项访问权；新用户默认无页面权限。
UPDATE "User" SET "pagePermissions" = ARRAY['maintenance']::TEXT[] WHERE "role" = 'USER';
