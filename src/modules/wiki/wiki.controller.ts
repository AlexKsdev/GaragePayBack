import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Locale } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { StepUpGuard } from '../../common/guards/step-up.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { QueryWikiDto } from './dto/query-wiki.dto';
import {
  AdminWikiArticleDto,
  AdminWikiCategoryDto,
  WikiArticleDetailDto,
  WikiCategoryDto,
} from './dto/wiki-response.dto';
import {
  CreateWikiArticleDto,
  CreateWikiCategoryDto,
  UpdateWikiArticleDto,
  UpdateWikiCategoryDto,
} from './dto/upsert-wiki.dto';
import { WikiService } from './wiki.service';

/** Reading is public — the wiki is reference material for anyone. */
@Controller('wiki')
export class WikiController {
  constructor(private readonly wikiService: WikiService) {}

  @Get()
  findAll(@Query() query: QueryWikiDto): Promise<WikiCategoryDto[]> {
    return this.wikiService.findAll(query.locale ?? Locale.EN, query.q);
  }

  /**
   * Every category and article, drafts included. Must stay above `@Get(':slug')`
   * — Nest matches in declaration order, or "manage" would be read as a slug.
   */
  @Get('manage')
  @UseGuards(JwtGuard, AdminGuard)
  findAllForAdmin(): Promise<AdminWikiCategoryDto[]> {
    return this.wikiService.findAllForAdmin();
  }

  @Get(':slug')
  findOne(
    @Param('slug') slug: string,
    @Query() query: QueryWikiDto,
  ): Promise<WikiArticleDetailDto> {
    return this.wikiService.findOne(slug, query.locale ?? Locale.EN);
  }

  /*
   * Categories are created and edited but never removed: articles reference
   * their category by RESTRICT, so a category holding anything cannot be
   * deleted, and an empty one costs nothing to leave in place.
   */
  @Post('categories')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  createCategory(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() dto: CreateWikiCategoryDto,
    @Ip() ip: string,
  ): Promise<AdminWikiCategoryDto> {
    return this.wikiService.createCategory(user.id, dto, ip);
  }

  @Patch('categories/:id')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  updateCategory(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() dto: UpdateWikiCategoryDto,
    @Ip() ip: string,
  ): Promise<AdminWikiCategoryDto> {
    return this.wikiService.updateCategory(user.id, id, dto, ip);
  }

  @Post('articles')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  createArticle(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() dto: CreateWikiArticleDto,
    @Ip() ip: string,
  ): Promise<AdminWikiArticleDto> {
    return this.wikiService.createArticle(user.id, dto, ip);
  }

  @Patch('articles/:id')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  updateArticle(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() dto: UpdateWikiArticleDto,
    @Ip() ip: string,
  ): Promise<AdminWikiArticleDto> {
    return this.wikiService.updateArticle(user.id, id, dto, ip);
  }

  @Post('articles/:id/publish')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  publishArticle(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<AdminWikiArticleDto> {
    return this.wikiService.setArticlePublished(user.id, id, true, ip);
  }

  /** Not a deletion: taking an article off the wiki is `published: false`. */
  @Delete('articles/:id')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  unpublishArticle(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<AdminWikiArticleDto> {
    return this.wikiService.setArticlePublished(user.id, id, false, ip);
  }
}
