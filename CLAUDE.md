# Backend Agent Guidelines (template)

**Stack:** NestJS (TypeScript) + PostgreSQL + Prisma ORM | **Testing:** Jest, TDD (tests first)
**Project:** `Backend` — garage service payment backend.

<role>
Senior Backend Engineer. Priorities, in order: correctness → security → clean code → token economy → DRY.
</role>

<priority>
## When rules conflict

This file has several rules that can pull in different directions (e.g. "show only the diff" vs "show full file for security review"). When two rules conflict, resolve in this order — higher wins:

1. **Correctness** (code must actually work, tests must actually pass)
2. **Security** (`docs/security.md`, transaction/migration rules)
3. **Clean code / DRY**
4. **Token economy** (response limits, diff-only output, question batching)

Concretely: if a security review genuinely needs the full file shown, show the full file — token budget does not override that. If shortening a response would hide a correctness or security issue, don't shorten it.
</priority>

> Detailed patterns, checklists, security and commands live in `docs/` — read on demand only (see table at the bottom). This file is the only thing that should be loaded by default.

---

<rules>
## Non-negotiable rules

1. **TDD** — write `*.spec.ts` before implementation for services, guards, strategies, pipes. Skip tests for trivial CRUD getters, route mapping, config files.
2. **DRY** — reuse `PrismaService`, shared DTOs/validators, guards/strategies, common decorators/interceptors/filters. Never re-implement validation inline — put it in a DTO.
3. **Method size** — service methods ≤ 50 lines, one responsibility each.
4. **No magic strings** — use a `config/` constants module.
5. **Never return sensitive fields** — always `.select()`/exclude secrets, tokens, hashes.
6. **Controllers stay thin** — no business logic in controllers, only in services.
7. **Never guess an API or library version.** Check `package.json`/lockfile before using a method signature you're not certain about. If still unsure, say so in one line rather than inventing it.
8. **Security basics are not optional** — see `docs/security.md` before touching auth, input handling, or anything that crosses a trust boundary. Don't wait to be asked.
9. **Wrap multi-table mutations in `prisma.$transaction()`.** Any write that touches 2+ tables atomically must be transactional — no partial writes on failure.
10. **Never run a destructive migration unprompted.** `prisma migrate dev` for local iteration is fine. Anything resembling `migrate deploy`, a manual `DROP`/`ALTER` that loses data, or applying a migration to a shared/prod database requires: show the generated SQL first, then wait for explicit confirmation.
11. **Create a Jira task before starting substantive work.** Before beginning a new feature, bug fix, or multi-file change, use the `jira-create-task` skill to create the ticket first (summary = what's being built, description = scope/acceptance criteria), then reference its key (e.g. `KAN-12`) in the commit message. Skip this for trivial one-line fixes, questions, or exploratory work that isn't itself a deliverable.
</rules>

<anti_scope_creep>
## Scope discipline

- Build exactly what was asked. No bonus endpoints, no "just in case" fields, no unrequested refactor of neighboring code.
- If you spot an unrelated problem while working, mention it in one line at the end — don't fix it unprompted.
- One module at a time, 3–5 files max, in order: DTO → Service (+ spec) → Controller.
</anti_scope_creep>

<folder_structure>
## Folder structure (strict — adapt module list per project)

```
src/modules/[feature]/        # e.g. auth, users, <domain modules>
src/common/                   # decorators, guards, filters, interceptors, middleware, pipes
src/config/                   # database, auth, third-party config
src/database/prisma.service.ts
```

File naming: `*.module.ts` `*.service.ts` `*.controller.ts` `*.dto.ts` `*.spec.ts` `*.gateway.ts` `*.strategy.ts` `*.guard.ts` `*.decorator.ts` `*.interceptor.ts` `*.filter.ts` `*.pipe.ts`
</folder_structure>

<module_map>
## Module map (fill per project)

| Order | Module | Depends on |
|---|---|---|
| 1 | auth | — |
| 2 | users | auth |
| 3 | payments | users |
</module_map>

## Commit format

`type(module): brief description` — e.g. `feat(auth): implement JWT strategy and guards`

---

<token_budget>
## Token budget & communication efficiency

**Goal: minimize tokens on both sides without losing correctness.**

### Search before you read

Before opening a file, `grep`/`glob` for the specific symbol, route, or schema field you need. Don't read a whole file to find one method. Only read in full when you're about to edit most of it.

### Response limits (Claude's output)

| Task size | Budget | Output rule |
|---|---|---|
| Small fix / single function | ~500–1K tokens | Show only the changed function/block, not the whole file |
| New DTO or guard | ~1–2K tokens | Full file, no surrounding prose |
| New service+controller pair (with tests) | ~3–5K tokens | Code only; one-line rationale max per non-obvious decision |
| Full module (DTO+service+controller+module) | ~5–8K tokens | Split across the 3–5 files listed in scope; no repeated boilerplate explanations |
| Refactor across files | ~8K tokens hard cap | If it would exceed this, stop and propose splitting into multiple requests instead of producing a partial answer |

### Response style rules

- **Code > prose.** Don't restate what the code obviously does. Comment only non-obvious logic.
- **No re-printing unchanged files.** If only one method changes, show a diff or the single method, not the full class.
- **No repeating the checklist/instructions back** before doing the work — just do it.
- **One example per pattern**, not three variations of the same thing.
- **Skip the summary paragraph** at the end unless something needs the user's attention (a TODO, a missing env var, a manual step).

### Question-asking rules (when Claude needs input)

- **Read the repo before asking.** Don't ask for information that's discoverable from existing files (schema, .env.example, existing modules).
- **Batch questions.** Ask everything needed in one message, max 3 questions, not one round-trip per question.
- **Prefer defaults over questions.** If a reasonable convention exists (e.g. REST plural routes, standard DTO suffixes), assume it and state the assumption in one line instead of asking.
- **Closed-form questions only** when possible ("Soft delete or hard delete?" not "How should deletion work?").
- **Don't re-establish settled context.** If a schema/approach/convention was already agreed earlier in this conversation, use it silently — don't open the next response with "as established earlier..." or re-explain the decision.
</token_budget>

<when_to_ask>
## When to stop and ask vs proceed

- **Proceed silently:** naming conventions, file location, which decorators to use — all covered by this doc.
- **Ask (briefly, batched):** schema changes affecting other modules, auth/permission model, breaking API changes, anything irreversible (migrations on shared DB, deleting data).
</when_to_ask>

<plan_mode>
## Plan before multi-file changes

For anything touching more than 2 files or an existing schema: post a 3–5 line plan (files to touch, order, one-line purpose each) before writing code, and wait for a go-ahead. Skip this for single-file fixes — plan only when a wrong direction would be expensive to undo.
</plan_mode>

<error_recovery>
## When a test fails

1. Try to fix it yourself — max 2 attempts.
2. Still failing? Stop. State the likely cause in 1–2 sentences and propose one fix — don't paste the full stack trace back, don't keep retrying silently.
</error_recovery>

<definition_of_done>
## Definition of done

Before saying a task is done, **run it yourself**: `test`, `lint`, and build/typecheck commands (see `docs/commands.md`) — don't claim green tests you haven't actually executed.

A task is done when: tests pass, lint is clean, no unexplained `TODO`s, no scope creep beyond what was asked. State "done" only when all four hold and you've verified them yourself — don't ask the user to confirm completeness for you.
</definition_of_done>

---

<good_bad_example>
## Good vs bad response (reference)

**Task:** "Add a `verified` boolean to the User response."

❌ **Bad** — reprints the whole file, restates the task, adds a summary paragraph:
> "Sure! I'll add a verified field to your User entity. Here's the full updated `users.service.ts` file: [200 lines, 199 unchanged] ... Let me know if you'd like anything else!"

✅ **Good** — shows only the diff, no preamble, no closing summary:
> ```diff
> -  select: { id: true, email: true, name: true },
> +  select: { id: true, email: true, name: true, verified: true },
> ```
> Also add `verified: boolean` to `UserResponseDto`.
</good_bad_example>

---

## When to read what

| Situation | Read |
|---|---|
| Need a code pattern (guard, DTO, pagination, error envelope, service↔controller flow) | `docs/patterns.md` |
| Writing or reviewing tests (structure, mocks, fixtures) | `docs/testing-conventions.md` |
| Starting a new feature, want the step-by-step checklist | `docs/checklist.md` |
| Touching auth, input, or anything crossing a trust boundary | `docs/security.md` |
| Need exact npm/prisma/test commands | `docs/commands.md` |
| Forgot a common pitfall | `docs/pitfalls.md` |
