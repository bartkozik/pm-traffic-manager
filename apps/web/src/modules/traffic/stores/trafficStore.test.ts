import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { TrafficBoardCommand } from '@ptm/domain';
import type { TrafficBoardRealtimeEvent } from '@ptm/contracts';
import { createPersonPairPlanningRule, createPersonPeriodAllocations, createSeedTrafficSnapshot, TrafficSnapshot } from '../models/traffic.model';
import { connectTrafficBoardRealtime, executeTrafficBoardCommand, loadTrafficBoardSnapshot } from '../services/trafficBoardApi';
import { createPersonDraft } from '../utils/trafficBoardDrafts';
import { useTrafficStore } from './trafficStore';

const websocketMock = vi.hoisted(() => {
  class MockWebsocketProvider {
    awareness: {
      clientID: number;
      getLocalState: () => Record<string, unknown> | null;
      setLocalState: (state: Record<string, unknown> | null) => void;
      getStates: () => Map<number, Record<string, unknown>>;
      on: () => void;
      off: () => void;
    };

    private handlers = new Map<string, Array<(value: unknown) => void>>();
    private localState: Record<string, unknown> | null = null;

    constructor(
      readonly wsUrl: string,
      readonly roomName: string,
      readonly doc: unknown
    ) {
      this.awareness = {
        clientID: 1,
        getLocalState: () => this.localState,
        setLocalState: (state) => {
          this.localState = state;
        },
        getStates: () => (this.localState ? new Map([[1, this.localState]]) : new Map()),
        on: () => undefined,
        off: () => undefined,
      };
    }

    on(eventName: string, callback: (value: unknown) => void) {
      this.handlers.set(eventName, [...(this.handlers.get(eventName) || []), callback]);
    }

    emit(eventName: string, value: unknown) {
      (this.handlers.get(eventName) || []).forEach((callback) => callback(value));
    }

    destroy() {
      this.handlers.clear();
      this.localState = null;
    }
  }

  const providers: MockWebsocketProvider[] = [];

  return {
    providers,
    WebsocketProvider: vi.fn((wsUrl: string, roomName: string, doc: unknown) => {
      const provider = new MockWebsocketProvider(wsUrl, roomName, doc);
      providers.push(provider);
      return provider;
    }),
  };
});

vi.mock('y-websocket', () => ({
  WebsocketProvider: websocketMock.WebsocketProvider,
}));

vi.mock('../services/trafficBoardApi', () => ({
  loadTrafficBoardSnapshot: vi.fn(),
  executeTrafficBoardCommand: vi.fn(),
  connectTrafficBoardRealtime: vi.fn(),
}));

const mockedLoadTrafficBoardSnapshot = vi.mocked(loadTrafficBoardSnapshot);
const mockedExecuteTrafficBoardCommand = vi.mocked(executeTrafficBoardCommand);
const mockedConnectTrafficBoardRealtime = vi.mocked(connectTrafficBoardRealtime);

const realtimeConnections: Array<{
  boardId: string;
  close: ReturnType<typeof vi.fn>;
  handlers: {
    onEvent: (event: TrafficBoardRealtimeEvent) => void;
    onError?: (error: Event) => void;
    onStatus?: (status: 'connecting' | 'connected' | 'disconnected') => void;
  };
}> = [];

