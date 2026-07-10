# GaragePayBack — Backend API

REST + WebSocket backend built with **NestJS**, **PostgreSQL**, and **Prisma ORM**.

## Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 (TypeScript) |
| Database | PostgreSQL + Prisma 7 |
| Auth | JWT (access 15m) + Refresh tokens (7d, stored in DB) |
| Password hashing | bcryptjs (cost 10) |
| Validation | class-validator + class-transformer |
| Real-time | Socket.io (WebSockets) |
| Testing | Jest + @nestjs/testing |

---

## Modules

### Auth — `/auth`

| Method | Path | Guard | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register new user |
| POST | `/auth/login` | LocalGuard | Login, returns access + refresh tokens |
| POST | `/auth/logout` | JWT | Invalidate refresh token |
| POST | `/auth/refresh` | — | Exchange refresh token for new access token |

`register`/`login` are throttled to **5 requests/minute**, `refresh` to **10/minute**; every other route falls back to the global default of **100 requests/minute**.

### Users — `/users`

| Method | Path | Guard | Description |
|---|---|---|---|
| GET | `/users` | JWT + ADMIN | List all users |
| GET | `/users/:id` | JWT | Get user by id |
| PATCH | `/users/:id` | JWT | Update own profile |
| DELETE | `/users/:id` | JWT | Delete own account |

### Payments — `/payments`

| Method | Path | Guard | Description |
|---|---|---|---|
| POST | `/payments` | JWT | Create payment (status: PENDING) |
| GET | `/payments` | JWT | List own payments (admin sees all) |
| GET | `/payments/:id` | JWT | Get payment by id |
| PATCH | `/payments/:id/status` | JWT + ADMIN | Update payment status |

Amount is stored in **integer cents** (e.g. $10.00 = `1000`).

### WebSockets — `/events`

Connect with a valid JWT in `handshake.auth.token`. Invalid or missing token disconnects the client immediately.

| Event | Direction | Description |
|---|---|---|
| `payment:subscribe` | client → server | Join room for a specific payment |
| `payment:updated` | server → client | Emitted when payment status changes |

---

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL database

### Installation

```bash
npm install
```

### Environment

Copy `.env.example` to `.env` and fill in the values:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/db"
JWT_SECRET="your-secret"
JWT_EXPIRES_IN="24h"
OPENAI_API_KEY="sk-..."
```

### Database setup

```bash
# Apply migrations
npx prisma migrate dev

# (optional) Open Prisma Studio
npx prisma studio
```

### Run

```bash
# development (watch mode)
npm run start:dev

# production
npm run build
npm run start:prod
```

---

## Testing

```bash
# unit tests
npm run test

# watch mode
npm run test:watch

# coverage
npm run test:cov

# e2e
npm run test:e2e
```

---

## Project structure

```
src/
├── common/
│   ├── decorators/     # @CurrentUser, @Roles
│   ├── dto/            # PaginationDto
│   ├── filters/        # HttpExceptionFilter
│   ├── guards/         # JwtGuard, RolesGuard
│   ├── pipes/          # ParseCuidPipe
│   └── types/          # JwtPayload, AuthenticatedRequest
├── config/             # AuthConfig, DatabaseConfig, AwsConfig, OpenAiConfig
├── database/           # PrismaService, PrismaModule
└── modules/
    ├── auth/
    ├── users/
    ├── payments/
    └── websockets/
```

## Error format

All errors return a consistent JSON shape:

```json
{
  "statusCode": 404,
  "message": "Payment not found",
  "error": "NotFoundException"
}
```

---

## Documentation

Deeper conventions and checklists live in `docs/` (read on demand, not loaded by default):

| File | Covers |
|---|---|
| `docs/patterns.md` | Guard, DTO, pagination, error-envelope, service↔controller patterns |
| `docs/testing-conventions.md` | Test structure, mocks, fixtures |
| `docs/checklist.md` | Step-by-step checklist for a new feature |
| `docs/security.md` | Auth/input/trust-boundary rules |
| `docs/commands.md` | Exact npm/prisma/test commands |
| `docs/pitfalls.md` | Common gotchas |

---

## Prisma schema models

| Model | Key fields |
|---|---|
| `User` | id, email, passwordHash, name, role (USER/ADMIN) |
| `RefreshToken` | id, token, userId, expiresAt |
| `Payment` | id, userId, amount (cents), description, status, stripePaymentId |
