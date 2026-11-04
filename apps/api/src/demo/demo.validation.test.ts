import { afterEach, describe, expect, it, vi } from 'vitest';
import * as domain from '@ptm/domain';
import { createDemoSnapshot } from './demo.seed.js';
import { validateDemoCommand, validateDemoSnapshot } from './demo.validation.js';
import { TrafficBoardService } from '../traffic/services/trafficBoard.service.js';
import type { TrafficBoardRepository } from '../traffic/repositories/trafficBoard.repository.js';

afterEach(() => vi.restoreAllMocks());

describe('demo computation bounds', () => {
  it('accepts the synthetic seed and ordinary person changes', () => {
    const snapshot = createDemoSnapshot();
    expect(() => validateDemoSnapshot(snapshot)).not.toThrow();
    expect(() => validateDemoCommand(snapshot, { type: 'person.update', person: { ...snapshot.people[0], name: 'Renamed' }, activePeriodId: snapshot.activePeriodId })).not.toThrow();
  });

  it('rejects dangerous person changes before the domain allocator runs', async () => {
    const snapshot = createDemoSnapshot();
    const apply = vi.spyOn(domain, 'applyTrafficBoardCommand');
    const repository = {
      validateCommand: validateDemoCommand,
      updateAtomically: async (_id: string, _seed: domain.TrafficSnapshot, update: (value: domain.TrafficSnapshot) => domain.TrafficSnapshot) => ({ boardId: 'test', snapshot: update(snapshot), updatedAt: new Date().toISOString(), version: 1 }),
    } as unknown as TrafficBoardRepository;
    const service = new TrafficBoardService(repository);
    await expect(service.executeCommand('test', { type: 'person.create', person: { ...snapshot.people[0], id: 'new', monthlyCostK: 101 }, periodId: snapshot.activePeriodId })).rejects.toMatchObject({ code: 'DEMO_BOARD_LIMIT' });
    expect(apply).not.toHaveBeenCalled();
  });

  it('checks nested monthly profiles and derived hourly costs', () => {
    const snapshot = createDemoSnapshot();
    const person = structuredClone(snapshot.people[0]);
    person.monthlyOverrides = [{ periodId: snapshot.activePeriodId, profile: { ...person, monthlyCostK: 101 } }];
    expect(() => validateDemoCommand(snapshot, { type: 'person.update', person, activePeriodId: snapshot.activePeriodId })).toThrow('demo board limits');
    person.monthlyOverrides = [{ periodId: snapshot.activePeriodId, availableHours: 320, internalHourlyCostPln: 1000 }];
    person.costModel.type = 'hourly';
    expect(() => validateDemoCommand(snapshot, { type: 'person.create', person, periodId: snapshot.activePeriodId })).toThrow('demo board limits');
  });

  it('checks copied monthly overrides before allocation generation', () => {
    const snapshot = createDemoSnapshot();
    expect(() => validateDemoCommand(snapshot, { type: 'period.pasteMonthPlan', targetPeriodId: snapshot.activePeriodId, mode: 'people_with_allocations', people: [{ personId: snapshot.people[0].id, monthlyOverride: { periodId: snapshot.activePeriodId, fixedMonthlyCostK: 101 } }], projects: [], allocations: [] })).toThrow('demo board limits');
  });

  it('rejects duplicated copied people before the domain uses the last override', () => {
    const snapshot = createDemoSnapshot();
    const personId = snapshot.people[0].id;
    expect(() => validateDemoCommand(snapshot, { type: 'period.pasteMonthPlan', targetPeriodId: snapshot.activePeriodId, mode: 'people_with_allocations', people: [{ personId }, { personId, monthlyOverride: { periodId: snapshot.activePeriodId, fixedMonthlyCostK: 101 } }], projects: [], allocations: [] })).toThrow('demo board limits');
  });

  it('validates overrides even for copied people absent from the board', () => {
    const snapshot = createDemoSnapshot();
    expect(() => validateDemoCommand(snapshot, { type: 'period.pasteMonthPlan', targetPeriodId: snapshot.activePeriodId, mode: 'people_with_allocations', people: [{ personId: 'unknown', monthlyOverride: { periodId: snapshot.activePeriodId, fixedMonthlyCostK: 101 } }], projects: [], allocations: [] })).toThrow('demo board limits');
  });

  it('rejects duplicated copied project IDs and imported person IDs', () => {
    const snapshot = createDemoSnapshot();
    const projectId = snapshot.projects[0].id;
    expect(() => validateDemoCommand(snapshot, { type: 'period.pasteMonthPlan', targetPeriodId: snapshot.activePeriodId, mode: 'projects_without_allocations', people: [], projects: [{ projectId }, { projectId }], allocations: [] })).toThrow('demo board limits');
    snapshot.people.push(structuredClone(snapshot.people[0]));
    expect(() => validateDemoSnapshot(snapshot)).toThrow('demo board limits');
  });

  it('rejects duplicated monthly override periods', () => {
    const snapshot = createDemoSnapshot();
    snapshot.people[0].monthlyOverrides = [{ periodId: snapshot.activePeriodId, fixedMonthlyCostK: 20 }, { periodId: snapshot.activePeriodId, fixedMonthlyCostK: 30 }];
    expect(() => validateDemoSnapshot(snapshot)).toThrow('demo board limits');
  });

  it('bounds month expansion and aggregate generated tile counts', () => {
    const snapshot = createDemoSnapshot();
    expect(() => validateDemoCommand(snapshot, { type: 'period.ensureRange', fromPeriodId: snapshot.activePeriodId, monthCount: 7 })).toThrow('demo board limits');
    snapshot.people = Array.from({ length: 24 }, (_, index) => ({ ...snapshot.people[0], id: String(index), monthlyCostK: 100 }));
    expect(() => validateDemoSnapshot(snapshot)).toThrow('demo board limits');
  });

  it('rejects huge date spans and deeply nested imported data', () => {
    const snapshot = createDemoSnapshot();
    snapshot.periods[0].endsOn = '9999-12-31';
    expect(() => validateDemoSnapshot(snapshot)).toThrow('demo board limits');
    const other = createDemoSnapshot();
    let nested: Record<string, unknown> = {};
    for (let index = 0; index < 20; index += 1) nested = { child: nested };
    Object.assign(other, { extra: nested });
    expect(() => validateDemoSnapshot(other)).toThrow('demo board limits');
  });

  it('rejects oversized numeric fields and oversized collection counts', () => {
    const snapshot = createDemoSnapshot();
    snapshot.projects[0].budgetK = 1000001;
    expect(() => validateDemoSnapshot(snapshot)).toThrow('demo board limits');
    const other = createDemoSnapshot();
    other.people = Array.from({ length: 25 }, (_, index) => ({ ...other.people[0], id: String(index) }));
    expect(() => validateDemoSnapshot(other)).toThrow('demo board limits');
  });
});
