<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes

- Cache Components is on. Anything that reads cookies, `params`, `searchParams` or the database must sit inside a `<Suspense>` boundary. Follow the pattern in existing pages: a sync page component that renders an async child inside `<Suspense>`.
- Every Server Action re-checks the session through `src/lib/auth.ts` and scopes its database writes to the signed-in user. Keep doing this. Never trust ids from the form alone.
- After editing `prisma/schema.prisma`, run `npm run db:migrate`. The client is generated into `src/generated/prisma`, which is gitignored.
- Before pushing, run `npm run lint && npm run typecheck && npm test && npm run build`.
