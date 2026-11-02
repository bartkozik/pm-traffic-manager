import { describe, expect, it } from 'vitest';
import { countGroupedTrafficReviewTriggers, groupTrafficReviewTriggers } from './reviewTriggerDisplay';
import type { TrafficReviewTrigger } from './trafficReview';

const baseTrigger: TrafficReviewTrigger = {
  id: 'trigger-1',
  owner: 'PM',
  severity: 'medium',
  title: "Taylor: pm: 0/24h pokrycia.",
  detail: 'Brakuje pokrycia PM.',
  action: 'Poprawić mapowanie alokacji.',
  personId: 'person-1',
};

describe('reviewTriggerDisplay', () => {
  it('groups visually identical Traffic Review triggers while preserving total trigger count', () => {
    const groups = groupTrafficReviewTriggers([
      baseTrigger,
      { ...baseTrigger, id: 'trigger-2', detail: ' Brakuje   pokrycia PM. ' },
      {
        ...baseTrigger,
        id: 'trigger-3',
        title: "Client 1: single point of failure",
        detail: 'Tylko jedna osoba jest przypisana do projektu.',
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      title: "Taylor: pm: 0/24h pokrycia.",
      triggerCount: 2,
      triggerIds: ['trigger-1', 'trigger-2'],
    });
    expect(countGroupedTrafficReviewTriggers(groups)).toBe(3);
  });
});
