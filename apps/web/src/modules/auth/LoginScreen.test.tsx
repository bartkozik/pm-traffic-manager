import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoginScreen } from './LoginScreen';

describe('LoginScreen', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('shows the Workspace domain and the single SSO action', () => {
    render(<LoginScreen mode="login" workspaceDomain="example.test" />);

    expect(screen.getByRole('heading', { name: 'Zaloguj się do PTM' })).toBeInTheDocument();
    expect(screen.getByText(/@example.test/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zaloguj przez Google Workspace' })).toBeInTheDocument();
    expect(screen.queryByText(/SAML|frontend|API/i)).not.toBeInTheDocument();
  });

  it('explains when an organization member is not on the allowlist', () => {
    window.history.replaceState({}, '', '/login?auth_error=unauthorized_email');

    render(<LoginScreen mode="login" workspaceDomain="example.test" />);

    expect(screen.getByRole('alert')).toHaveTextContent('nie ma dostępu do PTM');
  });
});
