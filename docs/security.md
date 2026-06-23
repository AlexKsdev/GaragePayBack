# Security Basics (generic)

Read before touching auth, input handling, file uploads, or anything crossing a trust boundary (user input → DB, user input → filesystem, user input → external API).

## Secrets

- Never hardcode secrets, API keys, or connection strings — always `.env`, never committed.
- Never log secrets, tokens, or full request bodies that may contain passwords.
- `.env.example` should list every required var with a placeholder, never a real value.

## Input handling

- All external input validated via DTO + `class-validator` — no manual `if` checks for shape/type.
- Sanitize anything that reaches a raw query, shell command, or HTML output. Prefer Prisma's parameterized queries over raw SQL; if raw SQL is unavoidable, use parameterized placeholders, never string interpolation.
- File uploads: validate MIME type and size before processing, never trust the client-supplied extension alone.

## AuthN/AuthZ

- Every route either has an explicit `@UseGuards()` or an explicit comment saying why it's public.
- Authorization (role/ownership checks) happens in the service layer, not just the guard — a guard confirms identity, not permission to act on a specific resource.
- Passwords: hash with bcrypt (cost ≥ 10), never store or return plaintext/hash in API responses.

## Rate limiting & abuse

- Public-facing endpoints (login, signup, password reset, any unauthenticated POST) need rate limiting (`@nestjs/throttler` or equivalent).
- Return generic error messages for auth failures ("invalid credentials", not "user not found" vs "wrong password" — avoid enumeration).

## Error envelope (avoid leaking internals)

Standard error shape — don't leak stack traces or internal messages to the client:
```typescript
{
  statusCode: number,
  message: string,
  error: string  // e.g. "Bad Request"
}
```
Implement once via a shared exception filter (`src/common/filters/`), reuse everywhere — don't hand-roll error responses per controller.

## S3 file uploads

- Validate MIME type **server-side** before uploading — never trust `Content-Type` from the client alone. Use `file-type` or check magic bytes.
- Enforce a size limit before the stream reaches S3 (e.g. via `multer` `limits.fileSize`).
- Never expose the raw S3 key or bucket name in API responses — return a signed URL or a CDN URL only.
- Use pre-signed URLs (`getSignedUrlPromise`) with a short TTL (≤ 15 min) for client-side downloads.
- Store files under a non-guessable path (e.g. `uploads/{uuid}/{filename}`, not `uploads/{userId}/{filename}`).

```typescript
// multer limits example (in controller or module)
MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } }) // 5 MB

// generate pre-signed download URL
const url = await s3.getSignedUrlPromise('getObject', {
  Bucket: process.env.AWS_S3_BUCKET,
  Key: objectKey,
  Expires: 900, // 15 min
});
```
