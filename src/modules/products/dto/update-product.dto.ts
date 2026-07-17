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

/**
 * Every field optional; the rules mirror CreateProductDto. Written out rather
 * than derived — @nestjs/mapped-types isn't a dependency here, and UpdateUserDto
 * spells its fields out the same way.
 *
 * `active` is deliberately absent: removing a product from the shop goes through
 * DELETE (which deactivates), so that path is the one guarded and audited rather
 * than a quiet field edit.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case',
  })
  @MaxLength(60)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  emoji?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  rarity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  rarityRank?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

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
