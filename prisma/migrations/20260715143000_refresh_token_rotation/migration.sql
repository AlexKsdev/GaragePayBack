-- Refresh tokens move from plaintext to sha256 hashes, and gain rotation state.
--
-- Existing rows hold plaintext tokens that cannot be carried over to the hashed
-- scheme, and `tokenHash` is NOT NULL with no default — the ALTER below would be
-- rejected outright on a non-empty table. They are therefore removed first.
-- Effect: every refresh token is destroyed and all users must log in again.
DELETE FROM "RefreshToken";

-- DropIndex
DROP INDEX "RefreshToken_token_key";

-- AlterTable
ALTER TABLE "RefreshToken" DROP COLUMN "token",
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "tokenHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
