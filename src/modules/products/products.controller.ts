import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { ProductResponseDto } from './dto/product-response.dto';
import { PurchaseResponseDto } from './dto/purchase-response.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: QueryProductsDto): Promise<ProductResponseDto[]> {
    return this.productsService.findAll(query);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string): Promise<ProductResponseDto> {
    return this.productsService.findOne(slug);
  }

  @Post(':id/purchase')
  @UseGuards(JwtGuard)
  purchase(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<PurchaseResponseDto> {
    return this.productsService.purchase(user.id, id);
  }
}
