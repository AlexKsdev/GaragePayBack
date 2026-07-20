import { Locale } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';

export class QueryPostsDto {
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
}
