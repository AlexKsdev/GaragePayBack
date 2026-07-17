import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  /** Part of the shop URL, so it is constrained to a kebab-case slug. */
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case',
  })
  @MaxLength(60)
  slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  category: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8)
  emoji: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  rarity: string;

  /** Common=1 … Legendary=5 — what the shop's rarity sort orders by. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  rarityRank: number;

  @IsEnum(Currency)
  currency: Currency;

  // Free items are legitimate; negative prices would pay the buyer.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  badge?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  stats?: string[];
}
