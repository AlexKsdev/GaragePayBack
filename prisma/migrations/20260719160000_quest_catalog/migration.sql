-- Move the quest catalogue out of code and into the database.

-- CreateEnum
CREATE TYPE "QuestRewardType" AS ENUM ('COINS', 'GEMS');

-- AlterEnum (Neon runs PG18, so several values in one migration is fine)
ALTER TYPE "AdminActionType" ADD VALUE 'QUEST_CREATE';
ALTER TYPE "AdminActionType" ADD VALUE 'QUEST_UPDATE';
ALTER TYPE "AdminActionType" ADD VALUE 'QUEST_DEACTIVATE';

-- CreateTable
CREATE TABLE "Quest" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "rewardType" "QuestRewardType" NOT NULL DEFAULT 'COINS',
    "rewardAmount" INTEGER NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quest_key_key" ON "Quest"("key");

-- Seed the catalogue that used to live in config/quests.config.ts, so existing
-- players keep the same daily set and a fresh database is usable immediately.
INSERT INTO "Quest" ("id","key","title","target","rewardType","rewardAmount","icon","color","active","sortOrder","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'kill_players','Kill 10 players',10,'COINS',500,'Sword','#f87171',true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'mine_ores','Mine 200 ores',200,'COINS',300,'Pickaxe','#fbbf24',true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'trade_players','Trade with 3 players',3,'GEMS',5,'Users','#38bdf8',true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'login_streak','Log in 7 days',7,'GEMS',10,'Calendar','#a855f7',true,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'place_blocks','Place 500 blocks',500,'COINS',250,'Box','#34d399',true,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'craft_items','Craft 25 items',25,'COINS',200,'Hammer','#f59e0b',true,6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'travel_blocks','Travel 1000 blocks',1000,'COINS',150,'Footprints','#60a5fa',true,7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'fish_catch','Catch 15 fish',15,'COINS',180,'Fish','#22d3ee',true,8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'tame_animals','Tame 3 animals',3,'GEMS',4,'PawPrint','#fb923c',true,9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'brew_potions','Brew 5 potions',5,'GEMS',6,'FlaskConical','#c084fc',true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'enchant_gear','Enchant 4 items',4,'GEMS',8,'Sparkles','#e879f9',true,11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'defeat_boss','Defeat a boss',1,'GEMS',15,'Skull','#ef4444',true,12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'harvest_crops','Harvest 64 crops',64,'COINS',220,'Wheat','#eab308',true,13,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'complete_dungeon','Complete 2 dungeons',2,'GEMS',12,'DoorOpen','#94a3b8',true,14,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
