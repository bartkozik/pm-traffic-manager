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
              Planowanie dostępności ludzi, projektów, przychodu i obciążenia w jednym widoku.
            </p>
          </div>
        </div>
        <button
          aria-controls="traffic-header-menu"
          aria-expanded={isHeaderMenuOpen}
          aria-label={isHeaderMenuOpen ? 'Ukryj opcje tablicy' : 'Pokaż opcje tablicy'}
          className={`traffic-header-menu-toggle ${isHeaderMenuOpen ? 'is-open' : ''}`}
          type="button"
          onClick={() => onHeaderMenuOpenChange(!isHeaderMenuOpen)}
        >
          <strong>Opcje tablicy</strong>
        </button>
        <AuthAccount />
      </div>
      <div
        className={`traffic-actions ${isHeaderMenuOpen ? 'is-open' : ''}`}
        id="traffic-header-menu"
      >
        <div className="traffic-actions-row traffic-actions-row-primary">
          {!demoEnabled && <div className="traffic-action-section traffic-action-section-board">
            <span className="traffic-action-section-label">Tablica</span>
            <div className="traffic-room-controls" aria-label="Wybór tablicy i scenariusza">
              <select
                aria-label="Wybierz tablicę"
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
                <option value="custom">Własna tablica</option>
              </select>
              <form className="traffic-room-form" onSubmit={onCustomRoomSubmit}>
                <input
                  aria-label="Nazwa własnej tablicy"
                  placeholder="np. q2-plan"
                  value={customRoomName}
                  onChange={(event) => onCustomRoomNameChange(event.target.value)}
                />
                <button className="traffic-button" type="submit" disabled={!canOpenCustomRoom}>
                  Otwórz
                </button>
              </form>
            </div>
          </div>}
          {!demoEnabled && <div className="traffic-action-section traffic-action-section-collaboration">
            <span className="traffic-action-section-label">Współpraca</span>
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
            <span className="traffic-action-section-label">Widok</span>
            <select
              aria-label="Sposób liczenia przychodu"
              className="traffic-pill"
              value={revenueView}
              onChange={(event) => onRevenueViewChange(event.target.value as RevenueView)}
            >
              <option value="expected">Prognoza</option>
              <option value="committed">Tylko podpisane</option>
            </select>
            <TrafficTooltip label={theme === 'day' ? 'Przełącz na tryb nocny' : 'Przełącz na tryb dzienny'} placement="bottom">
              <button
                aria-pressed={theme === 'day'}
                className="traffic-theme-switch"
                type="button"
                onClick={() => onThemeChange(theme === 'day' ? 'night' : 'day')}
              >
                <span>{theme === 'day' ? 'Day' : 'Night'}</span>
                <strong>{theme === 'day' ? 'Jasny' : 'Ciemny'}</strong>
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
              <span className="traffic-action-section-label">Narzędzia</span>
              <div className="traffic-tool-actions">
                {shouldRenderDisplayControls ? (
                  <div className="traffic-header-select traffic-tool-metric-control">
                    <span className="traffic-header-select-label">
                      Tryb kafelków
                      <HelpButton
                        label="Wyjasnij tryb metryk na kafelkach"
                        topicId="tile-scale"
                        onOpenHelp={onOpenHelp}
                      />
                    </span>
                    <select
                      aria-label="Tryb metryk na kafelkach"
                      className="traffic-pill"
                      value={activeTileMetricMode}
                      onChange={(event) => onSetTileMetricMode?.(event.target.value as TileMetricDisplayMode)}
                    >
                      <option value="hours">Godziny</option>
                      <option value="cost">Koszt</option>
                    </select>
                  </div>
                ) : null}
                {showToolActions ? (
                  <>
                    <TrafficTooltip className="traffic-tool-tooltip" label="Otwiera reguły współpracy i ograniczenia używane przez walidacje oraz asystenta planowania" placement="top">
                      <button className="traffic-button traffic-tool-button" type="button" onClick={onOpenPlanningRules}>
                        Reguły planowania
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
                    {!demoEnabled && <TrafficTooltip className="traffic-tool-tooltip" label="Przywraca dane startowe tej tablicy" placement="top">
                      <button
                        className={`traffic-button traffic-tool-button ${resetConfirmationPending ? 'is-danger' : ''}`}
                        type="button"
                        onClick={onResetBoard}
                        onBlur={onResetConfirmationCancel}
                      >
                        {resetConfirmationPending ? 'Potwierdź reset' : 'Resetuj dane'}
                      </button>
                    </TrafficTooltip>}
                    <TrafficTooltip className="traffic-tool-tooltip" label="Kopiuje krótkie podsumowanie boardu do schowka" placement="top">
                      <button
                        className={`traffic-button traffic-tool-button ${snapshotStatus === 'copied' ? 'is-success' : snapshotStatus === 'failed' ? 'is-danger' : ''}`}
                        type="button"
                        onClick={onCopySnapshot}
                      >
                        {snapshotStatus === 'copied' ? 'Skopiowano' : snapshotStatus === 'failed' ? 'Nie udało się skopiować' : 'Kopiuj podsumowanie'}
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
