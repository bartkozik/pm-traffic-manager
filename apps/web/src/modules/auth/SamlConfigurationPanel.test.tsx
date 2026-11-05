import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SamlConfigurationPanel } from './SamlConfigurationPanel';
import { samlConfigurationFixture } from './saml.testFixtures';

describe('SamlConfigurationPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies public metadata and submits editable IdP configuration without server secrets', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onSave = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<SamlConfigurationPanel configuration={samlConfigurationFixture} isSaving={false} onSave={onSave} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(samlConfigurationFixture.metadataUrl));
    fireEvent.change(screen.getByLabelText(/Request validity/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable SAML sign-in/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save SAML configuration' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      idpCertificate: samlConfigurationFixture.idpCertificate,
      idpEntityId: samlConfigurationFixture.idpEntityId,
      idpSsoUrl: samlConfigurationFixture.idpSsoUrl,
      requestTtlMinutes: 10,
      samlEnabled: false,
    }));
    expect(screen.queryByText(/test-sp-private-key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/session-secret-value/i)).not.toBeInTheDocument();
  });
});
