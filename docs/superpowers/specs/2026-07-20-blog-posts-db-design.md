# Blog posts in the database (KAN-73)

Status: approved 2026-07-20. Supersedes the mock data in
`MinecraftFront/src/features/blog/constants.ts`.

## Why

Blog content is seven hardcoded English objects in a frontend constants file.
Nobody can publish without a deploy, and the Ukrainian side of the site has no
blog at all. The quest catalogue solved the same problem in KAN-72 by moving
into Postgres with admin CRUD; this follows that path, with one addition quests
did not need — editorial text genuinely exists in two languages, so translations
are rows, not i18n message keys.

## Data model

```prisma
enum Locale { EN UK }

model Post {
  id           String            @id @default(cuid())
  slug         String            @unique
  image        String
  tagAccent    String            // from the allowed accent list in config/
  author       String
  published    Boolean           @default(false)
  publishedAt  DateTime?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  translations PostTranslation[]
}

model PostTranslation {
  id      String @id @default(cuid())
  postId  String
  locale  Locale
  title   String
  excerpt String
  tag     String   // the chip's wording, e.g. "Update" / "Оновлення"
  body    String   // markdown
  post    Post   @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([postId, locale])
}
```

`tag` sits here rather than on `Post`, which is where this design first put it:
"Update" / "Event" / "Guide" is text a reader sees, so in a bilingual blog it has
to be translated. Only `tagAccent` — a colour — is language-independent.

`AdminActionType` gains `POST_CREATE`, `POST_UPDATE`, `POST_UNPUBLISH`.

Everything language-independent lives on `Post`; everything a translator would
touch lives on `PostTranslation`. A third language is rows, not a migration.
The unique `(postId, locale)` is what makes "one translation per language" a
database guarantee rather than a convention.

`onDelete: Cascade` is safe here because translations are meaningless without
their post — unlike `Purchase.product`, nothing else references them.

### What is deliberately not stored

- **`readTime`** — derived in the service from the returned translation's word
  count (`words / 200`, rounded up) and sent as `readTimeMinutes: number`. The
  current mock stores the string `"4 min"`; storing English in the database is
  the exact problem this ticket exists to fix.
- **`date`** — becomes `publishedAt: DateTime`. `"Dec 20, 2024"` is a rendering
  of a date in one locale, not a date. The client formats it with next-intl's
  `useFormatter`.

## API

Mirrors `products`, which is already the codebase's public-read plus
admin-managed resource.

| Endpoint | Guards | Notes |
|---|---|---|
| `GET /posts?locale=uk` | none | published only, no body |
| `GET /posts/:slug?locale=uk` | none | published only, includes body |
| `GET /posts/manage` | `JwtGuard, AdminGuard` | every post, every translation |
| `POST /posts` | `+ StepUpGuard` | |
| `PATCH /posts/:id` | `+ StepUpGuard` | |
| `POST /posts/:id/publish` | `+ StepUpGuard` | |
| `DELETE /posts/:id` | `+ StepUpGuard` | unpublish, never a row deletion |

`GET /posts/manage` must be declared above `GET /:slug` — Nest matches routes in
declaration order, the same trap already commented in the products and quests
controllers.

**Locale fallback:** the service asks for the requested locale and falls back to
`EN` when that translation is missing, so a half-translated post is visible
rather than a 404. An untranslated post is a content gap, not an error.

**Transactions:** a create or update touches `Post` and `PostTranslation`, plus
the audit row — one `prisma.$transaction()`, per rule 9. A post with half its
translations written is not a state worth being able to reach.

**No pagination.** Products paginate (KAN-38) because a shop catalogue grows
without bound; the blog has seven posts and `BlogGrid` renders all of them. Add
it when volume justifies the query complexity, not before.

## Frontend

- `features/blog/api.ts` — typed fetch helpers.
- List and detail become server components reading the locale from the route.
- `constants.ts` mock data is deleted; the `TagAccent` type stays.
- `PostDetail` renders markdown through `react-markdown` with raw HTML disabled,
  so admin-authored content cannot inject markup. This is the whole reason
  markdown was chosen over stored HTML.
- New `admin/blog` page mirroring the admin quests page: table, create/edit form
  with a tab per locale, publish/unpublish, step-up prompt.
- `Blog` and `Admin` message namespaces grow; `en.json` and `uk.json` stay at key
  parity, verified by flatten-and-compare before committing.

## Seeding

The six existing posts move into the seed script: English verbatim from
`constants.ts`, Ukrainian translated. `body` seeds as the excerpt — real article
text does not exist today, and inventing six articles about fictional server
updates would be fabricating content, not migrating it. Real bodies get authored
through the admin panel.

The seed must leave `test@purecraft.net` and both real admin accounts untouched.

## Delivery

Backend PR first (schema, module, seed), then the frontend PR, as in KAN-72.
Subtasks: KAN-74 schema, KAN-75 module, KAN-76 seed, KAN-77 public frontend,
KAN-78 admin frontend.

## Out of scope

The wiki. It needs the same treatment but also has no article page at all —
`WikiArticleView` currently renders the literal string `Article: {slug}` — so it
carries a build-from-scratch cost the blog does not. Separate ticket.
