import type { TrafficReviewTrigger } from './trafficReview';

export interface GroupedTrafficReviewTrigger {
  key: string;
  owner: TrafficReviewTrigger['owner'];
  severity: TrafficReviewTrigger['severity'];
  title: string;
  detail: string;
  action: string;
  triggerCount: number;
  triggerIds: string[];
}

export function groupTrafficReviewTriggers(triggers: TrafficReviewTrigger[]): GroupedTrafficReviewTrigger[] {
  return Array.from(triggers.reduce((groups, trigger) => {
    const key = getTrafficReviewTriggerGroupKey(trigger);
    const current = groups.get(key);
    if (current) {
      groups.set(key, {
        ...current,
        triggerCount: current.triggerCount + 1,
        triggerIds: [...current.triggerIds, trigger.id],
      });
      return groups;
    }

    groups.set(key, {
      key,
      owner: trigger.owner,
      severity: trigger.severity,
      title: trigger.title,
      detail: trigger.detail,
      action: trigger.action,
      triggerCount: 1,
      triggerIds: [trigger.id],
    });
    return groups;
  }, new Map<string, GroupedTrafficReviewTrigger>()).values());
}

export function countGroupedTrafficReviewTriggers(groups: GroupedTrafficReviewTrigger[]): number {
  return groups.reduce((sum, group) => sum + group.triggerCount, 0);
}

function getTrafficReviewTriggerGroupKey(trigger: TrafficReviewTrigger) {
  return JSON.stringify([
    trigger.owner,
    trigger.severity,
    normalizeTriggerText(trigger.title),
    normalizeTriggerText(trigger.detail),
    normalizeTriggerText(trigger.action),
  ]);
}

function normalizeTriggerText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}
