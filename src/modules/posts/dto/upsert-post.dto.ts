import { Locale } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { POST_TAG_ACCENTS } from '../../../config/blog.config';

export class PostTranslationDto {
  @IsEnum(Locale)
  locale: Locale;

  @IsString()
  @Length(1, 160)
  title: string;

  @IsString()
  @Length(1, 400)
  excerpt: string;

  /** The tag chip's wording — display text, so it lives with the translation. */
  @IsString()
  @Length(1, 40)
  tag: string;

  /** Markdown. Rendered with raw HTML disabled, so no sanitizing pass here. */
  @IsString()
  @Length(1, 40000)
  body: string;
}

export class CreatePostDto {
  /** The blog URL, so it is constrained to what belongs in one. */
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase words separated by single hyphens',
  })
  @Length(3, 120)
  slug: string;

  @IsUrl({ require_protocol: true })
  image: string;

  @IsIn(POST_TAG_ACCENTS as readonly string[])
  tagAccent: string;

  @IsString()
  @Length(1, 80)
  author: string;

  /**
   * At least one translation, or the post could exist with nothing to render.
   * `published` is deliberately absent: publishing is its own audited endpoint,
   * so a quiet field edit can never put an article on the site.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PostTranslationDto)
  translations: PostTranslationDto[];
}

/**
 * Spelled out rather than derived — @nestjs/mapped-types isn't a dependency
 * here. Translations sent are upserted by locale; ones left out are untouched,
 * so editing the English copy cannot wipe the Ukrainian one.
 */
export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase words separated by single hyphens',
  })
  @Length(3, 120)
  slug?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  image?: string;

  @IsOptional()
  @IsIn(POST_TAG_ACCENTS as readonly string[])
  tagAccent?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  author?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostTranslationDto)
  translations?: PostTranslationDto[];
}
