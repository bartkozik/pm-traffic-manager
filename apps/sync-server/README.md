# PTM Sync Server

Yjs WebSocket sync server used by PM Traffic Management for collaboration presence and future live-editing experiments. Durable board data is owned by the API/PostgreSQL backend, not by persisted Yjs documents.

## Run

```bash
npm install
npm start
```

Defaults:

- WebSocket: `ws://localhost:3000`
- HTTP API: `http://localhost:3001`
- Data directory for sync-server internals: `apps/sync-server/data-docs` when run from the monorepo root, or `data-docs` when run from this app directory.
- Document persistence is disabled by default. Set `YJS_PERSIST_DOCUMENTS=true` only for isolated collaboration experiments that should load/save Yjs documents.
- Full Yjs document rooms are rejected by default. Set `YJS_ALLOW_DOCUMENT_SYNC=true` only for isolated experiments that intentionally synchronize non-presence documents.

The frontend connects presence/awareness to a room such as `ptm-mvp:presence`; business maps such as settings, people, projects, and allocations are not attached to the persisted sync-server document.
