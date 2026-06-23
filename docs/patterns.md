# Code Patterns (generic)

Copy-paste ready, framework defaults assumed (NestJS + Prisma + class-validator). Load only when implementing a guard, DTO, or service/controller pair.

> Before reading any existing file in full, `grep` for the symbol/route/field you actually need. Read whole files only when editing most of them.

## 1. Auth guard

`src/modules/auth/guards/jwt.guard.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {}
```

Usage:
```typescript
@UseGuards(JwtGuard)
@Get('profile')
getProfile(@CurrentUser() user: User) {
  return user;
}
```

## 2. PrismaService usage

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ExampleService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateExampleDto) {
    return this.prisma.example.create({ data });
  }
}
```

## 3. DTO validation

`src/modules/[feature]/dto/create-*.dto.ts`
```typescript
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  name: string;
}
```

Global pipe (`main.ts`, once per project):
```typescript
app.useGlobalPipes(new ValidationPipe());
```

## 4. Service → Controller flow

```typescript
// example.service.ts
async create(dto: CreateExampleDto): Promise<ExampleResponseDto> {
  const entity = await this.prisma.example.create({
    data: dto,
    select: { id: true, name: true }, // exclude sensitive fields
  });
  return entity;
}
```
```typescript
// example.controller.ts
@Post()
async create(@Body() dto: CreateExampleDto): Promise<ExampleResponseDto> {
  return this.exampleService.create(dto);
}
```

## 5. Pagination DTO

`src/common/dto/pagination.dto.ts`
```typescript
import { IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  limit: number = 10;
}
```

Usage:
```typescript
async findAll(pagination: PaginationDto) {
  const skip = (pagination.page - 1) * pagination.limit;
  return this.prisma.example.findMany({ skip, take: pagination.limit });
}
```

## 6. Password hashing (when entity has credentials)

```typescript
const hashedPassword = await bcrypt.hash(dto.password, 10);
```

## 7. Shared exception filter (error envelope)

`src/common/filters/http-exception.filter.ts` — see `docs/security.md` for the response shape and rationale.
```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    response.status(status).json({
      statusCode: status,
      message,
      error: HttpStatus[status] ?? 'Error',
    });
  }
}
```

Register once in `main.ts`:
```typescript
app.useGlobalFilters(new HttpExceptionFilter());
```

## 8. JWT Strategy

`src/modules/auth/strategies/jwt.strategy.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
```

## 9. @CurrentUser decorator

`src/common/decorators/current-user.decorator.ts`
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

## 10. WebSocket Gateway

`src/modules/[feature]/[feature].gateway.ts`
```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class ExampleGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    // validate token here if needed: client.handshake.auth.token
  }

  handleDisconnect(client: Socket) {}

  @SubscribeMessage('example:event')
  handleEvent(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
    this.server.emit('example:broadcast', data);
  }
}
```

Register in feature module:
```typescript
providers: [ExampleGateway, ExampleService]
```
