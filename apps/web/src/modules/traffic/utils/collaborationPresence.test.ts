import { describe, expect, it } from 'vitest';
import {
  filterCollaborationPeersForBoardView,
  getCollaborationColor,
  getCollaborationTargetKey,
  getCollaborationTargetLabel,
  getVisibleCollaborationPeersForBoardView,
  getStoredCollaborationTrackingEnabled,
  getStoredFollowedCollaborationUserId,
  getStoredCollaborationUser,
  isSameCollaborationTarget,
  persistCollaborationTrackingEnabled,
  persistFollowedCollaborationUserId,
  sanitizeCollaborationUserName,
  updateCollaborationUserName,
} from './collaborationPresence';
import type { CollaborationPeer } from './collaborationPresence';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('collaborationPresence', () => {
  it('sanitizes user names for compact presence chips', () => {
    expect(sanitizeCollaborationUserName('  Ala   PM  ')).toBe('Ala PM');
    expect(sanitizeCollaborationUserName('')).toBe('Planner');
    expect(sanitizeCollaborationUserName('x'.repeat(40))).toHaveLength(32);
  });

  it('keeps local identity stable in storage', () => {
    const storage = new MemoryStorage();
    const first = getStoredCollaborationUser(storage);
    const second = getStoredCollaborationUser(storage);

    expect(second).toEqual(first);
    expect(first.color).toBe(getCollaborationColor(first.id));
  });

  it('updates only the visible collaboration user name', () => {
    const user = { id: 'u1', name: 'Planner', color: '#2563eb' };

    expect(updateCollaborationUserName(user, '  Kasia  ')).toEqual({
      ...user,
      name: 'Kasia',
    });
  });

  it('compares targets by type and id', () => {
    expect(isSameCollaborationTarget(
      { type: 'project', id: 'p1' },
      { type: 'project', id: 'p1', label: 'Projekt' }
    )).toBe(true);
    expect(isSameCollaborationTarget(
      { type: 'project', id: 'p1' },
      { type: 'allocation', id: 'p1' }
    )).toBe(false);
    expect(getCollaborationTargetKey({ type: 'person', id: 'anna' })).toBe('person:anna');
    expect(getCollaborationTargetLabel({ type: 'section', id: 'traffic-review', label: 'Traffic review' })).toBe('Traffic review');
  });

  it('filters tracked collaborators to the active board view', () => {
    const classicPeer: CollaborationPeer = {
      clientId: 1,
      user: { id: 'classic-user', name: 'Classic PM', color: '#2563eb' },
      view: { boardView: 'classic', activePeriodId: '2026-06' },
    };
    const diabloPeer: CollaborationPeer = {
      clientId: 2,
      user: { id: 'diablo-user', name: 'Diablo PM', color: '#16a34a' },
      cursor: { x: 100, y: 120 },
      view: { boardView: 'diablo', activePeriodId: '2026-06' },
    };
    const legacyPeer: CollaborationPeer = {
      clientId: 3,
      user: { id: 'legacy-user', name: 'Legacy PM', color: '#dc2626' },
    };
    const otherMonthPeer: CollaborationPeer = {
      clientId: 5,
      user: { id: 'other-month-user', name: 'Other Month PM', color: '#0891b2' },
      view: { boardView: 'diablo', activePeriodId: '2026-07' },
    };
    const sameTargetPeer: CollaborationPeer = {
      clientId: 4,
      user: { id: 'same-target-user', name: 'Same Target PM', color: '#9333ea' },
      editingTarget: { type: 'project', id: 'project-1' },
      view: { boardView: 'diablo', activePeriodId: '2026-06' },
    };

    expect(filterCollaborationPeersForBoardView(
      [classicPeer, diabloPeer, legacyPeer, otherMonthPeer, sameTargetPeer],
      'diablo',
      '2026-06'
    ).map((peer) => peer.user.id)).toEqual(['diablo-user', 'same-target-user']);
    expect(getVisibleCollaborationPeersForBoardView(
      [classicPeer, diabloPeer, otherMonthPeer, sameTargetPeer],
      'diablo',
      '2026-06',
      'diablo-user',
      { type: 'project', id: 'project-1' }
    ).map((peer) => peer.user.id)).toEqual(['diablo-user', 'same-target-user']);
  });

  it('persists local tracking preferences', () => {
    const storage = new MemoryStorage();

    expect(getStoredCollaborationTrackingEnabled(storage)).toBe(true);
    persistCollaborationTrackingEnabled(false, storage);
    expect(getStoredCollaborationTrackingEnabled(storage)).toBe(false);
    persistCollaborationTrackingEnabled(true, storage);
    expect(getStoredCollaborationTrackingEnabled(storage)).toBe(true);
  });

  it('persists the followed collaboration user', () => {
    const storage = new MemoryStorage();

    expect(getStoredFollowedCollaborationUserId(storage)).toBeNull();
    persistFollowedCollaborationUserId('peer-1', storage);
    expect(getStoredFollowedCollaborationUserId(storage)).toBe('peer-1');
    persistFollowedCollaborationUserId(null, storage);
    expect(getStoredFollowedCollaborationUserId(storage)).toBeNull();
  });
});
