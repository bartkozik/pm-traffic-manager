import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { initializePostgresDatabase } from '../../db/postgres.js';
import { TrafficBoardService } from '../services/trafficBoard.service.js';
import { PostgresTrafficBoardRepository } from './postgresTrafficBoard.repository.js';

const databaseUrl = process.env.PTM_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PostgresTrafficBoardRepository concurrency', () => {
  const boardId = `concurrency-${crypto.randomUUID()}`;
  const newBoardId = `concurrency-new-${crypto.randomUUID()}`;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await initializePostgresDatabase(pool);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM traffic_boards WHERE id = ANY($1)', [[boardId, newBoardId]]);
    await pool.end();
  });

  it('preserves concurrent commands executed through independent repositories', async () => {
    const firstService = new TrafficBoardService(new PostgresTrafficBoardRepository(pool));
    const secondService = new TrafficBoardService(new PostgresTrafficBoardRepository(pool));
    const initial = await firstService.getOrCreate(boardId);
    const nextPeriod = initial.snapshot.periods.find((period) => (
      period.granularity === 'month' && period.id !== initial.snapshot.activePeriodId
    ));

    if (!nextPeriod) throw new Error('Seed data is missing a second month period.');

    await Promise.all([
      firstService.executeCommand(boardId, {
        type: 'settings.setActiveTileUnit',
        tileUnitId: 'money-5k',
      }),
      secondService.executeCommand(boardId, {
        type: 'settings.setActivePeriod',
        periodId: nextPeriod.id,
      }),
    ]);

    const loaded = await firstService.getOrCreate(boardId);
    expect(loaded.snapshot.activeTileUnitId).toBe('money-5k');
    expect(loaded.snapshot.activePeriodId).toBe(nextPeriod.id);
    expect(loaded.version).toBe(initial.version + 2);
  });

  it('preserves concurrent first commands while initializing a missing board', async () => {
    const firstService = new TrafficBoardService(new PostgresTrafficBoardRepository(pool));
    const secondService = new TrafficBoardService(new PostgresTrafficBoardRepository(pool));

    await Promise.all([
      firstService.executeCommand(newBoardId, {
        type: 'settings.setActiveTileUnit',
        tileUnitId: 'money-5k',
      }),
      secondService.executeCommand(newBoardId, {
        type: 'settings.setActivePeriod',
        periodId: '2026-07',
      }),
    ]);

    const loaded = await firstService.getOrCreate(newBoardId);
    expect(loaded.snapshot.activeTileUnitId).toBe('money-5k');
    expect(loaded.snapshot.activePeriodId).toBe('2026-07');
    expect(loaded.version).toBe(3);
  });
});
