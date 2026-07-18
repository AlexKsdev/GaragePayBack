# Admin Panel Phase 4 — Orders / Payments View (KAN-65)

**Status:** approved design, pre-implementation
**Repos:** MinecraftBack (backend) + MinecraftFront (frontend)
**Jira:** KAN-65
**Migration:** none

## Goal

Close admin v1 by giving admins a read surface over payments and a page to browse
and act on them. The mutation already exists: `PATCH /payments/:id/status`
(`JwtGuard + AdminGuard + StepUpGuard`, audited inside its own transaction, from
security phase 0e). This phase adds the **admin list endpoint** and the
**`/admin/orders` page**, mirroring the existing users-admin surface.

## Decisions (locked)

- **Dedicated admin endpoint** `GET /payments/admin` — not an extension of the
  overloaded `GET /payments`. Keeps buyer PII off the user-facing route.
- **v1 = list + status action.** The orders table ships together with the
  status-change control wired through the existing step-up flow.
- **Status filter only.** No buyer search, no payment/Stripe id search in v1.

## Backend (MinecraftBack)

New endpoint on `PaymentsController`:

```
GET /payments/admin?page=&limit=&status=
Guards: JwtGuard, AdminGuard
```

Route ordering matters: declare `@Get('admin')` **before** `@Get(':id')` so the
static segment wins the match (same reason `@Get('gem-packs')` is declared first).

### Files

| File | Change |
|---|---|
| `dto/list-payments-query.dto.ts` | **new** — `extends PaginationDto`; `@IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus` |
| `dto/admin-payment-response.dto.ts` | **new** — payment fields + buyer summary `user: { id: string; name: string; email: string }` |
| `dto/paginated-payments-response.dto.ts` | **new** — `{ items: AdminPaymentResponseDto[]; total: number; page: number; limit: number }` (mirrors `PaginatedUsersResponseDto`) |
| `payments.service.ts` | add `findAllForAdmin(query)`; add `ADMIN_PAYMENT_SELECT` (base fields + `user: { select: { id, name, email } }`); **strip the admin overload** from `findAll` so it is own-history only |
| `payments.controller.ts` | add `@Get('admin')` above `@Get(':id')` |
| `payments.service.spec.ts` | TDD cases (below) |

### `findAllForAdmin` shape

```
where = status ? { status } : {}
[items, total] = Promise.all([
  payment.findMany({ where, select: ADMIN_PAYMENT_SELECT,
                     skip, take, orderBy: { createdAt: 'desc' } }),
  payment.count({ where }),
])
return { items, total, page: page ?? 1, limit: limit ?? 20 }
```

The `count` runs against the same `where` as the page query, or the pager would
offer pages that don't exist (same invariant as the users list).

### Behaviour change to flag

`GET /payments` today branches on `isAdmin` and returns **all** payments to
admins. With the dedicated endpoint in place, that overload is removed:
`GET /payments` becomes unambiguously the caller's own history regardless of
role. The existing `PaginatedUsersResponseDto` doc comment already anticipated
folding this in at phase 4.

### Tests (write first)

1. `findAllForAdmin` returns the paginated envelope `{ items, total, page, limit }`.
2. `status` filter drives **both** the `findMany` `where` and the `count` `where`.
3. Each item carries the buyer summary (`user.id/name/email`) and no secret fields.
4. `findAll` returns **own-only** even when the caller is an admin (overload gone).

## Frontend (MinecraftFront)

New `/admin/orders` route, Server Component, gated by the existing
`app/[locale]/admin/layout.tsx` (role read from `/users/me`; non-admins 404).
Mirrors `admin/users`.

### Files

| File | Purpose |
|---|---|
| `app/[locale]/admin/orders/page.tsx` | Server Component; reads `searchParams { status?, page? }`, renders `<AdminOrdersView>` |
| `features/admin/AdminOrdersView.tsx` | Server Component; `serverFetch('/payments/admin?page=&limit=&status=')`; renders table (date, buyer name/email, amount, gems, status badge, actions) + pager; `loadFailed` empty state on non-ok |
| `features/admin/OrderStatusFilter.tsx` | client — status dropdown pushing `status` into the URL (like `UserSearch`) |
| `features/admin/OrderRowActions.tsx` | client — status change (e.g. mark `REFUNDED`) via existing `useStepUpAction` + `StepUpPrompt`, hitting `PATCH /payments/:id/status`; refresh on success |
| admin nav | add an **Orders** link wherever Users/Products are linked |
| `messages/en.json` + `messages/uk.json` | `Admin.orders.*` keys at parity (verify with the flatten-and-compare check before committing) |

Amounts are stored in the smallest currency unit; reuse the existing
`formatMoney(cents)` pattern from `AdminDashboard`. Status badge reuses the
`STATUS_CLASS` map already in the dashboard styles.

## Sequencing

1. Backend: DTOs → service (+spec, TDD) → controller. Own PR into `dev`.
2. Frontend: page + view + filter + row actions + i18n. Own PR into `dev`.

Same two-PR, backend-first flow as phase 3. Each PR verified (test, lint, build)
before opening; frontend verified live once backend is merged.

## Out of scope (v1)

- Buyer / payment-id search on the orders list.
- Any change to the Stripe checkout or webhook path.
- The stale `docs/admin-panel-spec` branch (never pushed; ignore).
