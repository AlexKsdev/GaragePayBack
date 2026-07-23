import { QuestRewardType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { QUEST_ICONS } from '../../../config/quests.config';

export class CreateQuestDto {
  /** Stable id; also what the client localizes built-in quests by. */
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'key must be lowercase letters, digits or underscores',
  })
  @Length(2, 40)
  key: string;

  @IsString()
  @Length(1, 80)
  title: string;

  @IsInt()
  @Min(1)
  target: number;

  @IsEnum(QuestRewardType)
  rewardType: QuestRewardType;

  @IsInt()
  @Min(1)
  rewardAmount: number;

  @IsIn(QUEST_ICONS as readonly string[])
  icon: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color must be a #rrggbb hex value',
  })
  color: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * Spelled out rather than derived — @nestjs/mapped-types isn't a dependency
 * here. Every field is optional; `key` stays editable so a typo can be fixed.
 */
export class UpdateQuestDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'key must be lowercase letters, digits or underscores',
  })
  @Length(2, 40)
  key?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  target?: number;

  @IsOptional()
  @IsEnum(QuestRewardType)
  rewardType?: QuestRewardType;

  @IsOptional()
  @IsInt()
  @Min(1)
  rewardAmount?: number;

  @IsOptional()
  @IsIn(QUEST_ICONS as readonly string[])
  icon?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color must be a #rrggbb hex value',
  })
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
