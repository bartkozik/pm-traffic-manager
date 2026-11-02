import { FxRateSnapshot, normalizeCurrencyCode, roundMoney } from '@ptm/domain';

interface NbpRate {
  no: string;
  effectiveDate: string;
  mid: number;
}

interface NbpRateResponse {
  table: 'A' | 'B';
  code: string;
  rates: NbpRate[];
}

export class FxRateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FxRateNotFoundError';
  }
}

export class FxRateProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FxRateProviderError';
  }
}

export class NbpFxRateProvider {
  constructor(private readonly baseUrl = 'https://api.nbp.pl/api') {}

  async getAverageRateToPln(currency: string, requestedDate: string): Promise<FxRateSnapshot> {
    const normalizedCurrency = normalizeCurrencyCode(currency);
    if (normalizedCurrency === 'PLN') {
      return {
        currency: 'PLN',
        rateToPln: 1,
        requestedDate,
        effectiveDate: requestedDate,
        source: 'pln',
        fetchedAt: new Date().toISOString(),
      };
    }

    const endDate = parseIsoDate(requestedDate);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 7);

    for (const table of ['A', 'B'] as const) {
      const response = await this.fetchRateRange(table, normalizedCurrency, formatIsoDate(startDate), requestedDate);
      const rate = response?.rates
        .filter((item) => item.effectiveDate <= requestedDate)
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];

      if (response && rate) {
        return {
          currency: normalizedCurrency,
          rateToPln: roundMoney(rate.mid),
          requestedDate,
          effectiveDate: rate.effectiveDate,
          source: 'nbp_mid',
          providerTable: response.table,
          providerTableNo: rate.no,
          fetchedAt: new Date().toISOString(),
        };
      }
    }

    throw new FxRateNotFoundError(`No NBP average rate found for ${normalizedCurrency} on or before ${requestedDate}.`);
  }

  private async fetchRateRange(
    table: 'A' | 'B',
    currency: string,
    startDate: string,
    endDate: string
  ): Promise<NbpRateResponse | null> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/exchangerates/rates/${table.toLowerCase()}/${currency}/${startDate}/${endDate}/?format=json`;
    const response = await fetch(url);

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new FxRateProviderError(`NBP FX rate lookup failed with ${response.status}.`);
    }

    return response.json() as Promise<NbpRateResponse>;
  }
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FxRateProviderError(`Invalid FX rate date "${value}".`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new FxRateProviderError(`Invalid FX rate date "${value}".`);
  }
  return parsed;
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
