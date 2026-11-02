# PTM MCP Server

Local MCP server for PM Traffic Management. It exposes controlled planning tools for agents while keeping durable writes behind the existing PTM API command path.

## Run

Start the PTM API first:

```bash
pnpm dev:db
pnpm dev:api
```

Then run the MCP server over stdio:

```bash
pnpm dev:mcp
```

Useful environment variables:

```bash
PTM_MCP_API_URL=http://localhost:4000/api
PTM_MCP_BOARD_ID=ptm-mvp
# Required when PTM_AUTH_ENABLED=true on the API:
PTM_MCP_API_SERVICE_TOKEN=<same value as PTM_AUTH_SERVICE_TOKEN>
```

## Tools

- `ptm_get_board_overview` - compact board IDs and active-month summary.
- `ptm_get_board_snapshot` - full API snapshot for detailed inspection; use sparingly because it returns the whole board.
- `ptm_analyze_month` - deterministic opportunity analysis from `packages/domain`.
- `ptm_create_person` - create a real person and initial capacity tiles through `person.create`.
- `ptm_create_project` - create a real project frame with revenue plan and requirements through `project.create`.
- `ptm_prepare_period_range` - ensure month periods and person capacity exist before imports.
- `ptm_upsert_people` - idempotently create/update people from source-system records.
- `ptm_upsert_projects` - idempotently create/update projects with requirements and multi-month revenue plans.
- `ptm_update_project_revenue_plans` - upsert monthly revenue plans for an existing project.
- `ptm_update_project_requirements` - replace or merge skill requirements for an existing project.
- `ptm_move_person_capacity` - move person capacity tiles through `allocations.move`.
- `ptm_apply_allocations` - reconcile imported person/project tile counts by moving only the delta.
- `ptm_update_allocation_details` - update hours, revenue, skill mapping, weekly overrides, and meeting state on an allocation.
- `ptm_archive_restore_entity` - archive/restore people and archive/restore/delete projects with explicit confirmation.
- `ptm_create_person_pair_block_rule` - create durable person-pair planning rules.
- `ptm_delete_planning_rule` - delete a durable planning rule with explicit confirmation.
- `ptm_validate_import` - dry-run import validation without mutating the board.

Mutation tools intentionally return compact board metadata (`boardId`, `version`, `updatedAt`, counts, and `fullSnapshotOmitted: true`) instead of echoing all people, projects, and allocations after every request. Call `ptm_get_board_overview` only when follow-up entity IDs or active-month totals are needed, and reserve `ptm_get_board_snapshot` for full-state debugging.

The server does not write to Yjs or the sync-server. All mutations go through the API and shared domain commands, so PostgreSQL persistence, audit entries, allocation validation, and realtime board updates stay on the same path as the web UI.
