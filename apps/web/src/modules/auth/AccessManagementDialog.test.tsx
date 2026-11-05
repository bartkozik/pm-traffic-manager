import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppAccessUser } from '@ptm/contracts';
import { AccessManagementDialog } from './AccessManagementDialog';
import { AuthContext } from './AuthContext';
import {
  createAccessUser,
  loadAccessOverview,
  updateAccessUser,
  updateSamlConfiguration,
} from './authApi';
import { samlConfigurationFixture } from './saml.testFixtures';

vi.mock('./authApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('./authApi')>();
  return {
    ...original,
    createAccessUser: vi.fn(),
    loadAccessOverview: vi.fn(),
    updateAccessUser: vi.fn(),
    updateSamlConfiguration: vi.fn(),
  };
});

const timestamp = '2026-07-20T10:00:00.000Z';
const admin = createUser('admin@example.test', 'admin');
const member = createUser('member@example.test', 'member');
describe('AccessManagementDialog', () => {
  beforeEach(() => {
    vi.mocked(loadAccessOverview).mockReset();
    vi.mocked(createAccessUser).mockReset();
    vi.mocked(updateAccessUser).mockReset();
    vi.mocked(updateSamlConfiguration).mockReset();
    vi.mocked(updateSamlConfiguration).mockResolvedValue(samlConfigurationFixture);
    vi.mocked(loadAccessOverview).mockResolvedValue({
      samlConfiguration: samlConfigurationFixture,
      users: [admin, member],
    });
  });

  it('lists users and lets an administrator add and block access', async () => {
    const created = createUser('new.user@example.test', 'member');
    vi.mocked(createAccessUser).mockResolvedValue(created);
    vi.mocked(updateAccessUser).mockResolvedValue({ ...member, status: 'disabled' });
    renderDialog();

    expect(await screen.findByText('member@example.test')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Users' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'new.user@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(createAccessUser).toHaveBeenCalledWith({
      email: 'new.user@example.test',
      role: 'member',
    }));
    expect(await screen.findByText('new.user@example.test')).toBeInTheDocument();

    const memberRow = screen.getByText('member@example.test').closest('article');
    if (!memberRow) throw new Error('Member access row was not rendered.');
    fireEvent.click(within(memberRow).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(updateAccessUser).toHaveBeenCalledWith(
      'member@example.test',
      { status: 'disabled' }
    ));
  });

  it('keeps SAML configuration in an administrator-only authentication tab', async () => {
    renderDialog();

    await screen.findByText('member@example.test');
    fireEvent.click(screen.getByRole('tab', { name: 'Authentication' }));

    expect(screen.getByRole('tab', { name: 'Authentication' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'SAML authentication' })).toBeInTheDocument();
    expect(screen.getByText('Sign-in enabled')).toBeInTheDocument();
    expect(screen.getByText('example.test')).toBeInTheDocument();
    expect(screen.getAllByText(samlConfigurationFixture.metadataUrl)).toHaveLength(2);
    expect(screen.getAllByText('Configured · value hidden')).toHaveLength(2);
  });

  it('supports keyboard navigation between settings tabs', async () => {
    renderDialog();

    await screen.findByText('member@example.test');
    const membersTab = screen.getByRole('tab', { name: 'Users' });
    membersTab.focus();
    fireEvent.keyDown(membersTab, { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Authentication' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Authentication' })).toBeVisible();
  });

  it('keeps self-management controls disabled and closes on Escape', async () => {
    const onClose = vi.fn();
    renderDialog(onClose);

    const adminRow = (await screen.findByText('admin@example.test')).closest('article');
    if (!adminRow) throw new Error('Admin access row was not rendered.');
    expect(within(adminRow).getByLabelText('Role admin@example.test')).toBeDisabled();
    expect(within(adminRow).getByRole('button', { name: 'Disable' })).toBeDisabled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render or load administrator data for a member', () => {
    renderDialog(vi.fn(), 'member');

    expect(screen.queryByRole('dialog', { name: 'Access and sign-in' })).not.toBeInTheDocument();
    expect(loadAccessOverview).not.toHaveBeenCalled();
  });
});

function renderDialog(
  onClose = vi.fn(),
  role: 'admin' | 'member' = 'admin'
) {
  return render(
    <AuthContext.Provider value={{
      authEnabled: true,
      expected: true,
      logout: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      status: 'ready',
      user: {
        email: admin.email,
        name: 'Admin User',
        organizationDomain: 'example.test',
        role,
        subject: 'admin@example.test',
      },
      workspaceDomain: 'example.test',
    }}>
      <AccessManagementDialog onClose={onClose} />
    </AuthContext.Provider>
  );
}

function createUser(email: string, role: AppAccessUser['role']): AppAccessUser {
  return {
    createdAt: timestamp,
    email,
    role,
    status: 'active',
    updatedAt: timestamp,
  };
}
