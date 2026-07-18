-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('TOTP', 'EMAIL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorMethod" "TwoFactorMethod" NOT NULL DEFAULT 'TOTP';
