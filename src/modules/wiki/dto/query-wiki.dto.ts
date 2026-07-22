import { Locale } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryWikiDto {
  /**
   * Which translation to render. Case-insensitive so the frontend can pass its
   * route locale (`uk`) straight through without mapping it to the enum first.
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : (value as unknown),
  )
  @IsEnum(Locale)
  locale?: Locale;

  /**
   * Free-text search across an article's title, summary and body. Capped
   * because it reaches the body — an unbounded term would be a pointless scan.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  q?: string;
}
