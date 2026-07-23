import { ProductResponseDto } from './product-response.dto';

export class PaginatedProductsDto {
  items: ProductResponseDto[];
  total: number;
  page: number;
  limit: number;
}