function createDurableSnapshot(): TrafficSnapshot {
  const snapshot = createSeedTrafficSnapshot();
  const targetProjectId = snapshot.projects[0].id;
  return {
    ...snapshot,
    allocations: snapshot.allocations.map((allocation, index) => (
      index === 0
        ? { ...allocation, target: targetProjectId }
        : allocation
    )),
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('trafficStore durable persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    websocketMock.providers.length = 0;
    realtimeConnections.length = 0;
    mockedLoadTrafficBoardSnapshot.mockReset();
    mockedExecuteTrafficBoardCommand.mockReset();
    mockedConnectTrafficBoardRealtime.mockReset();
    mockedConnectTrafficBoardRealtime.mockImplementation((boardId, handlers) => {
      const close = vi.fn();
      realtimeConnections.push({ boardId, close, handlers });
      return {
        close,
        sendCommand: vi.fn(),
      };
    });
    mockedExecuteTrafficBoardCommand.mockImplementation(async (boardId, command) => ({
      boardId,
      snapshot: applyCommandForTest(createDurableSnapshot(), command),
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 2,
    }));
  });

  afterEach(() => {
    useTrafficStore.getState().cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('loads the API snapshot without saving it back during startup sync', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    expect(useTrafficStore.getState().durableLoadStatus).toBe('loaded');
    expect(useTrafficStore.getState().allocations[0].target).toBe(snapshot.projects[0].id);

    websocketMock.providers[0].emit('sync', true);
    await vi.advanceTimersByTimeAsync(800);
    await flushPromises();

    expect(mockedExecuteTrafficBoardCommand).not.toHaveBeenCalled();
  });

  it('preserves a valid active month from the API snapshot', async () => {
    const snapshot = {
      ...createDurableSnapshot(),
      activePeriodId: '2026-07',
    };
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    expect(useTrafficStore.getState().activePeriodId).toBe('2026-07');
    expect(mockedExecuteTrafficBoardCommand).not.toHaveBeenCalled();
  });

  it('keeps business board maps detached from the persisted websocket document', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    const provider = websocketMock.providers[0];
    const presenceDoc = provider.doc as Y.Doc;
    expect(provider.roomName).toBe('ptm-room:presence');
    expect(presenceDoc).not.toBe(useTrafficStore.getState().doc);

    presenceDoc.getMap('allocations').set(snapshot.allocations[0].id, {
      ...snapshot.allocations[0],
      target: 'bench',
    });
    provider.emit('sync', true);
    await vi.advanceTimersByTimeAsync(800);
    await flushPromises();

    expect(useTrafficStore.getState().allocations[0].target).toBe(snapshot.projects[0].id);
    expect(mockedExecuteTrafficBoardCommand).not.toHaveBeenCalled();
  });

  it('removes local awareness presence when publishing is disabled', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    const provider = websocketMock.providers[0];
    expect(provider.awareness.getLocalState()?.user).toBeDefined();

    useTrafficStore.getState().setCollaborationTrackingEnabled(false);
    expect(provider.awareness.getLocalState()).toBeNull();

    useTrafficStore.getState().setCollaborationView({ boardView: 'classic' });
    useTrafficStore.getState().setCollaborationUserName('Ukryty PM');
    expect(provider.awareness.getLocalState()).toBeNull();

    useTrafficStore.getState().setCollaborationTrackingEnabled(true);
    expect(provider.awareness.getLocalState()).toMatchObject({
      trackingEnabled: true,
      user: expect.objectContaining({ name: 'Ukryty PM' }),
    });
  });

  it('creates a person in an explicitly selected period without changing the board active period', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();
    mockedExecuteTrafficBoardCommand.mockClear();

    const personId = useTrafficStore.getState().createPerson('2026-07');
    const createdPerson = useTrafficStore.getState().people.find((person) => person.id === personId);

    expect(useTrafficStore.getState().activePeriodId).toBe(snapshot.activePeriodId);
    expect(createdPerson).toMatchObject({ initials: 'N5', skillIds: [] });
    expect(createdPerson?.seniority).toBeUndefined();
    expect(useTrafficStore.getState().allocations.some((allocation) => (
      allocation.personId === personId && allocation.periodId === '2026-07'
    ))).toBe(true);
    expect(mockedExecuteTrafficBoardCommand).toHaveBeenCalledWith(
      'ptm-room',
      expect.objectContaining({ type: 'person.create', periodId: '2026-07' })
    );
  });

  it('creates a saved person draft only after the editor submits it', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();
    mockedExecuteTrafficBoardCommand.mockClear();

    const draft = {
      ...createPersonDraft(snapshot.people.length + 1, { monthlyCostK: 9 }),
      name: 'Kasia Tester',
      initials: 'KT',
      skillIds: ['qa' as const],
    };
    const personId = useTrafficStore.getState().createPerson('2026-07', { person: draft });
    const createdPerson = useTrafficStore.getState().people.find((person) => person.id === personId);
    const createdAllocations = useTrafficStore.getState().allocations.filter((allocation) => (
      allocation.personId === personId && allocation.periodId === '2026-07'
    ));

    expect(createdPerson).toMatchObject({
      id: draft.id,
      name: 'Kasia Tester',
      initials: 'KT',
      monthlyCostK: 9,
      skillIds: ['qa'],
    });
    expect(createdAllocations).toHaveLength(9);
    expect(mockedExecuteTrafficBoardCommand).toHaveBeenCalledWith(
      'ptm-room',
      expect.objectContaining({
        type: 'person.create',
        person: expect.objectContaining({ id: draft.id, name: 'Kasia Tester' }),
        periodId: '2026-07',
      })
    );
  });

  it('restores an archived person through a backend command and fills visible month capacity', async () => {
    const baseSnapshot = createDurableSnapshot();
    const archivedPerson = {
      ...baseSnapshot.people[0],
      archivedAt: '2026-06-20T08:00:00.000Z',
    };
    const snapshot = {
      ...baseSnapshot,
      people: [archivedPerson, ...baseSnapshot.people.slice(1)],
      allocations: baseSnapshot.allocations.filter((allocation) => !(
        allocation.personId === archivedPerson.id && allocation.periodId === '2026-07'
      )),
    };
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();
    mockedExecuteTrafficBoardCommand.mockClear();

    useTrafficStore.getState().restorePerson(archivedPerson.id, ['2026-07']);

    expect(useTrafficStore.getState().people.find((person) => person.id === archivedPerson.id)?.archivedAt).toBeUndefined();
    expect(useTrafficStore.getState().allocations.some((allocation) => (
      allocation.personId === archivedPerson.id && allocation.periodId === '2026-07'
    ))).toBe(true);
    expect(mockedExecuteTrafficBoardCommand).toHaveBeenCalledWith(
      'ptm-room',
      { type: 'person.restore', personId: archivedPerson.id, periodIds: ['2026-07'] }
    );
  });

  it('persists local user changes through a backend command after the API snapshot has loaded', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    useTrafficStore.getState().setActiveTileUnit('money-2k');
    await flushPromises();

    expect(mockedExecuteTrafficBoardCommand).toHaveBeenCalledTimes(1);
    expect(mockedExecuteTrafficBoardCommand).toHaveBeenCalledWith(
      'ptm-room',
      { type: 'settings.setActiveTileUnit', tileUnitId: 'money-2k' }
    );
    expect(useTrafficStore.getState().activeTileUnitId).toBe('money-2k');
    expect(useTrafficStore.getState().durableVersion).toBe(2);
  });

  it('persists a new project draft with project.create instead of project.update', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();
    mockedExecuteTrafficBoardCommand.mockClear();

    const draftProject = {
      ...snapshot.projects[0],
      id: 'draft-project',
      client: 'Nowy klient',
      name: 'Nowy projekt',
    };
    useTrafficStore.getState().updateProject(draftProject);
    await flushPromises();

    expect(mockedExecuteTrafficBoardCommand).toHaveBeenCalledWith(
      'ptm-room',
      { type: 'project.create', project: draftProject }
    );
  });

  it('persists an existing project edit with project.update', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();
    mockedExecuteTrafficBoardCommand.mockClear();

    const editedProject = {
      ...snapshot.projects[0],
      name: 'Zmieniony zakres',
    };
    useTrafficStore.getState().updateProject(editedProject);
    await flushPromises();

    expect(mockedExecuteTrafficBoardCommand).toHaveBeenCalledWith(
      'ptm-room',
      { type: 'project.update', project: editedProject }
    );
  });

  it('shows planning rules optimistically after adding them', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();
    mockedExecuteTrafficBoardCommand.mockClear();

    const rule = createPersonPairPlanningRule({
      periodId: snapshot.activePeriodId,
      personAId: snapshot.people[0].id,
      personBId: snapshot.people[1].id,
      reason: 'Testowa reguła',
      now: '2026-06-11T09:00:00.000Z',
    });

    useTrafficStore.getState().upsertPlanningRules([rule]);

    expect(useTrafficStore.getState().planningRules).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: rule.id }),
    ]));
    expect(mockedExecuteTrafficBoardCommand).toHaveBeenCalledWith(
      'ptm-room',
      { type: 'planningRules.upsertMany', planningRules: [rule] }
    );
  });

  it('keeps the selected active month after backend command confirmation', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    useTrafficStore.getState().setActivePeriod('2026-07');
    await flushPromises();

    expect(mockedExecuteTrafficBoardCommand).toHaveBeenCalledWith(
      'ptm-room',
      { type: 'settings.setActivePeriod', periodId: '2026-07' }
    );
    expect(useTrafficStore.getState().activePeriodId).toBe('2026-07');
  });

  it('applies the canonical backend snapshot returned by a command', async () => {
    const snapshot = createDurableSnapshot();
    const currentSnapshot = {
      ...snapshot,
      activeTileUnitId: 'money-5k',
    };
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });
    mockedExecuteTrafficBoardCommand.mockResolvedValueOnce({
        boardId: 'ptm-room',
        snapshot: currentSnapshot,
        updatedAt: '2026-06-11T09:00:00.000Z',
        version: 2,
      });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    useTrafficStore.getState().setActiveTileUnit('money-2k');
    await flushPromises();

    expect(useTrafficStore.getState().activeTileUnitId).toBe('money-5k');
    expect(useTrafficStore.getState().durableUpdatedAt).toBe('2026-06-11T09:00:00.000Z');
    expect(useTrafficStore.getState().durableVersion).toBe(2);
  });

  it('does not autosave allocation moves handled by a backend command', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    useTrafficStore.getState().moveTilesToTargets([
      { tileId: snapshot.allocations[0].id, target: 'bench' },
    ], snapshot.activePeriodId, { persistDurably: false });
    await vi.advanceTimersByTimeAsync(800);
    await flushPromises();

    expect(useTrafficStore.getState().allocations[0].target).toBe('bench');
    expect(mockedExecuteTrafficBoardCommand).not.toHaveBeenCalled();
  });

  it('accepts backend snapshots without saving them back', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    useTrafficStore.getState().replaceBoardSnapshot({
      ...snapshot,
      activeTileUnitId: 'money-5k',
    }, '2026-06-11T09:00:00.000Z');
    await vi.advanceTimersByTimeAsync(800);
    await flushPromises();

    expect(useTrafficStore.getState().activeTileUnitId).toBe('money-5k');
    expect(useTrafficStore.getState().durableUpdatedAt).toBe('2026-06-11T09:00:00.000Z');
    expect(mockedExecuteTrafficBoardCommand).not.toHaveBeenCalled();
  });

  it('applies newer canonical snapshots received from the API realtime channel', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    realtimeConnections[0].handlers.onEvent({
      type: 'board.updated',
      action: 'active_tile_unit_changed',
      boardId: 'ptm-room',
      snapshot: {
        ...snapshot,
        activeTileUnitId: 'money-5k',
      },
      updatedAt: '2026-06-11T09:00:00.000Z',
      version: 2,
    });
    await flushPromises();

    expect(useTrafficStore.getState().activeTileUnitId).toBe('money-5k');
    expect(useTrafficStore.getState().durableVersion).toBe(2);
  });

  it('ignores same-version realtime snapshots after an optimistic month clear', async () => {
    const snapshot = createDurableSnapshot();
    mockedLoadTrafficBoardSnapshot.mockResolvedValue({
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:00.000Z',
      version: 1,
    });

    useTrafficStore.getState().initializeBoard('ptm-room');
    await flushPromises();

    useTrafficStore.getState().applyBoardCommand(
      { type: 'period.clearMonthPlan', periodId: snapshot.activePeriodId },
      { persistDurably: false }
    );
    await flushPromises();

    expect(useTrafficStore.getState().people.every((person) => (
      person.archivedAt || person.hiddenPeriodIds?.includes(snapshot.activePeriodId)
    ))).toBe(true);
    expect(useTrafficStore.getState().allocations.some((allocation) => (
      allocation.periodId === snapshot.activePeriodId
    ))).toBe(false);

    realtimeConnections[0].handlers.onEvent({
      type: 'board.updated',
      action: 'duplicate_snapshot',
      boardId: 'ptm-room',
      snapshot,
      updatedAt: '2026-06-11T08:00:01.000Z',
      version: 1,
    });
    await flushPromises();

    expect(useTrafficStore.getState().people.every((person) => (
      person.archivedAt || person.hiddenPeriodIds?.includes(snapshot.activePeriodId)
    ))).toBe(true);
    expect(useTrafficStore.getState().allocations.some((allocation) => (
      allocation.periodId === snapshot.activePeriodId
    ))).toBe(false);
    expect(useTrafficStore.getState().durableVersion).toBe(1);
  });
});

