import { describe, expect, it } from 'vitest';
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
} from './visualLegend';

describe('visualLegend', () => {
  it('covers the visible Miro-style grammar used by the board', () => {
    expect(visualPatterns.map((item) => item.tone)).toEqual([
      'red',
      'yellow',
      'green',
      'blue',
      'orange',
      'purple',
      'dark',
      'mixed',
    ]);
    expect(visualSkillLegend.map((item) => item.glyph)).toEqual([
      'BE',
      'FE',
      'FS',
      'UX',
      'QA',
      'PM',
      'DO',
      'MOB',
    ]);
    expect(visualSeniorityLegend).toEqual(['Jr', 'Mid', 'Sr', 'Lead']);
    expect(meetingMarkerLegend.map((item) => item.id)).toContain('unchanged');
    expect(meetingMarkerLegend.map((item) => item.id)).toContain('handoff');
  });

  it('explains frame geometry, relationships, and whole-person-card states', () => {
    expect(frameGeometryLegend.map((item) => item.id)).toEqual([
      'filled',
      'empty',
      'poolRemaining',
      'overflow',
    ]);
    expect(weeklySlotLegend.map((item) => item.id)).toEqual([
      'auto',
      'manual',
      'heavy',
    ]);
    expect(weeklySlotLegend.find((item) => item.id === 'manual')?.detail).toContain('ręcznie');
    expect(weeklySlotLegend.find((item) => item.id === 'heavy')?.hours).toBe('20h+');
    expect(relationshipLegend.map((item) => item.id)).toEqual([
      'unchanged',
      'moved',
      'changed',
      'handoff',
      'plan-b',
      'mentoring',
      'backup',
      'fragmented',
    ]);
    expect(personCardStateLegend.map((item) => item.id)).toEqual([
      'fragmentation',
      'unavailable',
      'low-workload',
      'bench-only',
      'underloaded',
      'underloaded-critical',
      'rd-work',
      'waiting-room',
      'time-off',
      'low-value',
      'active',
      'ownership',
    ]);
    expect(personCardStateLegend.find((item) => item.id === 'active')?.detail).toContain('prawy pasek');
    expect(projectInventoryStateLegend.map((item) => item.id)).toEqual([
      'healthy-team',
      'single-person',
      'people-shortage',
      'empty-project',
      'many-project-people',
      'fragmented-collaborators',
      'rd-project',
      'waiting-room-project',
      'low-value-project',
      'source-mismatch',
    ]);
    expect(projectInventoryStateLegend.map((item) => item.code)).toEqual([
      'OK',
      '1P',
      'GAP',
      '0P',
      'MULTI',
      'MIX',
      'R&D',
      'WAIT',
      'LOW',
      'SRC',
    ]);
  });
});
