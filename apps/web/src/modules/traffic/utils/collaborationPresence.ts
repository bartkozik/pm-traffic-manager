export type CollaborationTargetType = 'project' | 'person' | 'allocation' | 'section' | 'control';

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

export type CollaborationBoardView = 'classic' | 'diablo' | 'analytic';

export interface CollaborationCursor {
  x?: number;
  y?: number;
  target?: CollaborationTarget | null;
  relativeX?: number;
  relativeY?: number;
}

export interface CollaborationTarget {
  type: CollaborationTargetType;
  id: string;
  label?: string;
}

export interface CollaborationViewState {
  boardView?: CollaborationBoardView;
  boardViewLabel?: string;
  activePeriodId?: string;
  activePeriodLabel?: string;
  lens?: string;
  lensLabel?: string;
  revenueView?: string;
  revenueViewLabel?: string;
  focusMode?: string;
  focusModeLabel?: string;
}

export type CollaborationActionType = 'click' | 'edit' | 'open' | 'close' | 'drag';

export interface CollaborationAction {
  type: CollaborationActionType;
  label: string;
  target?: CollaborationTarget | null;
  at: number;
}

export interface CollaborationPresenceState {
  user?: CollaborationUser;
  cursor?: CollaborationCursor | null;
  activeTarget?: CollaborationTarget | null;
  editingTarget?: CollaborationTarget | null;
  view?: CollaborationViewState;
  action?: CollaborationAction | null;
  trackingEnabled?: boolean;
  lastSeenAt?: number;
}

export interface CollaborationPeer extends CollaborationPresenceState {
  clientId: number;
  user: CollaborationUser;
}

const storageKey = 'ptm-collaboration-user';
const trackingEnabledStorageKey = 'ptm-collaboration-tracking-enabled';
const followedUserStorageKey = 'ptm-collaboration-followed-user-id';
const userColors = [
  '#2563eb',
  '#16a34a',
  '#9333ea',
  '#0891b2',
  '#4f46e5',
  '#0d9488',
  '#ca8a04',
  '#c026d3',
  '#0284c7',
  '#65a30d',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#64748b',
];

function hashString(value: string) {
  return Array.from(value).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function createUserId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `user-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

export function sanitizeCollaborationUserName(value: string) {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, 32) || 'Planner';
}

export function getCollaborationColor(seed: string) {
  return userColors[Math.abs(hashString(seed)) % userColors.length];
}

export function getStoredCollaborationUser(storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage): CollaborationUser {
  if (storage) {
    try {
      const parsed = JSON.parse(storage.getItem(storageKey) || '') as Partial<CollaborationUser>;
      if (parsed.id && parsed.name && parsed.color) {
        return {
          id: parsed.id,
          name: sanitizeCollaborationUserName(parsed.name),
          color: parsed.color,
        };
      }
    } catch {
      // Ignore invalid local state and regenerate a small anonymous identity.
    }
  }

  const id = createUserId();
  const user = {
    id,
    name: 'Planner',
    color: getCollaborationColor(id),
  };
  persistCollaborationUser(user, storage);
  return user;
}

export function persistCollaborationUser(
  user: CollaborationUser,
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage
) {
  storage?.setItem(storageKey, JSON.stringify(user));
}

export function getStoredCollaborationTrackingEnabled(
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage
) {
  return storage?.getItem(trackingEnabledStorageKey) !== 'false';
}

export function persistCollaborationTrackingEnabled(
  enabled: boolean,
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage
) {
  storage?.setItem(trackingEnabledStorageKey, String(enabled));
}

export function getStoredFollowedCollaborationUserId(
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage
) {
  return storage?.getItem(followedUserStorageKey) || null;
}

export function persistFollowedCollaborationUserId(
  userId: string | null,
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage
) {
  if (!storage) return;
  if (userId) {
    storage.setItem(followedUserStorageKey, userId);
    return;
  }
  storage.removeItem(followedUserStorageKey);
}

export function updateCollaborationUserName(user: CollaborationUser, name: string): CollaborationUser {
  return {
    ...user,
    name: sanitizeCollaborationUserName(name),
  };
}

export function isSameCollaborationTarget(left?: CollaborationTarget | null, right?: CollaborationTarget | null) {
  return Boolean(left && right && left.type === right.type && left.id === right.id);
}

export function getCollaborationTargetKey(target: CollaborationTarget) {
  return `${target.type}:${target.id}`;
}

export function filterCollaborationPeersForBoardView(
  peers: CollaborationPeer[],
  boardView: CollaborationBoardView,
  activePeriodId?: string
) {
  return peers.filter((peer) => (
    peer.view?.boardView === boardView &&
    (!activePeriodId || peer.view.activePeriodId === activePeriodId)
  ));
}

export function getVisibleCollaborationPeersForBoardView(
  peers: CollaborationPeer[],
  boardView: CollaborationBoardView,
  activePeriodId: string | undefined,
  followedUserId: string | null,
  localEditingTarget: CollaborationTarget | null
) {
  const sameBoardPeers = filterCollaborationPeersForBoardView(peers, boardView, activePeriodId);
  if (!followedUserId) return sameBoardPeers;

  const visiblePeers = sameBoardPeers.filter((peer) => peer.user.id === followedUserId);
  const conflictPeers = localEditingTarget
    ? sameBoardPeers.filter((peer) => (
      peer.user.id !== followedUserId &&
      peer.trackingEnabled !== false &&
      isSameCollaborationTarget(peer.editingTarget, localEditingTarget)
    ))
    : [];

  return [...visiblePeers, ...conflictPeers];
}

export function getCollaborationTargetLabel(target: CollaborationTarget) {
  if (target.label) return target.label;
  switch (target.type) {
    case 'project':
      return `Project ${target.id}`;
    case 'person':
      return `Person ${target.id}`;
    case 'allocation':
      return `Allocation ${target.id}`;
    case 'section':
      return `Section ${target.id}`;
    case 'control':
      return `Action ${target.id}`;
  }
}
