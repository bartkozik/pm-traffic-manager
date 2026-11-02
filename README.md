# PM Traffic Manager

A collaborative application for planning people, project capacity and revenue across months, with weekly detail, scenario review and financial visibility.

I designed and built this application end to end as a contractor collaborating with **Iterators**: the React interface, shared planning domain, API and PostgreSQL persistence, collaboration, authentication/access workflows and MCP integration.

This is a sanitized snapshot of the **actual application and its tests**. It retains the existing interface and workspace architecture. It represents a working MVP, not a claim of production readiness.

## What the application contains

- Monthly people/project planning, allocation editing, drag and drop, selectable perspectives and weekly drill-down.
- Separate views of capacity, person cost, expected/committed revenue, project pressure and planning risks.
- Planning rules, scenarios, period comparisons, analytics and review summaries.
- API-backed persistence with shared contracts and domain command validation.
- SAML authentication, session handling and role-aware access administration.
- Yjs collaboration, presence and synchronization; API/PostgreSQL remain the durable business boundary.
- MCP tools that use the existing API/domain command path and deterministic planning analysis.

## Repository map

| Workspace | Responsibility | Main technologies |
| --- | --- | --- |
| `apps/web` | Existing planning UI, authentication views and frontend state | React, TypeScript, Vite, Mantine, Zustand, Yjs |
| `apps/api` | HTTP API, access/auth, persistence and planning services | Fastify, PostgreSQL, node-saml, Zod, WebSocket |
| `apps/sync-server` | Synchronization, document versions, retention and backup plumbing | Node.js, Yjs, WebSocket |
| `apps/mcp-server` | Controlled agent tools and API integration | MCP SDK, TypeScript, Zod |
| `packages/domain` | Models, calculations, planning commands and seed schema | TypeScript |
| `packages/contracts` | Shared request/response contracts | TypeScript, Zod |

The [MCP server notes](apps/mcp-server/README.md) and [sync server notes](apps/sync-server/README.md) describe those services in more detail. Internal plans, operational notes and production deployment material are not included.

## Run locally

Prerequisites: **Node.js 22.13** (see `.nvmrc`), **pnpm 8.15.4**, and Docker with Compose for a disposable local PostgreSQL instance. Dependencies and the original lockfile are retained without automatic major-version upgrades.

```sh
corepack enable
corepack prepare pnpm@8.15.4 --activate
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/sync-server/config/sync-server-config.example.json apps/sync-server/config/sync-server-config.json
pnpm dev:all
```

The local template uses PostgreSQL on port **55432**, the API on **4000**, the web app normally on **5173**, and synchronization on **1234/1235**. The Compose project and data volume are isolated from the original application's environment. Check the terminal if a development port is already occupied.

`pnpm dev:all` starts local PostgreSQL, then web, API and sync. `pnpm dev` starts only the frontend. You can also run the services separately:

```sh
pnpm dev:web
pnpm dev:api
pnpm dev:sync
pnpm dev:mcp
```

The local template disables authentication so the existing board can be explored without a company identity provider. The actual authentication/access implementation remains present. To exercise SAML, configure your own test identity provider and the documented `PTM_*` environment variables; do not reuse production credentials. The default allowlist identities are placeholders under `example.test`.

The sync server generates its own authority keypair into its runtime configuration. That runtime file, `.env`, persisted documents and generated build output are ignored. The checked-in example has no keypair and no external backup sources. Optional model providers require your own opt-in credentials; none are included.

## Tests and checks

```sh
pnpm test
pnpm lint
pnpm build
pnpm --filter @ptm/sync-server type-check
```

The original suites cover domain calculations and commands, React interactions and stores, authentication/access, service behavior, persistence contracts and MCP builders. Three PostgreSQL integration test files require `PTM_TEST_DATABASE_URL` pointing to a separately created, disposable local test database. Without it, their five tests are skipped.

Verified locally: **470 tests passed** (domain 61, web 327, API 69, MCP 13); **5 PostgreSQL integration tests skipped** because no disposable test database was configured. Build, lint and sync-server type checks passed. The source requests Node 22.13; this verification used Node 24.22.1 and pnpm 8.15.4. A full browser/SAML-provider walkthrough and live database integration were not performed for this snapshot.

The root build checks and bundles web, API and MCP. The JavaScript sync server runs directly and has a separate type-check command. No hosted environment or production deployment is included or asserted as verified.

## What was anonymized

- Existing people/client/project labels, access identities and fixture descriptions were replaced with neutral values.
- Employee costs, client budgets, billing/target rates and revenue amounts in both existing seed implementations were replaced with independently chosen round synthetic amounts. Capacity norms, schemas, references and domain algorithms remain intact.
- Fixture-dependent test labels and expected numbers were updated without removing assertions or changing their purpose.
- Branding uses a neutral mark. Private environment/deployment configuration, internal planning documents, original Git history and production data are excluded.
- A test-only certificate fixture replaces the original certificate; it grants no access to an identity provider.

The application structure, views, API/auth behavior and actual test implementations remain the original work. A private per-file provenance manifest records copied, modified and excluded paths for review. It is not part of this repository.

Existing scoped license/copyright/attribution notices are preserved, including the sync-server manifest's existing license field. This snapshot does not introduce a new project-wide license grant.
