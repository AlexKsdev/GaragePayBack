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
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { StepUpGuard } from '../../common/guards/step-up.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { GrantXpDto } from './dto/grant-xp.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AdminGuard)
  findAll(
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.usersService.findAll(query, query.search);
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

  // Role and balance are the levers an attacker with a hijacked admin session
  // would reach for first, so both need admin rights *and* a factor re-proved
  // in the last few minutes. Every call is recorded (see AuditService).
  @Patch(':id/role')
  @UseGuards(AdminGuard, StepUpGuard)
  changeRole(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Ip() ip: string,
  ): Promise<UserResponseDto> {
    return this.usersService.changeRole(user.id, id, dto.role, ip);
  }

  @Patch(':id/balance')
  @UseGuards(AdminGuard, StepUpGuard)
  adjustBalance(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: AdjustBalanceDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Ip() ip: string,
  ): Promise<UserResponseDto> {
    return this.usersService.adjustBalance(user.id, id, dto, ip);
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
