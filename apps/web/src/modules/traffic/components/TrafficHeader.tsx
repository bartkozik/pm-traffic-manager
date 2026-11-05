import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { RevenueView } from '../models/traffic.model';
import type { CollaborationPeer, CollaborationUser } from '../utils/collaborationPresence';
import type { TrafficTheme } from '../utils/trafficBoardDrafts';
import type { TileMetricDisplayMode } from '../utils/tileMetricDisplay';
import { CollaborationPresencePanel } from './CollaborationPresence';
import { HelpButton } from './HelpButton';
import { TrafficTooltip } from './TrafficTooltip';
import ptmLogo from '@/assets/portfolio-mark.svg';
import type { HelpTopicId } from '../help/helpContent';
import { AuthAccount } from '@/modules/auth/AuthAccount';
import './TrafficHeader.css';
import { demoEnabled } from '@/modules/demo/demoRuntime';

export interface RoomPreset {
  id: string;
  label: string;
}

interface TrafficHeaderProps {
  activeTileMetricMode?: TileMetricDisplayMode;
  aiPlanningLink?: {
    label: string;
    title: string;
    to: string;
  };
  weekViewLink?: {
    label: string;
    onClick?: () => void;
    title: string;
    to: string;
  };
  boardViewLink?: {
    label: string;
    title: string;
    to: string;
  };
  canOpenCustomRoom: boolean;
  collapsibleActions?: boolean;
  collaborationPeers: CollaborationPeer[];
  collaborationTrackingEnabled: boolean;
  collaborationUser: CollaborationUser;
  customRoomName: string;
  followedCollaborationUserId: string | null;
  headerSyncDetail: string;
  headerSyncLabel: string;
  isConnected: boolean;
  isHeaderMenuOpen: boolean;
  isSynced: boolean;
  showDisplayControls?: boolean;
  showToolActions?: boolean;
  resetConfirmationPending: boolean;
  revenueView: RevenueView;
  roomName: string;
  roomPresets: RoomPreset[];
  snapshotStatus: 'idle' | 'copied' | 'failed';
  syncDetail: string;
  theme: TrafficTheme;
  onCopySnapshot: () => void;
  onCustomRoomNameChange: (roomName: string) => void;
  onCustomRoomSubmit: (event: FormEvent) => void;
  onFollowedUserIdChange: (userId: string | null) => void;
  onHeaderMenuOpenChange: (isOpen: boolean) => void;
  onNavigateToRoom: (roomName: string) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onOpenPlanningRules: () => void;
  onResetBoard: () => void;
  onResetConfirmationCancel: () => void;
  onRevenueViewChange: (revenueView: RevenueView) => void;
  onSetTileMetricMode?: (mode: TileMetricDisplayMode) => void;
  onThemeChange: (theme: TrafficTheme) => void;
  onTrackingEnabledChange: (enabled: boolean) => void;
  onUserNameChange: (userName: string) => void;
}

