# Pre-Task Checklist (generic)

Use before starting any feature module. Fill `[Feature Name]`. Keep this short when posting it back — don't restate the whole template, just check off items inline as you work.

```markdown
## [Feature Name] — Pre-Start Checklist

### 1. Planning
- [ ] Module location: src/modules/[feature]/
- [ ] DTO → Service → Controller order confirmed
- [ ] Dependencies identified (PrismaService, Guards, etc.)
- [ ] Schema updated if DB changes needed

### 2. DTOs & Validation
- [ ] create-X.dto.ts with class-validator decorators
- [ ] update-X.dto.ts (if applicable)
- [ ] Response DTO excludes sensitive fields

### 3. Unit Tests (BEFORE code)
- [ ] *.service.spec.ts written with test cases
- [ ] *.guard.spec.ts written (if guard exists)

### 4. Service Implementation
- [ ] All unit tests passing
- [ ] Methods ≤ 50 lines
- [ ] Error handling via HttpException
- [ ] Queries use .select()/.include()

### 5. Controller Implementation
- [ ] Routes match API spec
- [ ] @UseGuards() applied where needed
- [ ] Return types match Response DTOs

### 6. Module Setup
- [ ] feature.module.ts imports/exports configured

### 7. Final Checks
- [ ] Dev server runs without errors
- [ ] Tests green
- [ ] Commit message follows type(module): description
```
