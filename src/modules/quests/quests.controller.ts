import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { StepUpGuard } from '../../common/guards/step-up.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import {
  AdminQuestDto,
  QuestClaimResponseDto,
  QuestListResponseDto,
} from './dto/quest-response.dto';
import { CreateQuestDto, UpdateQuestDto } from './dto/upsert-quest.dto';
import { QuestsService } from './quests.service';

@Controller('quests')
@UseGuards(JwtGuard)
export class QuestsController {
  constructor(private readonly questsService: QuestsService) {}

  /** Today's set for the signed-in player (active quests only). */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedRequest['user'],
  ): Promise<QuestListResponseDto> {
    return this.questsService.list(user.id);
  }

  /**
   * The whole catalogue, including inactive quests. Must stay above any
   * `:param` GET — Nest matches in declaration order.
   */
  @Get('manage')
  @UseGuards(AdminGuard)
  listAll(): Promise<AdminQuestDto[]> {
    return this.questsService.listAll();
  }

  @Post()
  @UseGuards(AdminGuard, StepUpGuard)
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() dto: CreateQuestDto,
    @Ip() ip: string,
  ): Promise<AdminQuestDto> {
    return this.questsService.create(dto, user.id, ip);
  }

  @Patch(':id')
  @UseGuards(AdminGuard, StepUpGuard)
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Body() dto: UpdateQuestDto,
    @Ip() ip: string,
  ): Promise<AdminQuestDto> {
    return this.questsService.update(id, dto, user.id, ip);
  }

  @Post(':id/activate')
  @UseGuards(AdminGuard, StepUpGuard)
  activate(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<AdminQuestDto> {
    return this.questsService.setActive(id, true, user.id, ip);
  }

  /** Not a deletion: claims reference a quest by key and must keep meaning. */
  @Delete(':id')
  @UseGuards(AdminGuard, StepUpGuard)
  deactivate(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<AdminQuestDto> {
    return this.questsService.setActive(id, false, user.id, ip);
  }

  @Post(':key/claim')
  claim(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('key') key: string,
  ): Promise<QuestClaimResponseDto> {
    return this.questsService.claim(user.id, key);
  }
}
