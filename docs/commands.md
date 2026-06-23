# Quick Reference Commands

```bash
# Development
npm run start:dev
npm run start:debug

# Testing
npm run test
npm run test:watch
npm run test:cov

# Database (Prisma)
npx prisma migrate dev --name "migration_name"
npx prisma db push        # dev only
npx prisma studio
npx prisma generate

# Build & Production
npm run build
npm run start:prod

# Code Quality
npm run lint
npm run format
```
