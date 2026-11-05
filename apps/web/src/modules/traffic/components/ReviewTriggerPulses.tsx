import { useMemo, useState } from 'react';
import type { TrafficReviewTrigger } from '../utils/trafficReview';
import {
  countGroupedTrafficReviewTriggers,
  groupTrafficReviewTriggers,
  type GroupedTrafficReviewTrigger,
} from '../utils/reviewTriggerDisplay';
import './TrafficSummaryPanels.css';

interface ReviewTriggerPulsesProps {
  ariaLabel: string;
  className: string;
  maxVisible: number;
  triggers: TrafficReviewTrigger[];
}

export function ReviewTriggerPulses({
  ariaLabel,
  className,
  maxVisible,
  triggers,
}: ReviewTriggerPulsesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const groupedTriggers = useMemo(() => groupTrafficReviewTriggers(triggers), [triggers]);
  const hasHiddenGroups = groupedTriggers.length > maxVisible;
  const visibleGroups = isExpanded || !hasHiddenGroups
    ? groupedTriggers
    : groupedTriggers.slice(0, maxVisible);
  const hiddenGroups = hasHiddenGroups ? groupedTriggers.slice(maxVisible) : [];
  const hiddenTriggerCount = countGroupedTrafficReviewTriggers(hiddenGroups);

  if (!groupedTriggers.length) return null;

  return (
    <div className={className} aria-label={ariaLabel}>
      {visibleGroups.map((group) => (
        <span
          aria-label={getTriggerGroupAriaLabel(group)}
          className={`traffic-review-pulse-card is-${group.severity}`}
          key={group.key}
          title={getTriggerGroupTitle(group)}
        >
          <b>{group.owner}</b>
          <strong>{group.title}</strong>
          {group.triggerCount > 1 ? (
            <em aria-label={`${group.triggerCount} matching triggers`}>{group.triggerCount}x</em>
          ) : null}
          <small>{group.action}</small>
        </span>
      ))}
      {hasHiddenGroups ? (
        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded
            ? `Collapse additional Traffic Review triggers (${hiddenTriggerCount})`
            : `Show ${hiddenTriggerCount} hidden Traffic Review triggers`}
          className="traffic-review-pulse-card traffic-review-pulse-toggle is-more"
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <b>{isExpanded ? 'less' : `+${hiddenTriggerCount}`}</b>
          <strong>{isExpanded ? 'collapse triggers' : 'more triggers'}</strong>
          <small>{isExpanded ? 'hide additional' : `${hiddenGroups.length} hidden groups`}</small>
        </button>
      ) : null}
    </div>
  );
}

function getTriggerGroupAriaLabel(group: GroupedTrafficReviewTrigger) {
  const baseLabel = `${group.owner}: ${group.title}. ${group.detail} ${group.action}`;
  return group.triggerCount > 1
    ? `${baseLabel} ${group.triggerCount} matching triggers.`
    : baseLabel;
}

function getTriggerGroupTitle(group: GroupedTrafficReviewTrigger) {
  const baseTitle = `${group.detail} ${group.action}`;
  return group.triggerCount > 1
    ? `${baseTitle} (${group.triggerCount} matching triggers)`
    : baseTitle;
}
