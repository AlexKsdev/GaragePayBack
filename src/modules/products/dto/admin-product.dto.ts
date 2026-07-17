import { ProductResponseDto } from './product-response.dto';

/**
 * What the shop returns plus the fields only an admin needs: `active` (so a
 * deactivated product can be seen and put back) and `rarityRank` (so the edit
 * form can round-trip it).
 */
export class AdminProductDto extends ProductResponseDto {
  active: boolean;
  rarityRank: number;
}

export class PaginatedAdminProductsDto {
  items: AdminProductDto[];
  total: number;
  page: number;
  limit: number;
}
