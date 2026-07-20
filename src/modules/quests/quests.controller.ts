import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import {
  QuestClaimResponseDto,
  QuestListResponseDto,
} from './dto/quest-response.dto';
import { QuestsService } from './quests.service';

@Controller('quests')
@UseGuards(JwtGuard)
export class QuestsController {
  constructor(private readonly questsService: QuestsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedRequest['user'],
  ): Promise<QuestListResponseDto> {
    return this.questsService.list(user.id);
  }

  @Post(':key/claim')
  claim(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('key') key: string,
  ): Promise<QuestClaimResponseDto> {
    return this.questsService.claim(user.id, key);
  }
}
