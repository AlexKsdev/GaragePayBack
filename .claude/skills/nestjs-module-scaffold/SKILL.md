---
name: nestjs-module-scaffold
description: Scaffolds a new NestJS feature module (DTO, Service+spec, Controller, Module) following this repo's folder structure and TDD conventions from CLAUDE.md. Use whenever the user asks to add a new module, resource, or feature to the NestJS backend (e.g. "add a garages module", "create a new endpoint for X", "scaffold the invoices feature") — even if they don't use the word "scaffold" or "module" explicitly.
---

# NestJS module scaffold

Generates a new feature module in `src/modules/[feature]/` in the order and shape mandated by `CLAUDE.md`: DTO → Service (+ spec, test-first) → Controller → Module. Read `CLAUDE.md` at the repo root before running this — it is the source of truth for naming, folder layout, and rules like transactional multi-table writes and never returning sensitive fields.

## Before generating anything

1. **Get the feature name and its dependencies.** If either is unclear from the request, ask in one batched question (e.g. "What's the module called, and does it depend on `users`/`auth` like the existing modules?") — don't guess a domain model that isn't there.
2. **Check `src/modules/` for an existing module of the same name.** Never overwrite an existing file. If the module already exists, tell the user and ask whether they want you to extend it instead of scaffolding fresh.
3. **Look at one existing module** (e.g. `src/modules/users/` or `src/modules/payments/`) to match current patterns exactly — decorator usage, how `PrismaService` is injected, how guards are applied. Conventions drift over time; the code is more current than any template.

## Build order

Follow TDD — the spec is written before the implementation it tests, per CLAUDE.md rule 1.

1. **DTOs** (`[feature].dto.ts` or split `create-*.dto.ts`/`update-*.dto.ts` if the existing modules do that) — class-validator decorators, no business logic. Reuse shared validators/decorators from `src/common/` instead of re-implementing inline validation.
2. **Service spec** (`[feature].service.spec.ts`) — write the test cases for the service methods first: happy path, ownership/permission checks if applicable, and the error cases. Skip this step only for trivial CRUD getters with no logic.
3. **Service** (`[feature].service.ts`) — implement against the spec. Inject `PrismaService`, never re-instantiate Prisma. Keep methods ≤ 50 lines, one responsibility each. Wrap any write touching 2+ tables in `prisma.$transaction()`. Never `.select()`/return password hashes, tokens, or other secrets.
4. **Controller** (`[feature].controller.ts`) — thin routing only, no business logic. Apply the same guards/strategies used elsewhere in the project (check `src/common/guards/`).
5. **Module** (`[feature].module.ts`) — wire it up, import the modules it depends on per the answer from step 1, and add it to `AppModule` if that's how existing modules register.

## After scaffolding

Run the new service spec and confirm it passes before saying you're done — an untested scaffold isn't done, per CLAUDE.md's definition of done. Don't scaffold more modules or files than were asked for (no bonus endpoints, no speculative fields).
