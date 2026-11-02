import type { OpportunityCheckResponse } from '@ptm/contracts';

export function formatOpportunityConfidence(confidence: OpportunityCheckResponse['result']['confidence']) {
  switch (confidence) {
    case 'low':
      return 'niska';
    case 'medium':
      return 'średnia';
    case 'high':
      return 'wysoka';
  }
}

export function formatOpportunitySource(mode: OpportunityCheckResponse['mode']) {
  switch (mode) {
    case 'model':
      return 'AI';
    case 'mock':
      return 'analiza testowa';
  }
}
