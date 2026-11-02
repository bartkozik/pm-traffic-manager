import { afterEach, describe, expect, it, vi } from 'vitest';
import { FxRateNotFoundError, NbpFxRateProvider } from './fxRate.service.js';

describe('NbpFxRateProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns PLN rate without calling the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new NbpFxRateProvider('https://api.nbp.pl/api');

    await expect(provider.getAverageRateToPln('pln', '2026-06-15')).resolves.toMatchObject({
      currency: 'PLN',
      rateToPln: 1,
      effectiveDate: '2026-06-15',
      source: 'pln',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the latest published rate on or before the requested date', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      table: 'A',
      code: 'USD',
      rates: [
        { no: '110/A/NBP/2026', effectiveDate: '2026-06-12', mid: 3.91 },
        { no: '111/A/NBP/2026', effectiveDate: '2026-06-15', mid: 3.95 },
      ],
    }))));

    const provider = new NbpFxRateProvider('https://example.test/api');
    const rate = await provider.getAverageRateToPln('usd', '2026-06-16');

    expect(rate).toMatchObject({
      currency: 'USD',
      rateToPln: 3.95,
      requestedDate: '2026-06-16',
      effectiveDate: '2026-06-15',
      source: 'nbp_mid',
      providerTable: 'A',
      providerTableNo: '111/A/NBP/2026',
    });
  });

  it('tries table B when table A does not contain the currency', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/rates/a/')) return new Response('', { status: 404 });
      return new Response(JSON.stringify({
        table: 'B',
        code: 'ISK',
        rates: [{ no: '024/B/NBP/2026', effectiveDate: '2026-06-15', mid: 0.028 }],
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new NbpFxRateProvider('https://example.test/api');
    const rate = await provider.getAverageRateToPln('ISK', '2026-06-16');

    expect(rate.providerTable).toBe('B');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails when neither NBP table has a usable rate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const provider = new NbpFxRateProvider('https://example.test/api');

    await expect(provider.getAverageRateToPln('ABC', '2026-06-16')).rejects.toBeInstanceOf(FxRateNotFoundError);
  });
});
