# PM Traffic Manager

A visual workspace for planning team capacity, project allocations and revenue. Drag people’s capacity tiles between projects, compare costs with expected revenue, and inspect planning constraints across months and weeks.

Designed and developed end to end by Bartosz Kozikowski, in collaboration with Iterators, with AI-assisted development. This repository contains the application with synthetic people, clients and financial data.

## Stack

React, TypeScript, Vite, Mantine, Zustand and Yjs on the frontend; Fastify and PostgreSQL on the backend. Shared packages contain domain calculations, commands and Zod contracts. Separate services provide team presence and MCP tools.

## Local development

Use Node.js 24 (see `.nvmrc`), pnpm 8.15.4 and Docker Compose.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/sync-server/config/sync-server-config.example.json apps/sync-server/config/sync-server-config.json
pnpm dev:all
```

The web app runs on port 5173, the API on 4000, PostgreSQL on 55432 and the sync service on 1234/1235. The default local configuration disables SAML authentication. Configure your own identity provider to test the company sign-in flow.

## Guest demo

The public demo uses a separate mode: each guest receives a private, temporary board with fictional data. Reset creates a fresh board without affecting other guests. Sessions expire after 24 hours. Company administration, custom shared rooms, presence services and MCP are not exposed in this mode.

Enable `PTM_DEMO_ENABLED=true` for the API and build the frontend with `VITE_PTM_DEMO_ENABLED=true` and `VITE_PTM_API_URL=/api`. Serve both behind the same origin; set `PTM_API_CORS_ORIGIN` to that origin. Guest cookies are HttpOnly, Secure and SameSite=Strict.

Optional AI analysis uses only `PTM_DEMO_OPENAI_API_KEY`, provided to the API at runtime. It does not inherit other OpenAI or Anthropic keys. PostgreSQL enforces three analyses per session and a shared $5 calendar-month API budget in UTC. Reset does not restore the quota. Requests reserve their maximum cost before contacting OpenAI; failed or unaccounted requests retain that reservation. Planning and financial calculations work without AI. Do not enter personal or confidential information into the demo.

## Checks

```sh
pnpm lint
pnpm test
pnpm build
PTM_TEST_DATABASE_URL=postgres://user:password@localhost:5432/ptm_test pnpm --filter @ptm/api exec vitest run --no-file-parallelism
```

Use a dedicated disposable database for integration tests. They exercise session isolation, reset, realtime authorization, concurrent updates and AI budget accounting. Without `PTM_TEST_DATABASE_URL`, database tests are skipped; CI always provides it.

GitHub Actions checks the code, scans Git history for secrets, builds API and web images, and tests the downloaded image artifacts. Only successful main builds publish immutable images and deploy them. VPS configuration and deployment helpers live in [portfolio-infra](https://github.com/bartkozik/portfolio-infra).

Existing scoped copyright and attribution notices are preserved. This repository does not introduce a project-wide license grant.
