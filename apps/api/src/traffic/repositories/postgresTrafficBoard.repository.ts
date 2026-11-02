import { Pool, PoolClient } from 'pg';
import {
  Invoice,
  MonthlyRevenuePlan,
  Person,
  PersonTileAllocation,
  PlanningRule,
  Period,
  ProjectFrame,
  ProjectRequirement,
  Skill,
  TileUnit,
  TrafficSnapshot,
  WeeklyAllocation,
} from '@ptm/domain';
import {
  TrafficAuditContext,
  TrafficAuditLogEntry,
  TrafficBoardRecord,
  TrafficBoardRepository,
  TrafficEntityTable,
  trafficEntityTables,
} from './trafficBoard.repository.js';

interface TrafficBoardRow {
  id: string;
  snapshot_json?: unknown | null;
  schema_version?: number | null;
  active_period_id?: string | null;
  active_tile_unit_id?: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

interface JsonPayloadRow {
  payload_json: unknown;
}

interface AuditLogRow {
  id: number;
  board_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  payload_json: unknown;
  actor_id?: string | null;
  command_id?: string | null;
  source_system?: string | null;
  source_record_id?: string | null;
  idempotency_key?: string | null;
  diff_summary?: string | null;
  created_at: string;
}

type ProjectEntity = Omit<ProjectFrame, 'requirements' | 'revenuePlan' | 'invoices'>;
type QueryClient = Pick<PoolClient, 'query'>;

export class PostgresTrafficBoardRepository implements TrafficBoardRepository {
  constructor(private readonly pool: Pool) {}

  async find(boardId: string): Promise<TrafficBoardRecord | null> {
    const row = await this.findBoardRow(boardId);
    if (!row) return null;

    const snapshot = await this.readNormalizedSnapshot(row) ?? this.readLegacySnapshot(row);
    if (!snapshot) return null;

    if (!(await this.hasNormalizedEntities(boardId))) {
      return this.upsert(boardId, snapshot, 'legacy_snapshot_migrated');
    }

    return {
      boardId: row.id,
      snapshot,
      updatedAt: row.updated_at,
      version: row.version,
    };
  }

  async upsert(
    boardId: string,
    snapshot: TrafficSnapshot,
    action = 'board_snapshot_saved',
    auditContext: TrafficAuditContext = {}
  ): Promise<TrafficBoardRecord> {
    const now = new Date().toISOString();
    const existing = await this.findBoardRow(boardId);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        `
          INSERT INTO traffic_boards (
            id,
            snapshot_json,
            schema_version,
            active_period_id,
            active_tile_unit_id,
            created_at,
            updated_at,
            version
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
          ON CONFLICT(id) DO UPDATE SET
            snapshot_json = EXCLUDED.snapshot_json,
            schema_version = EXCLUDED.schema_version,
            active_period_id = EXCLUDED.active_period_id,
            active_tile_unit_id = EXCLUDED.active_tile_unit_id,
            updated_at = EXCLUDED.updated_at,
            version = traffic_boards.version + 1
        `,
        [
          boardId,
          JSON.stringify(snapshot),
          snapshot.schemaVersion,
          snapshot.activePeriodId,
          snapshot.activeTileUnitId,
          existing?.created_at ?? now,
          now,
        ]
      );

      await this.replaceEntities(client, boardId, snapshot);
      await this.insertAuditLog(client, boardId, action, 'board', boardId, {
        allocations: snapshot.allocations.length,
        planningRules: snapshot.planningRules?.length || 0,
        people: snapshot.people.length,
        projects: snapshot.projects.length,
        schemaVersion: snapshot.schemaVersion,
        weeklyAllocations: snapshot.weeklyAllocations?.length || 0,
      }, now, auditContext);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const saved = await this.findBoardRow(boardId);
    return { boardId, snapshot, updatedAt: now, version: saved?.version ?? ((existing?.version ?? 0) + 1) };
  }

  async updateAtomically(
    boardId: string,
    initialSnapshot: TrafficSnapshot,
    update: (snapshot: TrafficSnapshot) => TrafficSnapshot,
    action: string,
    auditContext: TrafficAuditContext = {}
  ): Promise<TrafficBoardRecord> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      let row = await this.findBoardRow(boardId, client, true);

