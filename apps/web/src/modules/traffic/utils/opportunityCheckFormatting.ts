import type { OpportunityCheckResponse } from '@ptm/contracts';

export function formatOpportunityConfidence(confidence: OpportunityCheckResponse['result']['confidence']) {
  switch (confidence) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
  }
}

export function formatOpportunitySource(mode: OpportunityCheckResponse['mode']) {
  switch (mode) {
    case 'model':
      return 'AI';
    case 'mock':
      return 'test analysis';
  }
}
