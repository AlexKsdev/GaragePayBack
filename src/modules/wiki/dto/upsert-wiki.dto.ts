import { Locale } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { WIKI_ACCENTS, WIKI_ICONS } from '../../../config/wiki.config';

const SLUG_RULE = {
  message: 'must be lowercase words separated by single hyphens',
};

export class WikiCategoryTranslationDto {
  @IsEnum(Locale)
  locale: Locale;

  @IsString()
  @Length(1, 80)
  title: string;
}

export class WikiArticleTranslationDto {
  @IsEnum(Locale)
  locale: Locale;

  @IsString()
  @Length(1, 160)
  title: string;

  @IsString()
  @Length(1, 300)
  summary: string;

  /** Markdown. Rendered with raw HTML disabled, so no sanitizing pass here. */
  @IsString()
  @Length(1, 40000)
  body: string;
}

export class CreateWikiCategoryDto {
  /** Stable id the category filter uses; not shown to readers. */
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, SLUG_RULE)
  @Length(2, 60)
  key: string;

  @IsIn(WIKI_ICONS as readonly string[])
  icon: string;

  @IsIn(WIKI_ACCENTS as readonly string[])
  accent: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** At least one, or the category could exist with no name to render. */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WikiCategoryTranslationDto)
  translations: WikiCategoryTranslationDto[];
}

/**
 * Spelled out rather than derived — @nestjs/mapped-types isn't a dependency
 * here. Translations sent are upserted by locale; ones left out are untouched.
 */
export class UpdateWikiCategoryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, SLUG_RULE)
  @Length(2, 60)
  key?: string;

  @IsOptional()
  @IsIn(WIKI_ICONS as readonly string[])
  icon?: string;

  @IsOptional()
  @IsIn(WIKI_ACCENTS as readonly string[])
  accent?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WikiCategoryTranslationDto)
  translations?: WikiCategoryTranslationDto[];
}

export class CreateWikiArticleDto {
  /** The wiki URL, so it is constrained to what belongs in one. */
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, SLUG_RULE)
  @Length(3, 120)
  slug: string;

  /** An article always belongs to a category — there is no loose article. */
  @IsString()
  categoryId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /**
   * `published` is deliberately absent: publishing is its own audited endpoint,
   * so a quiet field edit can never put an article on the site.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WikiArticleTranslationDto)
  translations: WikiArticleTranslationDto[];
}

export class UpdateWikiArticleDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, SLUG_RULE)
  @Length(3, 120)
  slug?: string;

  /** Moving an article between categories is a legitimate edit. */
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WikiArticleTranslationDto)
  translations?: WikiArticleTranslationDto[];
}
