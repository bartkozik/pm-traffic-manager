import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollaborationPresenceLayer, CollaborationPresencePanel } from './CollaborationPresence';
import type { CollaborationPeer, CollaborationUser } from '../utils/collaborationPresence';

const user: CollaborationUser = {
  id: 'local',
  name: 'Ala PM',
  color: '#2563eb',
};

const peer: CollaborationPeer = {
  clientId: 2,
  user: {
    id: 'peer',
    name: 'Bartek Dev',
    color: '#16a34a',
  },
  cursor: { x: 120, y: 160 },
  editingTarget: { type: 'project', id: 'project-1', label: "Client 1" },
};

function createPeer(clientId: number, name: string): CollaborationPeer {
  return {
    clientId,
    user: {
      id: `peer-${clientId}`,
      name,
      color: '#be123c',
    },
  };
}

describe('CollaborationPresence', () => {
  it('renders local identity and active peers', () => {
    render(
      <CollaborationPresencePanel
        followedUserId={null}
        isOnline
        peers={[peer]}
        trackingEnabled
        user={user}
        onFollowedUserIdChange={() => undefined}
        onTrackingEnabledChange={() => undefined}
        onUserNameChange={() => undefined}
      />
    );

    expect(screen.getByLabelText('Your name shown to other users')).toHaveValue('Ala PM');
    expect(screen.getByRole('switch', { name: 'Share my presence and activity with others' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Who to follow on the board')).toHaveValue('all');
    expect(screen.getByTitle('Bartek Dev')).toBeInTheDocument();
  });

  it('changes tracking and followed user controls', () => {
    const onTrackingEnabledChange = vi.fn();
    const onFollowedUserIdChange = vi.fn();

    render(
      <CollaborationPresencePanel
        followedUserId={null}
        isOnline
        peers={[peer]}
        trackingEnabled
        user={user}
        onFollowedUserIdChange={onFollowedUserIdChange}
        onTrackingEnabledChange={onTrackingEnabledChange}
        onUserNameChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Share my presence and activity with others' }));
    fireEvent.change(screen.getByLabelText('Who to follow on the board'), { target: { value: 'peer' } });

    expect(onTrackingEnabledChange).toHaveBeenCalledWith(false);
    expect(onFollowedUserIdChange).toHaveBeenCalledWith('peer');
  });

  it('keeps identity and publish controls usable when there are no collaborators', () => {
    render(
      <CollaborationPresencePanel
        followedUserId={null}
        isOnline
        peers={[]}
        trackingEnabled
        user={user}
        onFollowedUserIdChange={() => undefined}
        onTrackingEnabledChange={() => undefined}
        onUserNameChange={() => undefined}
      />
    );

    expect(screen.getByLabelText('Your name shown to other users')).not.toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Share my presence and activity with others' })).not.toBeDisabled();
    expect(screen.getByLabelText('Who to follow on the board')).toBeDisabled();
    expect(screen.getByText('Just you')).toBeInTheDocument();
  });

  it('caps visible peer avatars and shows an overflow counter', () => {
    render(
      <CollaborationPresencePanel
        followedUserId={null}
        isOnline
        peers={[
          createPeer(1, 'Ala'),
          createPeer(2, 'Bartek'),
          createPeer(3, 'Celina'),
          createPeer(4, 'Darek'),
          createPeer(5, 'Ewa'),
        ]}
        trackingEnabled
        user={user}
        onFollowedUserIdChange={() => undefined}
        onTrackingEnabledChange={() => undefined}
        onUserNameChange={() => undefined}
      />
    );

    expect(screen.getByTitle('Ala')).toBeInTheDocument();
    expect(screen.getByTitle('Bartek')).toBeInTheDocument();
    expect(screen.getByTitle('Celina')).toBeInTheDocument();
    expect(screen.queryByTitle('Darek')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('shows the latest visible collaborator action in the presence panel', () => {
    render(
      <CollaborationPresencePanel
        followedUserId={null}
        isOnline
        peers={[
          {
            ...createPeer(1, 'Ala'),
            action: { type: 'click', label: 'Click: Liquid Editions', at: 10 },
          },
          {
            ...createPeer(2, 'Bartek'),
            action: { type: 'click', label: 'Click: Pattern filters', at: 20 },
          },
        ]}
        trackingEnabled
        user={user}
        onFollowedUserIdChange={() => undefined}
        onTrackingEnabledChange={() => undefined}
        onUserNameChange={() => undefined}
      />
    );

    expect(screen.getAllByText('Bartek').length).toBeGreaterThan(0);
    expect(screen.getByText('Click: Pattern filters')).toBeInTheDocument();
    expect(screen.queryByText('Click: Liquid Editions')).not.toBeInTheDocument();
  });

  it('renders remote cursor and same-target editing conflict', () => {
    render(
      <CollaborationPresenceLayer
        peers={[peer]}
        localEditingTarget={{ type: 'project', id: 'project-1', label: "Client 1" }}
      />
    );

    expect(screen.getAllByText('Bartek Dev').length).toBeGreaterThan(0);
    expect(screen.getByText('Simultaneous editing')).toBeInTheDocument();
    expect(screen.getByText(/is also editing Client 1/)).toBeInTheDocument();
  });

  it('does not render cursor or target overlay for a peer that disabled tracking', () => {
    render(
      <CollaborationPresenceLayer
        peers={[{
          ...peer,
          trackingEnabled: false,
        }]}
        localEditingTarget={null}
      />
    );

    expect(screen.queryByText("Bartek Dev · Client 1")).not.toBeInTheDocument();
    expect(screen.queryByText('Bartek Dev')).not.toBeInTheDocument();
  });

  it('places anchored cursors against the matching local target element', () => {
    render(
      <>
        <div
          data-collaboration-target-id="project-1"
          data-collaboration-target-label="Client 1"
          data-collaboration-target-type="project"
          ref={(element) => {
            if (!element) return;
            element.getBoundingClientRect = () => ({
              bottom: 180,
              height: 80,
              left: 200,
              right: 600,
              top: 100,
              width: 400,
              x: 200,
              y: 100,
              toJSON: () => undefined,
            });
          }}
        />
        <CollaborationPresenceLayer
          peers={[{
            ...peer,
            cursor: {
              target: { type: 'project', id: 'project-1', label: "Client 1" },
              relativeX: 0.5,
              relativeY: 0.25,
            },
            editingTarget: null,
          }]}
          localEditingTarget={null}
        />
      </>
    );

    const cursor = screen.getByText("Bartek Dev · Client 1").closest('.traffic-remote-cursor');
    expect(cursor).toHaveStyle({ left: '400px', top: '120px' });
  });
});
