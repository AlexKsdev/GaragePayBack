import { Controller, Get, Param, Query } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { QueryWikiDto } from './dto/query-wiki.dto';
import { WikiArticleDetailDto, WikiCategoryDto } from './dto/wiki-response.dto';
import { WikiService } from './wiki.service';

/** Public throughout — the wiki is reference material for anyone. */
@Controller('wiki')
export class WikiController {
  constructor(private readonly wikiService: WikiService) {}

  @Get()
  findAll(@Query() query: QueryWikiDto): Promise<WikiCategoryDto[]> {
    return this.wikiService.findAll(query.locale ?? Locale.EN, query.q);
  }

  @Get(':slug')
  findOne(
    @Param('slug') slug: string,
    @Query() query: QueryWikiDto,
  ): Promise<WikiArticleDetailDto> {
    return this.wikiService.findOne(slug, query.locale ?? Locale.EN);
  }
}
