-- CreateTable
CREATE TABLE "QuestClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestClaim_userId_questKey_day_key" ON "QuestClaim"("userId", "questKey", "day");

-- AddForeignKey
ALTER TABLE "QuestClaim" ADD CONSTRAINT "QuestClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
