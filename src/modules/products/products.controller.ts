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
import {
  AdminProductDto,
  PaginatedAdminProductsDto,
} from './dto/admin-product.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginatedProductsDto } from './dto/paginated-products.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { PurchaseResponseDto } from './dto/purchase-response.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: QueryProductsDto): Promise<PaginatedProductsDto> {
    return this.productsService.findAll(query);
  }

  /**
   * Must stay above `@Get(':slug')` — Nest matches in declaration order, so the
   * param route would otherwise swallow this path (same reason /users/me sits
   * above /users/:id).
   */
  @Get('manage')
  @UseGuards(JwtGuard, AdminGuard)
  findAllForAdmin(
    @Query() query: QueryProductsDto,
  ): Promise<PaginatedAdminProductsDto> {
    return this.productsService.findAllForAdmin(query);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string): Promise<ProductResponseDto> {
    return this.productsService.findOne(slug);
  }

  // Step-up on every catalogue write, not just removal: a price is money. With
  // balance changes already behind step-up, an unguarded price edit would let a
  // hijacked admin session set a legendary item to 0 and buy the shop out —
  // the same protection walked around from the other side. The proof lasts five
  // minutes, so a catalogue session costs one code.
  @Post()
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Ip() ip: string,
  ): Promise<AdminProductDto> {
    return this.productsService.create(user.id, dto, ip);
  }

  @Patch(':id')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  update(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Ip() ip: string,
  ): Promise<AdminProductDto> {
    return this.productsService.update(user.id, id, dto, ip);
  }

  /** The way back from DELETE; see ProductsService.activate. */
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  activate(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Ip() ip: string,
  ): Promise<AdminProductDto> {
    return this.productsService.activate(user.id, id, ip);
  }

  /** Takes the product off the shop; see ProductsService.deactivate. */
  @Delete(':id')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  deactivate(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Ip() ip: string,
  ): Promise<AdminProductDto> {
    return this.productsService.deactivate(user.id, id, ip);
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