      if (!row) {
        const initializedAt = new Date().toISOString();
        const initialized = await this.insertBoardIfMissing(client, boardId, initialSnapshot, initializedAt);
        if (initialized) {
          await this.replaceEntities(client, boardId, initialSnapshot);
          await this.insertAuditLog(
            client,
            boardId,
            'board_snapshot_saved',
            'board',
            boardId,
            createAuditPayload(initialSnapshot),
            initializedAt,
            {}
          );
        }
        row = await this.findBoardRow(boardId, client, true);
      }

      if (!row) throw new Error(`Traffic board ${boardId} could not be initialized.`);
      const currentSnapshot = await this.readNormalizedSnapshot(row, client) ?? this.readLegacySnapshot(row);
      if (!currentSnapshot) throw new Error(`Traffic board ${boardId} has no readable snapshot.`);

      const snapshot = update(currentSnapshot);
      const now = new Date().toISOString();
      const version = row.version + 1;
      await this.writeBoard(client, boardId, snapshot, now, version);
      await this.replaceEntities(client, boardId, snapshot);
      await this.insertAuditLog(
        client,
        boardId,
        action,
        'board',
        boardId,
        createAuditPayload(snapshot),
        now,
        auditContext
      );
      await client.query('COMMIT');

      return { boardId, snapshot, updatedAt: now, version };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listAuditLog(boardId: string): Promise<TrafficAuditLogEntry[]> {
    const { rows } = await this.pool.query<AuditLogRow>(
      `
        SELECT
          id,
          board_id,
          action,
          entity_type,
          entity_id,
          payload_json,
          actor_id,
          command_id,
          source_system,
          source_record_id,
          idempotency_key,
          diff_summary,
          created_at
        FROM traffic_audit_log
        WHERE board_id = $1
        ORDER BY id ASC
      `,
      [boardId]
    );

    return rows.map((row) => ({
      id: row.id,
      boardId: row.board_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: readJsonPayload<unknown>(row.payload_json),
      actorId: row.actor_id || undefined,
      commandId: row.command_id || undefined,
      sourceSystem: row.source_system || undefined,
      sourceRecordId: row.source_record_id || undefined,
      idempotencyKey: row.idempotency_key || undefined,
      diffSummary: row.diff_summary || undefined,
      createdAt: row.created_at,
    }));
  }