export function TrafficHeader({
  activeTileMetricMode,
  aiPlanningLink,
  weekViewLink,
  boardViewLink,
  canOpenCustomRoom,
  collapsibleActions = false,
  collaborationPeers,
  collaborationTrackingEnabled,
  collaborationUser,
  customRoomName,
  followedCollaborationUserId,
  headerSyncDetail,
  headerSyncLabel,
  isConnected,
  isHeaderMenuOpen,
  isSynced,
  showDisplayControls = true,
  showToolActions = true,
  resetConfirmationPending,
  revenueView,
  roomName,
  roomPresets,
  snapshotStatus,
  syncDetail,
  theme,
  onCopySnapshot,
  onCustomRoomNameChange,
  onCustomRoomSubmit,
  onFollowedUserIdChange,
  onHeaderMenuOpenChange,
  onNavigateToRoom,
  onOpenHelp,
  onOpenPlanningRules,
  onResetBoard,
  onResetConfirmationCancel,
  onRevenueViewChange,
  onSetTileMetricMode,
  onThemeChange,
  onTrackingEnabledChange,
  onUserNameChange,
}: TrafficHeaderProps) {
  const shouldRenderDisplayControls = Boolean(showDisplayControls && activeTileMetricMode && onSetTileMetricMode);
  const shouldRenderToolSection = Boolean(showToolActions || shouldRenderDisplayControls);

  const handleWeekViewClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!weekViewLink?.onClick) return;
    event.preventDefault();
    weekViewLink.onClick();
  };

  return (
    <header className={`traffic-header ${collapsibleActions ? 'is-action-collapsible' : ''}`}>
      <div className="traffic-brand-bar">
        <div className="traffic-brand">
          <img className="traffic-logo" src={ptmLogo} alt="" aria-hidden="true" />
          <div className="traffic-title">
            <span className="traffic-brand-code">PTM</span>
            <h1>PM Traffic Management</h1>
            <p>
              Plan people's capacity, projects, revenue and workload in one view.
            </p>
          </div>
        </div>
        <button
          aria-controls="traffic-header-menu"
          aria-expanded={isHeaderMenuOpen}
          aria-label={isHeaderMenuOpen ? 'Hide board options' : 'Show board options'}
          className={`traffic-header-menu-toggle ${isHeaderMenuOpen ? 'is-open' : ''}`}
          type="button"
          onClick={() => onHeaderMenuOpenChange(!isHeaderMenuOpen)}
        >
          <strong>Board options</strong>
        </button>
        <AuthAccount />
      </div>
      <div
        className={`traffic-actions ${isHeaderMenuOpen ? 'is-open' : ''}`}
        id="traffic-header-menu"
      >
        <div className="traffic-actions-row traffic-actions-row-primary">
          {!demoEnabled && <div className="traffic-action-section traffic-action-section-board">
            <span className="traffic-action-section-label">Board</span>
            <div className="traffic-room-controls" aria-label="Board and scenario selection">
              <select
                aria-label="Select board"
                className="traffic-pill"
                value={roomPresets.some((preset) => preset.id === roomName) ? roomName : 'custom'}
                onChange={(event) => {
                  if (event.target.value !== 'custom') onNavigateToRoom(event.target.value);
                }}
              >
                {roomPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">Custom board</option>
              </select>
              <form className="traffic-room-form" onSubmit={onCustomRoomSubmit}>
                <input
                  aria-label="Custom board name"
                  placeholder="e.g. q2-plan"
                  value={customRoomName}
                  onChange={(event) => onCustomRoomNameChange(event.target.value)}
                />
                <button className="traffic-button" type="submit" disabled={!canOpenCustomRoom}>
                  Open
                </button>
              </form>
            </div>
          </div>}
          {!demoEnabled && <div className="traffic-action-section traffic-action-section-collaboration">
            <span className="traffic-action-section-label">Collaboration</span>
            <TrafficTooltip className="traffic-sync-tooltip" label={syncDetail} placement="bottom">
              <div className={`traffic-sync-status ${isConnected && isSynced ? 'is-ok' : 'is-warning'}`}>
                <strong>{headerSyncLabel}</strong>
                <span>{headerSyncDetail}</span>
              </div>
            </TrafficTooltip>
            <CollaborationPresencePanel
              isOnline={isConnected && isSynced}
              followedUserId={followedCollaborationUserId}
              peers={collaborationPeers}
              trackingEnabled={collaborationTrackingEnabled}
              user={collaborationUser}
              onFollowedUserIdChange={onFollowedUserIdChange}
              onTrackingEnabledChange={onTrackingEnabledChange}
              onUserNameChange={onUserNameChange}
            />
          </div>}
          <div className="traffic-action-section traffic-action-section-view">
            <span className="traffic-action-section-label">View</span>
            <select
              aria-label="Revenue calculation method"
              className="traffic-pill"
              value={revenueView}
              onChange={(event) => onRevenueViewChange(event.target.value as RevenueView)}
            >
              <option value="expected">Forecast</option>
              <option value="committed">Committed only</option>
            </select>
            <TrafficTooltip label={theme === 'day' ? 'Switch to dark mode' : 'Switch to light mode'} placement="bottom">
              <button
                aria-pressed={theme === 'day'}
                className="traffic-theme-switch"
                type="button"
                onClick={() => onThemeChange(theme === 'day' ? 'night' : 'day')}
              >
                <span>{theme === 'day' ? 'Day' : 'Night'}</span>
                <strong>{theme === 'day' ? 'Light' : 'Dark'}</strong>
              </button>
            </TrafficTooltip>
            {boardViewLink ? (
              <TrafficTooltip label={boardViewLink.title} placement="bottom">
                <Link className="traffic-view-switch-link" to={boardViewLink.to}>
                  {boardViewLink.label}
                </Link>
              </TrafficTooltip>
            ) : null}
          </div>
        </div>
        {shouldRenderToolSection ? (
          <div className="traffic-actions-row traffic-actions-row-secondary">
            <div className="traffic-action-section traffic-action-section-tools">
              <span className="traffic-action-section-label">Tools</span>
              <div className="traffic-tool-actions">
                {shouldRenderDisplayControls ? (
                  <div className="traffic-header-select traffic-tool-metric-control">
                    <span className="traffic-header-select-label">
                      Tile mode
                      <HelpButton
                        label="Explain tile metrics"
                        topicId="tile-scale"
                        onOpenHelp={onOpenHelp}
                      />
                    </span>
                    <select
                      aria-label="Tile metric mode"
                      className="traffic-pill"
                      value={activeTileMetricMode}
                      onChange={(event) => onSetTileMetricMode?.(event.target.value as TileMetricDisplayMode)}
                    >
                      <option value="hours">Hours</option>
                      <option value="cost">Cost</option>
                    </select>
                  </div>
                ) : null}
                {showToolActions ? (
                  <>
                    <TrafficTooltip className="traffic-tool-tooltip" label="Open collaboration rules and constraints used by validation and the AI planning assistant" placement="top">
                      <button className="traffic-button traffic-tool-button" type="button" onClick={onOpenPlanningRules}>
                        Planning rules
                      </button>
                    </TrafficTooltip>
                    {weekViewLink ? (
                      <TrafficTooltip className="traffic-tool-tooltip" label={weekViewLink.title} placement="top">
                        <Link className="traffic-button traffic-tool-button" to={weekViewLink.to} onClick={handleWeekViewClick}>
                          {weekViewLink.label}
                        </Link>
                      </TrafficTooltip>
                    ) : null}
                    {aiPlanningLink ? (
                      <TrafficTooltip className="traffic-tool-tooltip" label={aiPlanningLink.title} placement="top">
                        <Link className="traffic-button traffic-tool-button" to={aiPlanningLink.to}>
                          {aiPlanningLink.label}
                        </Link>
                      </TrafficTooltip>
                    ) : null}
                    {!demoEnabled && <TrafficTooltip className="traffic-tool-tooltip" label="Restore this board's initial data" placement="top">
                      <button
                        className={`traffic-button traffic-tool-button ${resetConfirmationPending ? 'is-danger' : ''}`}
                        type="button"
                        onClick={onResetBoard}
                        onBlur={onResetConfirmationCancel}
                      >
                        {resetConfirmationPending ? 'Confirm reset' : 'Reset data'}
                      </button>
                    </TrafficTooltip>}
                    <TrafficTooltip className="traffic-tool-tooltip" label="Copy a short board summary to the clipboard" placement="top">
                      <button
                        className={`traffic-button traffic-tool-button ${snapshotStatus === 'copied' ? 'is-success' : snapshotStatus === 'failed' ? 'is-danger' : ''}`}
                        type="button"
                        onClick={onCopySnapshot}
                      >
                        {snapshotStatus === 'copied' ? 'Copied' : snapshotStatus === 'failed' ? 'Could not copy' : 'Copy summary'}
                      </button>
                    </TrafficTooltip>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
