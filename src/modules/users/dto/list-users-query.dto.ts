import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListUsersQueryDto extends PaginationDto {
  /** Matches name or email, case-insensitively. Capped so it can't be used to
   * push pathological patterns at the database. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
