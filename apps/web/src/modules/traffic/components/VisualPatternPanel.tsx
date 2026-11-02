import { HelpTopicId } from '../help/helpContent';
import {
  frameGeometryLegend,
  meetingMarkerLegend,
  personCardStateLegend,
  projectInventoryStateLegend,
  relationshipLegend,
  visualPatterns,
  visualSeniorityLegend,
  visualSkillLegend,
  weeklySlotLegend,
} from '../utils/visualLegend';
import { HelpButton } from './HelpButton';
import './VisualPatternPanel.css';

export type VisualPatternCounts = Partial<Record<(typeof visualPatterns)[number]['tone'], number>>;

interface VisualPatternPanelProps {
  isCollapsed: boolean;
  patternCounts: VisualPatternCounts;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onToggleCollapsed: () => void;
}

export function VisualPatternPanel({
  isCollapsed,
  patternCounts,
  onOpenHelp,
  onToggleCollapsed,
}: VisualPatternPanelProps) {
  return (
    <aside className={`traffic-pattern-panel ${isCollapsed ? 'is-collapsed' : ''}`} aria-label="Inwentarz patternów wizualnych">
      <div className="traffic-collapsible-row is-pattern-panel">
        <button
          aria-expanded={!isCollapsed}
          className="traffic-collapsible-header"
          type="button"
          onClick={onToggleCollapsed}
        >
          <span>Inwentarz patternów</span>
          <em>{visualPatterns.length}</em>
          <strong>{isCollapsed ? 'Rozwiń' : 'Zwiń'}</strong>
        </button>
        <HelpButton
          label="Wyjasnij inwentarz patternow"
          topicId="visual-inventory"
          onOpenHelp={onOpenHelp}
        />
      </div>
      {!isCollapsed ? (
        <>
          <div className="traffic-pattern-list">
            {visualPatterns.map((pattern) => (
              <div className="traffic-pattern-item" key={pattern.id}>
                <span className={`traffic-pattern-swatch is-${pattern.tone}`} />
                <div>
                  <strong>{pattern.label}</strong>
                  <span>{pattern.detail}</span>
                  <em>{patternCounts[pattern.tone]} teraz</em>
                </div>
              </div>
            ))}
          </div>
          <div className="traffic-pattern-subsection">
            <strong>Skille i seniority</strong>
            <div className="traffic-pattern-glyph-list">
              {visualSkillLegend.map((item) => (
                <span className="traffic-pattern-glyph-item" key={item.id} title={item.label}>
                  <span className={`traffic-skill-glyph is-${item.id}`}>{item.glyph}</span>
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
            <div className="traffic-pattern-glyph-list">
              {visualSeniorityLegend.map((item) => (
                <span className="traffic-pattern-glyph-item" key={item} title={`Poziom ${item}`}>
                  <span className="traffic-seniority-glyph">{item}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="traffic-pattern-subsection">
            <strong>Markery spotkania</strong>
            <div className="traffic-pattern-marker-list">
              {meetingMarkerLegend.map((item) => (
                <span className="traffic-pattern-marker-item" key={item.id} title={item.detail}>
                  <span className={item.className}>{item.label}</span>
                  <small>{item.detail}</small>
                </span>
              ))}
            </div>
          </div>
          <div className="traffic-pattern-subsection">
            <strong>Geometria ramki</strong>
            <div className="traffic-pattern-frame-list">
              {frameGeometryLegend.map((item) => (
                <span className="traffic-pattern-frame-item" key={item.id} title={item.detail}>
                  <i className={item.className} aria-hidden="true" />
                  <span>
                    <b>{item.label}</b>
                    <small>{item.detail}</small>
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="traffic-pattern-subsection">
            <strong>Tygodnie osoby</strong>
            <div className="traffic-pattern-week-list">
              {weeklySlotLegend.map((item) => (
                <span className="traffic-pattern-week-item" key={item.id} title={item.detail}>
                  <i className={item.className} aria-hidden="true">
                    <b>{item.label}</b>
                    <small>{item.hours}</small>
                  </i>
                  <span>
                    <b>{item.title}</b>
                    <small>{item.detail}</small>
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="traffic-pattern-subsection">
            <strong>Relacje</strong>
            <div className="traffic-pattern-relationship-list">
              {relationshipLegend.map((item) => (
                <span className={`traffic-pattern-relationship-item ${item.className}`} key={item.id} title={item.detail}>
                  <i aria-hidden="true" />
                  <span>
                    <b>{item.label}</b>
                    <small>{item.detail}</small>
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="traffic-pattern-subsection">
            <strong>Stan karty osoby</strong>
            <div className="traffic-pattern-person-state-list">
              {personCardStateLegend.map((item) => (
                <span className={`traffic-pattern-person-state-item ${item.className}`} key={item.id} title={item.detail}>
                  <i aria-hidden="true" />
                  <span>
                    <b>{item.label}</b>
                    <small>{item.detail}</small>
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="traffic-pattern-subsection">
            <strong>Stan projektu</strong>
            <div className="traffic-pattern-project-state-list">
              {projectInventoryStateLegend.map((item) => (
                <span className={`traffic-pattern-project-state-item ${item.className}`} key={item.id} title={item.detail}>
                  <i aria-hidden="true">{item.code}</i>
                  <span>
                    <b>{item.label}</b>
                    <small>{item.detail}</small>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
}
