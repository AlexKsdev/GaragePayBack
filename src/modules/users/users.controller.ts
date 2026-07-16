import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { GrantXpDto } from './dto/grant-xp.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AdminGuard)
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  @Get('me')
  findMe(
    @CurrentUser() user: AuthenticatedRequest['user'],
  ): Promise<UserResponseDto> {
    return this.usersService.findById(user.id, user.id);
  }

  @Post('me/xp')
  grantXp(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() dto: GrantXpDto,
  ): Promise<UserResponseDto> {
    return this.usersService.grantXp(user.id, dto.amount);
  }

  @Get(':id')
  findById(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ): Promise<UserResponseDto> {
    return this.usersService.findById(user.id, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Ip() ip: string,
  ): Promise<UserResponseDto> {
    return this.usersService.update(user.id, id, dto, ip);
  }

  // Irreversible, so a live session alone is not enough — the caller must have
  // re-proved a factor in the last few minutes. This applies to owners deleting
  // their own account too, which is the intent: account deletion should never
  // ride on an unattended session.
  @Delete(':id')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Ip() ip: string,
  ): Promise<void> {
    await this.usersService.delete(user.id, id, ip);
  }
}
