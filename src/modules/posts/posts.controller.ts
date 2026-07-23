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
import {
  AdminPostDto,
  PostDetailDto,
  PostListItemDto,
} from './dto/post-response.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { CreatePostDto, UpdatePostDto } from './dto/upsert-post.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  /** The blog. Public — anonymous visitors read it. */
  @Get()
  findAll(@Query() query: QueryPostsDto): Promise<PostListItemDto[]> {
    return this.postsService.findAll(query.locale ?? Locale.EN);
  }

  /**
   * Every post including drafts. Must stay above `@Get(':slug')` — Nest matches
   * in declaration order, or "manage" would be read as a slug.
   */
  @Get('manage')
  @UseGuards(JwtGuard, AdminGuard)
  findAllForAdmin(): Promise<AdminPostDto[]> {
    return this.postsService.findAllForAdmin();
  }

  @Get(':slug')
  findOne(
    @Param('slug') slug: string,
    @Query() query: QueryPostsDto,
  ): Promise<PostDetailDto> {
    return this.postsService.findOne(slug, query.locale ?? Locale.EN);
  }

  @Post()
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() dto: CreatePostDto,
    @Ip() ip: string,
  ): Promise<AdminPostDto> {
    return this.postsService.create(user.id, dto, ip);
  }

  @Patch(':id')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @Ip() ip: string,
  ): Promise<AdminPostDto> {
    return this.postsService.update(user.id, id, dto, ip);
  }

  @Post(':id/publish')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  publish(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<AdminPostDto> {
    return this.postsService.setPublished(user.id, id, true, ip);
  }

  /** Not a deletion: taking a post off the blog is `published: false`. */
  @Delete(':id')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  unpublish(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<AdminPostDto> {
    return this.postsService.setPublished(user.id, id, false, ip);
  }
}
