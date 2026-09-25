-- CreateEnum
CREATE TYPE "RevokedReason" AS ENUM ('ROTATED', 'LOGOUT', 'PASSWORD_RESET', 'USER_DISABLED', 'REUSE_DETECTED');

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "revokedReason" "RevokedReason";
