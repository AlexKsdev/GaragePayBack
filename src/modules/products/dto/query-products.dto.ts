import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum ProductSort {
  COINS_ASC = 'coins_asc',
  COINS_DESC = 'coins_desc',
  GEMS_ASC = 'gems_asc',
  GEMS_DESC = 'gems_desc',
  RARITY_ASC = 'rarity_asc',
  RARITY_DESC = 'rarity_desc',
}

export class QueryProductsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(ProductSort)
  sort?: ProductSort;
}