  async countEntityRows(tableName: TrafficEntityTable, boardId: string): Promise<number> {
    assertTrafficEntityTable(tableName);
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM ${tableName} WHERE board_id = $1`,
      [boardId]
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async findBoardRow(
    boardId: string,
    queryClient: QueryClient = this.pool,
    forUpdate = false
  ): Promise<TrafficBoardRow | null> {
    const { rows } = await queryClient.query<TrafficBoardRow>(
      `
        SELECT id, snapshot_json, schema_version, active_period_id, active_tile_unit_id, created_at, updated_at, version
        FROM traffic_boards
        WHERE id = $1
        ${forUpdate ? 'FOR UPDATE' : ''}
      `,
      [boardId]
    );

    return rows[0] ?? null;
  }

  private async hasNormalizedEntities(boardId: string, queryClient: QueryClient = this.pool) {
    return (
      (await this.countEntityRowsWithClient(queryClient, 'traffic_people', boardId)) > 0 ||
      (await this.countEntityRowsWithClient(queryClient, 'traffic_projects', boardId)) > 0
    );
  }

  private readLegacySnapshot(row: TrafficBoardRow): TrafficSnapshot | null {
    if (!row.snapshot_json) return null;
    return readJsonPayload<TrafficSnapshot>(row.snapshot_json);
  }

  private async readNormalizedSnapshot(
    row: TrafficBoardRow,
    queryClient: QueryClient = this.pool
  ): Promise<TrafficSnapshot | null> {
    if (!row.schema_version || !row.active_period_id || !row.active_tile_unit_id || !(await this.hasNormalizedEntities(row.id, queryClient))) {
      return null;
    }

    return {
      schemaVersion: row.schema_version,
      activePeriodId: row.active_period_id,
      activeTileUnitId: row.active_tile_unit_id,
      skills: await this.readPayloadRows<Skill>('traffic_skills', row.id, queryClient),
      periods: await this.readPayloadRows<Period>('traffic_periods', row.id, queryClient),
      tileUnits: await this.readPayloadRows<TileUnit>('traffic_tile_units', row.id, queryClient),
      people: await this.readPayloadRows<Person>('traffic_people', row.id, queryClient),
      projects: await this.readProjects(row.id, queryClient),
      allocations: await this.readPayloadRows<PersonTileAllocation>('traffic_allocations', row.id, queryClient),
      weeklyAllocations: await this.readPayloadRows<WeeklyAllocation>('traffic_weekly_allocations', row.id, queryClient),
      planningRules: await this.readPayloadRows<PlanningRule>('traffic_planning_rules', row.id, queryClient),
    };
  }

  private async readPayloadRows<T>(
    tableName: TrafficEntityTable,
    boardId: string,
    queryClient: QueryClient = this.pool
  ): Promise<T[]> {
    assertTrafficEntityTable(tableName);
    const { rows } = await queryClient.query<JsonPayloadRow>(
      `SELECT payload_json FROM ${tableName} WHERE board_id = $1 ORDER BY sort_order ASC`,
      [boardId]
    );

    return rows.map((row) => readJsonPayload<T>(row.payload_json));
  }

  private async readProjectChildPayloads<T>(
    tableName: 'traffic_project_requirements' | 'traffic_project_revenue_plans' | 'traffic_project_invoices',
    boardId: string,
    projectId: string,
    queryClient: QueryClient = this.pool
  ): Promise<T[]> {
    const { rows } = await queryClient.query<JsonPayloadRow>(
      `SELECT payload_json FROM ${tableName} WHERE board_id = $1 AND project_id = $2 ORDER BY sort_order ASC`,
      [boardId, projectId]
    );

    return rows.map((row) => readJsonPayload<T>(row.payload_json));
  }

  private async readProjects(boardId: string, queryClient: QueryClient = this.pool): Promise<ProjectFrame[]> {
    const projects = await this.readPayloadRows<ProjectEntity>('traffic_projects', boardId, queryClient);
    const projectFrames: ProjectFrame[] = [];
    for (const project of projects) {
      projectFrames.push({
        ...project,
        requirements: await this.readProjectChildPayloads<ProjectRequirement>('traffic_project_requirements', boardId, project.id, queryClient),
        revenuePlan: await this.readProjectChildPayloads<MonthlyRevenuePlan>('traffic_project_revenue_plans', boardId, project.id, queryClient),
        invoices: await this.readProjectChildPayloads<Invoice>('traffic_project_invoices', boardId, project.id, queryClient),
      });
    }
    return projectFrames;
  }

  private async countEntityRowsWithClient(
    queryClient: QueryClient,
    tableName: TrafficEntityTable,
    boardId: string
  ): Promise<number> {
    assertTrafficEntityTable(tableName);
    const { rows } = await queryClient.query<{ count: string }>(
      `SELECT count(*) AS count FROM ${tableName} WHERE board_id = $1`,
      [boardId]
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async writeBoard(
    client: PoolClient,
    boardId: string,
    snapshot: TrafficSnapshot,
    updatedAt: string,
    version: number
  ) {
    await client.query(
      `
        UPDATE traffic_boards SET
          snapshot_json = $2,
          schema_version = $3,
          active_period_id = $4,
          active_tile_unit_id = $5,
          updated_at = $6,
          version = $7
        WHERE id = $1
      `,
      [
        boardId,
        JSON.stringify(snapshot),
        snapshot.schemaVersion,
        snapshot.activePeriodId,
        snapshot.activeTileUnitId,
        updatedAt,
        version,
      ]
    );
  }

  private async insertBoardIfMissing(
    client: PoolClient,
    boardId: string,
    snapshot: TrafficSnapshot,
    now: string
  ): Promise<boolean> {
    const result = await client.query(
      `
        INSERT INTO traffic_boards (
          id, snapshot_json, schema_version, active_period_id, active_tile_unit_id, created_at, updated_at, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $6, 1)
        ON CONFLICT(id) DO NOTHING
      `,
      [
        boardId,
        JSON.stringify(snapshot),
        snapshot.schemaVersion,
        snapshot.activePeriodId,
        snapshot.activeTileUnitId,
        now,
      ]
    );
    return result.rowCount === 1;
  }

  private async replaceEntities(client: PoolClient, boardId: string, snapshot: TrafficSnapshot) {
    for (const tableName of trafficEntityTables) {
      await client.query(`DELETE FROM ${tableName} WHERE board_id = $1`, [boardId]);
    }

    await this.insertPayloadRows(client, 'traffic_skills', boardId, snapshot.skills);
    await this.insertPayloadRows(client, 'traffic_periods', boardId, snapshot.periods);
    await this.insertPayloadRows(client, 'traffic_tile_units', boardId, snapshot.tileUnits);
    await this.insertPayloadRows(client, 'traffic_people', boardId, snapshot.people);
    await this.insertProjects(client, boardId, snapshot.projects);
    await this.insertPayloadRows(client, 'traffic_allocations', boardId, snapshot.allocations);
    await this.insertPayloadRows(client, 'traffic_weekly_allocations', boardId, snapshot.weeklyAllocations || []);
    await this.insertPayloadRows(client, 'traffic_planning_rules', boardId, snapshot.planningRules || []);
  }

  private async insertPayloadRows<T extends { id: string }>(
    client: PoolClient,
    tableName:
      | 'traffic_skills'
      | 'traffic_periods'
      | 'traffic_tile_units'
      | 'traffic_people'
      | 'traffic_allocations'
      | 'traffic_weekly_allocations'
      | 'traffic_planning_rules',
    boardId: string,
    entities: T[]
  ) {
    for (const [index, entity] of entities.entries()) {
      await client.query(
        `INSERT INTO ${tableName} (board_id, id, sort_order, payload_json) VALUES ($1, $2, $3, $4)`,
        [boardId, entity.id, index, JSON.stringify(entity)]
      );
    }
  }

  private async insertProjects(client: PoolClient, boardId: string, projects: ProjectFrame[]) {
    for (const [projectIndex, project] of projects.entries()) {
      const { requirements, revenuePlan, invoices, ...projectEntity } = project;
      await client.query(
        'INSERT INTO traffic_projects (board_id, id, sort_order, payload_json) VALUES ($1, $2, $3, $4)',
        [boardId, project.id, projectIndex, JSON.stringify(projectEntity)]
      );

      for (const [index, requirement] of requirements.entries()) {
        await client.query(
          'INSERT INTO traffic_project_requirements (board_id, project_id, id, sort_order, payload_json) VALUES ($1, $2, $3, $4, $5)',
          [boardId, project.id, requirement.id, index, JSON.stringify(requirement)]
        );
      }

      for (const [index, plan] of revenuePlan.entries()) {
        await client.query(
          'INSERT INTO traffic_project_revenue_plans (board_id, project_id, period_id, sort_order, payload_json) VALUES ($1, $2, $3, $4, $5)',
          [boardId, project.id, plan.periodId, index, JSON.stringify(plan)]
        );
      }

      for (const [index, invoice] of invoices.entries()) {
        await client.query(
          'INSERT INTO traffic_project_invoices (board_id, project_id, id, sort_order, payload_json) VALUES ($1, $2, $3, $4, $5)',
          [boardId, project.id, invoice.id, index, JSON.stringify(invoice)]
        );
      }
    }
  }

  private async insertAuditLog(
    client: PoolClient,
    boardId: string,
    action: string,
    entityType: string,
    entityId: string,
    payload: unknown,
    createdAt: string,
    auditContext: TrafficAuditContext
  ) {
    await client.query(
      `
        INSERT INTO traffic_audit_log (
          board_id,
          action,
          entity_type,
          entity_id,
          payload_json,
          actor_id,
          command_id,
          source_system,
          source_record_id,
          idempotency_key,
          diff_summary,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        boardId,
        action,
        entityType,
        entityId,
        JSON.stringify(payload),
        auditContext.actorId,
        auditContext.commandId,
        auditContext.sourceSystem,
        auditContext.sourceRecordId,
        auditContext.idempotencyKey,
        auditContext.diffSummary,
        createdAt,
      ]
    );
  }
}

function readJsonPayload<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

function createAuditPayload(snapshot: TrafficSnapshot) {
  return {
    allocations: snapshot.allocations.length,
    planningRules: snapshot.planningRules?.length || 0,
    people: snapshot.people.length,
    projects: snapshot.projects.length,
    schemaVersion: snapshot.schemaVersion,
    weeklyAllocations: snapshot.weeklyAllocations?.length || 0,
  };
}

function assertTrafficEntityTable(tableName: TrafficEntityTable) {
  if (!trafficEntityTables.includes(tableName)) {
    throw new Error(`Unsupported traffic entity table: ${tableName}`);
  }
}
