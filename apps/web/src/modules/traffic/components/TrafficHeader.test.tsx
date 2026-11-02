import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TrafficHeader } from './TrafficHeader';
import type { CollaborationUser } from '../utils/collaborationPresence';
import { AuthContext, type AuthContextValue } from '@/modules/auth/AuthContext';

const user: CollaborationUser = {
  id: 'local',
  name: 'Ala PM',
  color: '#2563eb',
};

function renderHeader(
  overrides: Partial<Parameters<typeof TrafficHeader>[0]> = {},
  auth?: AuthContextValue
) {
  const header = (
    <MemoryRouter initialEntries={['/diablo-board/ptm-mvp?view=week']}>
      <TrafficHeader
        canOpenCustomRoom={false}
        collaborationPeers={[]}
        collaborationTrackingEnabled
        collaborationUser={user}
        customRoomName="ptm-mvp"
        followedCollaborationUserId={null}
        headerSyncDetail="współpraca"
        headerSyncLabel="Online"
        isConnected
        isHeaderMenuOpen
        isSynced
        resetConfirmationPending={false}
        revenueView="expected"
        roomName="ptm-mvp"
        roomPresets={[]}
        snapshotStatus="idle"
        syncDetail="Online"
        theme="day"
        onCopySnapshot={() => undefined}
        onCustomRoomNameChange={() => undefined}
        onCustomRoomSubmit={(event) => event.preventDefault()}
        onFollowedUserIdChange={() => undefined}
        onHeaderMenuOpenChange={() => undefined}
        onNavigateToRoom={() => undefined}
        onOpenHelp={() => undefined}
        onOpenPlanningRules={() => undefined}
        onResetBoard={() => undefined}
        onResetConfirmationCancel={() => undefined}
        onRevenueViewChange={() => undefined}
        onThemeChange={() => undefined}
        onTrackingEnabledChange={() => undefined}
        onUserNameChange={() => undefined}
        {...overrides}
      />
    </MemoryRouter>
  );

  return render(auth ? <AuthContext.Provider value={auth}>{header}</AuthContext.Provider> : header);
}

describe('TrafficHeader', () => {
  it('uses the explicit week-view switch handler when the weekly mode link is clicked', () => {
    const onClick = vi.fn();

    renderHeader({
      weekViewLink: {
        label: 'Widok miesiąca',
        onClick,
        title: 'Wróć do miesięcznego widoku Diablo Board',
        to: '/diablo-board/ptm-mvp',
      },
    });

    fireEvent.click(screen.getByRole('link', { name: 'Widok miesiąca' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('changes the tile metric display mode from the header', () => {
    const onSetTileMetricMode = vi.fn();

    renderHeader({
      activeTileMetricMode: 'hours',
      onSetTileMetricMode,
    });

    fireEvent.change(screen.getByLabelText('Tryb metryk na kafelkach'), {
      target: { value: 'cost' },
    });

    expect(onSetTileMetricMode).toHaveBeenCalledWith('cost');
  });

  it('keeps the tile metric switch inside tools without the removed display section', () => {
    renderHeader({
      activeTileMetricMode: 'hours',
      onSetTileMetricMode: vi.fn(),
    });
    const toolsSection = screen.getByText('Narzędzia').closest('.traffic-action-section-tools');

    expect(toolsSection).not.toBeNull();
    expect(within(toolsSection as HTMLElement).getByLabelText('Tryb metryk na kafelkach')).toBeInTheDocument();
    expect(screen.queryByText('Wyświetlanie')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Skala planszy kafelków')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Punkt odniesienia godzin w opisach kafelków')).not.toBeInTheDocument();
  });

  it('keeps the authenticated account and logout action visible outside collapsed settings', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderHeader({
      collapsibleActions: true,
      isHeaderMenuOpen: false,
    }, {
      authEnabled: true,
      expected: true,
      logout,
      refresh: vi.fn().mockResolvedValue(undefined),
      status: 'ready',
      user: {
        email: 'anna@example.test',
        name: "Avery Kowalska",
        organizationDomain: 'example.test',
        role: 'admin',
        subject: 'anna@example.test',
      },
      workspaceDomain: 'example.test',
    });

    const logoutButton = screen.getByRole('button', { name: 'Wyloguj' });
    const boardOptionsButton = screen.getByRole('button', { name: 'Pokaż opcje tablicy' });
    const administrationButton = screen.getByRole('button', { name: 'Administracja' });
    const settings = document.querySelector('#traffic-header-menu');

    expect(logoutButton.closest('.traffic-brand-bar')).not.toBeNull();
    expect(settings).not.toContainElement(logoutButton);
    expect(screen.getByText('anna@example.test')).toBeInTheDocument();
    expect(boardOptionsButton.compareDocumentPosition(administrationButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    fireEvent.click(logoutButton);
    expect(logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(logoutButton).not.toBeDisabled());
  });

  it('does not expose access management to a member', () => {
    renderHeader({
      collapsibleActions: true,
      isHeaderMenuOpen: false,
    }, {
      authEnabled: true,
      expected: true,
      logout: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      status: 'ready',
      user: {
        email: 'member@example.test',
        name: 'Member User',
        organizationDomain: 'example.test',
        role: 'member',
        subject: 'member@example.test',
      },
      workspaceDomain: 'example.test',
    });

    expect(screen.queryByRole('button', { name: 'Administracja' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wyloguj' })).toBeInTheDocument();
  });
});
