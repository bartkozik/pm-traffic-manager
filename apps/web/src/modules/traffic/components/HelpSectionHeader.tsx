import { ReactNode } from 'react';
import { HelpTopicId } from '../help/helpContent';
import { HelpButton } from './HelpButton';

interface HelpSectionHeaderProps {
  title: string;
  topicId: HelpTopicId;
  onOpenHelp: (topicId: HelpTopicId) => void;
  actions?: ReactNode;
  children?: ReactNode;
}

export function HelpSectionHeader({
  title,
  topicId,
  onOpenHelp,
  actions,
  children,
}: HelpSectionHeaderProps) {
  return (
    <div className="traffic-editor-section-header has-help">
      <div>
        <h3>{title}</h3>
        {children}
      </div>
      {actions ? <div className="traffic-editor-section-actions">{actions}</div> : null}
      <div className="traffic-editor-section-help">
        <HelpButton label={`Wyjasnij sekcje: ${title}`} topicId={topicId} onOpenHelp={onOpenHelp} />
      </div>
    </div>
  );
}
