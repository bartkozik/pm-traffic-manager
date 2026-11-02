import { Person, Skill } from '../models/traffic.model';
import { getVisualSkillGlyph } from '../utils/visualLegend';
import './PersonVisualBadge.css';

interface PersonVisualBadgeProps {
  person: Person;
  skillsById: Map<string, Skill>;
  compact?: boolean;
}

const seniorityGlyphs = {
  junior: 'Jr',
  mid: 'Mid',
  senior: 'Sr',
  lead: 'Lead',
};

export function PersonVisualBadge({ person, skillsById, compact = false }: PersonVisualBadgeProps) {
  const seniorityLabel = person.seniority ? seniorityGlyphs[person.seniority] : null;
  const skillLabels = person.skillIds.map((skillId) => skillsById.get(skillId)?.label || skillId);
  const label = [
    seniorityLabel ? `seniority ${seniorityLabel}` : null,
    skillLabels.length ? `kompetencje: ${skillLabels.join(', ')}` : null,
  ].filter(Boolean).join(', ');

  return (
    <div
      aria-label={label || `Brak opisanych kompetencji dla ${person.name}`}
      className={`traffic-person-visual-badge ${compact ? 'is-compact' : ''}`}
      title={label || `Brak opisanych kompetencji dla ${person.name}`}
    >
      {seniorityLabel ? <span className="traffic-seniority-glyph">{seniorityLabel}</span> : null}
      <div className="traffic-skill-glyphs" aria-hidden="true">
        {person.skillIds.map((skillId) => (
          <span className={`traffic-skill-glyph is-${skillId}`} key={skillId}>
            {getVisualSkillGlyph(skillId)}
          </span>
        ))}
      </div>
    </div>
  );
}
