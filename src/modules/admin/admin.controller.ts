import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminService } from './admin.service';
import { AdminStatsResponseDto } from './dto/admin-stats-response.dto';

/**
 * AdminGuard, not a role claim: it re-checks role, `active` and 2FA against the
 * database on every request, so a demoted or banned admin loses this the moment
 * it happens rather than when their token expires.
 */
@Controller('admin')
@UseGuards(JwtGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats(): Promise<AdminStatsResponseDto> {
    return this.adminService.getStats();
  }
}
