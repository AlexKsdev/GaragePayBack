# Testing Conventions

Stack: Jest + `@nestjs/testing`. Tests live next to the implementation (`*.spec.ts`).

## What to test / skip

| Test | Rule |
|---|---|
| Services (business logic) | Always — TDD, write spec before implementation |
| Guards / Strategies | Always |
| Controllers | Skip — they're thin route mapping; integration tests cover them |
| Config files | Skip |
| DTOs | Skip — class-validator is tested by the library |

## File structure

```
src/modules/[feature]/
  [feature].service.ts
  [feature].service.spec.ts   ← unit test
  [feature].controller.ts     ← no spec
  dto/
    create-[feature].dto.ts
```

## Minimal service spec scaffold

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ExampleService } from './example.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  example: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('ExampleService', () => {
  let service: ExampleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExampleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ExampleService>(ExampleService);
  });

  afterEach(() => jest.clearAllMocks());

  it('create() persists and returns entity without sensitive fields', async () => {
    mockPrisma.example.create.mockResolvedValue({ id: '1', name: 'test' });
    const result = await service.create({ name: 'test' });
    expect(result).toEqual({ id: '1', name: 'test' });
    expect(mockPrisma.example.create).toHaveBeenCalledTimes(1);
  });
});
```

## Mock rules

- Mock `PrismaService` at the method level (`jest.fn()`) — never mock the whole module.
- Reset mocks in `afterEach(() => jest.clearAllMocks())`.
- Test only your business logic, not the ORM internals.

## Guard spec scaffold

```typescript
import { ExecutionContext } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';

describe('JwtGuard', () => {
  it('extends AuthGuard jwt', () => {
    const guard = new JwtGuard();
    expect(guard).toBeDefined();
  });
});
```

## Naming

- Describe block: class name → `describe('ExampleService', () => {`
- It block: `method() + what it does` → `it('create() throws on duplicate email', ...)`
