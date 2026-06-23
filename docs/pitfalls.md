# Common Mistakes to Avoid

| ❌ Mistake | ✅ Fix |
|---|---|
| Business logic in Controller | Move to Service, keep Controller thin |
| Forgot global ValidationPipe | `app.useGlobalPipes(new ValidationPipe())` in `main.ts` |
| Duplicate DTOs across services | Define once, import everywhere |
| Secret/hash in response | Use `.select()` to exclude it |
| No unit tests | Write tests BEFORE implementation |
| Service method > 50 lines | Split into helper methods |
| Hardcoded strings | Move to `config/` |
| N+1 query problem | Use `.include()` / `.select()` |
| Missing error handling | Throw `HttpException`, use the shared error filter |
| Testing the framework, not your code | Test only business logic |
| Re-printing whole files for one-line changes | Show only the diff/changed block |
| Asking questions answerable from the repo | Read schema/.env.example/existing modules first |
| Guessing a library's API or version | Check `package.json`/lockfile, or say you're unsure |
| Adding unrequested fields/endpoints "just in case" | Build exactly what was asked, mention extras, don't build them |
| Retrying a failing test indefinitely | Max 2 self-fix attempts, then stop and explain |
| Hand-rolled error JSON shape per controller | One shared exception filter, reused everywhere |
| Raw SQL with string interpolation | Parameterized queries / Prisma client only |
| No rate limiting on login/signup | Add `@nestjs/throttler` (or equivalent) to public auth routes |
