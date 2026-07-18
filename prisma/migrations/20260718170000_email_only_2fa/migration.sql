-- Email-only 2FA: authenticator (TOTP) is removed entirely.

-- Preserve the existing "2FA enabled" values by renaming rather than drop+add.
ALTER TABLE "User" RENAME COLUMN "totpEnabled" TO "twoFactorEnabled";

-- No authenticator secret and no method choice any more — email is the only channel.
ALTER TABLE "User" DROP COLUMN "totpSecret";
ALTER TABLE "User" DROP COLUMN "twoFactorMethod";

DROP TYPE "TwoFactorMethod";
