import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import './CollaborationPresence.css';
import {
  CollaborationPeer,
  CollaborationTarget,
  CollaborationUser,
  getCollaborationTargetLabel,
  isSameCollaborationTarget,
} from '../utils/collaborationPresence';

interface CollaborationPresencePanelProps {
  user: CollaborationUser;
  peers: CollaborationPeer[];
  isOnline: boolean;
  trackingEnabled: boolean;
  followedUserId: string | null;
  onUserNameChange: (name: string) => void;
  onTrackingEnabledChange: (enabled: boolean) => void;
  onFollowedUserIdChange: (userId: string | null) => void;
}

interface CollaborationPresenceLayerProps {
  peers: CollaborationPeer[];
  localEditingTarget: CollaborationTarget | null;
}

interface TargetOverlay {
  key: string;
  peer: CollaborationPeer;
  target: CollaborationTarget;
  rect: DOMRect;
  kind: 'active' | 'editing';
  isConflict: boolean;
}

interface CursorOverlay {
  key: string;
  peer: CollaborationPeer;
  target?: CollaborationTarget | null;
  x: number;
  y: number;
}

interface PresenceLayout {
  cursors: CursorOverlay[];
  targets: TargetOverlay[];
}

type PresenceStyle = CSSProperties & {
  '--traffic-presence-color': string;
};

export function CollaborationPresencePanel({
  user,
  peers,
  isOnline,
  trackingEnabled,
  followedUserId,
  onUserNameChange,
  onTrackingEnabledChange,
  onFollowedUserIdChange,
}: CollaborationPresencePanelProps) {
  const followedPeer = followedUserId ? peers.find((peer) => peer.user.id === followedUserId) : null;
  const visiblePeers = peers.slice(0, 3);
  const hiddenPeerCount = peers.length - visiblePeers.length;
  const hasVisiblePeers = isOnline && peers.length > 0;
  const isOffline = !isOnline;
  const latestPeerAction = getLatestPeerAction(peers);

  return (
    <div
      className={`traffic-presence-panel ${isOffline ? 'is-disabled' : ''}`}
      aria-label="Active board users"
    >
      <div className="traffic-presence-self" title="Your local collaboration identity">
        <span className="traffic-presence-avatar" style={{ '--traffic-presence-color': user.color } as PresenceStyle}>
          {getInitials(user.name)}
        </span>
        <input
          aria-label="Your name shown to other users"
          value={user.name}
          onChange={(event) => onUserNameChange(event.target.value)}
        />
      </div>
      <div className="traffic-presence-controls">
        <button
          aria-checked={trackingEnabled}
          aria-label="Share my presence and activity with others"
          className="traffic-presence-toggle"
          role="switch"
          title="When disabled, you disappear from the active users list and others cannot follow your cursor, view or edits."
          type="button"
          onClick={() => onTrackingEnabledChange(!trackingEnabled)}
        >
          <span className="traffic-presence-switch" aria-hidden="true" />
          <span>Share</span>
        </button>
        <select
          aria-label="Who to follow on the board"
          disabled={!hasVisiblePeers}
          value={followedUserId || 'all'}
          onChange={(event) => onFollowedUserIdChange(event.target.value === 'all' ? null : event.target.value)}
        >
          <option value="all">Everyone</option>
          {followedUserId && !followedPeer ? (
            <option value={followedUserId}>Selected user unavailable</option>
          ) : null}
          {peers.map((peer) => (
            <option key={peer.clientId} value={peer.user.id}>
              {peer.user.name}
            </option>
          ))}
        </select>
      </div>
      <div className="traffic-presence-peers" title={isOnline ? 'People present in this room' : 'Presence is available when connected'}>
        {visiblePeers.length ? visiblePeers.map((peer) => (
          <span
            className="traffic-presence-avatar"
            key={peer.clientId}
            style={{ '--traffic-presence-color': peer.user.color } as PresenceStyle}
            title={peer.user.name}
          >
            {getInitials(peer.user.name)}
          </span>
        )) : (
          <span className="traffic-presence-empty">{isOnline ? 'Just you' : 'Offline'}</span>
        )}
        {hiddenPeerCount > 0 ? <span className="traffic-presence-more">+{hiddenPeerCount}</span> : null}
      </div>
      {latestPeerAction ? (
        <div className="traffic-presence-activity" title={`${latestPeerAction.user.name}: ${latestPeerAction.action!.label}`}>
          <strong>{latestPeerAction.user.name}</strong>
          <span>{latestPeerAction.action!.label}</span>
        </div>
      ) : null}
    </div>
  );
}