function applyCommandForTest(snapshot: TrafficSnapshot, command: TrafficBoardCommand): TrafficSnapshot {
  if (command.type === 'settings.setActiveTileUnit') {
    return { ...snapshot, activeTileUnitId: command.tileUnitId };
  }
  if (command.type === 'settings.setActivePeriod') {
    return { ...snapshot, activePeriodId: command.periodId };
  }
  if (command.type === 'planningRules.upsertMany') {
    const currentRules = snapshot.planningRules || [];
    const nextRulesById = new Map(currentRules.map((rule) => [rule.id, rule]));
    command.planningRules.forEach((rule) => nextRulesById.set(rule.id, rule));
    return { ...snapshot, planningRules: Array.from(nextRulesById.values()) };
  }
  if (command.type === 'planningRules.delete') {
    return {
      ...snapshot,
      planningRules: (snapshot.planningRules || []).filter((rule) => rule.id !== command.planningRuleId),
    };
  }
  if (command.type === 'person.restore') {
    const restoredPeople = snapshot.people.map((person) => {
      if (person.id !== command.personId) return person;
      const restoredPerson = { ...person };
      delete restoredPerson.archivedAt;
      return restoredPerson;
    });
    const restoredPerson = restoredPeople.find((person) => person.id === command.personId);
    const existingAllocationIds = new Set(snapshot.allocations.map((allocation) => allocation.id));
    const periodIds = Array.from(new Set(command.periodIds || [snapshot.activePeriodId]));
    const missingAllocations = restoredPerson
      ? periodIds
        .filter((periodId) => snapshot.periods.some((period) => period.id === periodId && period.granularity === 'month'))
        .filter((periodId) => !snapshot.allocations.some((allocation) => (
          allocation.personId === command.personId && allocation.periodId === periodId
        )))
        .flatMap((periodId) => createPersonPeriodAllocations(restoredPerson, periodId))
        .filter((allocation) => !existingAllocationIds.has(allocation.id))
      : [];
    return {
      ...snapshot,
      people: restoredPeople,
      allocations: [...snapshot.allocations, ...missingAllocations],
    };
  }
  return snapshot;
}
