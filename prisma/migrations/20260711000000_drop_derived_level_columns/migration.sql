-- `level` and `xpNext` are now derived from `xp` (total lifetime XP) at read time,
-- so their columns are no longer stored. Dropping them removes duplicated state.
-- AlterTable
ALTER TABLE "User" DROP COLUMN "level",
DROP COLUMN "xpNext";