export function CollaborationPresenceLayer({ peers, localEditingTarget }: CollaborationPresenceLayerProps) {
  const [layout, setLayout] = useState<PresenceLayout>({ cursors: [], targets: [] });

  useEffect(() => {
    const updateLayout = () => {
      const nextLayout = peers.reduce<PresenceLayout>((result, peer) => {
        if (peer.trackingEnabled === false) return result;
        const targetOverlays = [
          peer.activeTarget ? createTargetOverlay(peer, peer.activeTarget, 'active', localEditingTarget) : null,
          peer.editingTarget ? createTargetOverlay(peer, peer.editingTarget, 'editing', localEditingTarget) : null,
        ].filter((item): item is TargetOverlay => Boolean(item));
        const cursorOverlay = createCursorOverlay(peer);
        result.targets.push(...targetOverlays);
        if (cursorOverlay) result.cursors.push(cursorOverlay);
        return result;
      }, { cursors: [], targets: [] });
      setLayout(nextLayout);
    };

    updateLayout();
    const intervalId = window.setInterval(updateLayout, 300);
    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout, true);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout, true);
    };
  }, [localEditingTarget, peers]);

  const conflictPeers = useMemo(() => (
    localEditingTarget
      ? peers.filter((peer) => peer.trackingEnabled !== false && isSameCollaborationTarget(peer.editingTarget, localEditingTarget))
      : []
  ), [localEditingTarget, peers]);

  return (
    <div className="traffic-presence-layer" aria-hidden="true">
      {layout.targets.map((overlay) => (
        <div
          className={`traffic-presence-target is-${overlay.kind} ${overlay.isConflict ? 'is-conflict' : ''}`}
          key={overlay.key}
          style={{
            '--traffic-presence-color': overlay.peer.user.color,
            left: overlay.rect.left,
            top: overlay.rect.top,
            width: overlay.rect.width,
            height: overlay.rect.height,
          } as PresenceStyle}
        >
          <span>
            {overlay.peer.user.name}
            {overlay.kind === 'editing' ? ' editing' : ' viewing'}
          </span>
        </div>
      ))}
      {layout.cursors.map((cursor) => (
        <div
          className="traffic-remote-cursor"
          key={cursor.key}
          style={{
            '--traffic-presence-color': cursor.peer.user.color,
            left: cursor.x,
            top: cursor.y,
          } as PresenceStyle}
        >
          <span className="traffic-remote-cursor-pointer" />
          <span className="traffic-remote-cursor-label">
            {cursor.peer.user.name}
            {cursor.target ? ` · ${getCollaborationTargetLabel(cursor.target)}` : ''}
          </span>
        </div>
      ))}
      {conflictPeers.length ? (
        <div className="traffic-presence-conflict">
          <strong>Simultaneous editing</strong>
          <span>
            {conflictPeers.map((peer) => peer.user.name).join(', ')} is also editing {getCollaborationTargetLabel(localEditingTarget!)}.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function createTargetOverlay(
  peer: CollaborationPeer,
  target: CollaborationTarget,
  kind: 'active' | 'editing',
  localEditingTarget: CollaborationTarget | null
): TargetOverlay | null {
  const element = findTargetElement(target);
  if (!element) return null;
  return {
    key: `${peer.clientId}:${kind}:${target.type}:${target.id}`,
    peer,
    target,
    kind,
    rect: element.getBoundingClientRect(),
    isConflict: kind === 'editing' && isSameCollaborationTarget(target, localEditingTarget),
  };
}

function createCursorOverlay(peer: CollaborationPeer): CursorOverlay | null {
  if (peer.trackingEnabled === false) return null;
  const cursor = peer.cursor;
  if (!cursor) return null;

  if (cursor.target && typeof cursor.relativeX === 'number' && typeof cursor.relativeY === 'number') {
    const element = findTargetElement(cursor.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      return {
        key: `cursor-${peer.clientId}`,
        peer,
        target: cursor.target,
        x: Math.round(rect.left + clampUnit(cursor.relativeX) * rect.width),
        y: Math.round(rect.top + clampUnit(cursor.relativeY) * rect.height),
      };
    }
  }

  if (typeof cursor.x === 'number' && typeof cursor.y === 'number') {
    return {
      key: `cursor-${peer.clientId}`,
      peer,
      target: cursor.target,
      x: cursor.x,
      y: cursor.y,
    };
  }

  return null;
}

function findTargetElement(target: CollaborationTarget) {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-collaboration-target-type]')).find((element) => (
    element.dataset.collaborationTargetType === target.type && element.dataset.collaborationTargetId === target.id
  ));
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getLatestPeerAction(peers: CollaborationPeer[]) {
  return peers
    .filter((peer) => peer.trackingEnabled !== false && peer.action)
    .sort((first, second) => (second.action?.at || 0) - (first.action?.at || 0))[0];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'P') + (parts[1]?.[0] || '');
}
