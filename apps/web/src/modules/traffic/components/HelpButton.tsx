import { HelpTopicId } from '../help/helpContent';
import { TrafficTooltip } from './TrafficTooltip';
import './HelpButton.css';

interface HelpButtonProps {
  topicId: HelpTopicId;
  label: string;
  onOpenHelp: (topicId: HelpTopicId) => void;
}

export function HelpButton({ topicId, label, onOpenHelp }: HelpButtonProps) {
  return (
    <TrafficTooltip label={label} placement="top">
      <button
        aria-label={label}
        className="traffic-help-button"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenHelp(topicId);
        }}
      >
        i
      </button>
    </TrafficTooltip>
  );
}
