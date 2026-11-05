import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { HelpButton } from '../components/HelpButton';
import { TrafficTooltip } from '../components/TrafficTooltip';
import type { HelpTopicId } from '../help/helpContent';
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
import type { DiabloPanelLayout } from './diabloLayout';

interface DiabloFloatingPanelsProps {
  layouts: {
    legend: DiabloPanelLayout;
  };
  onOpenHelp: (topicId: HelpTopicId) => void;
  onPanelPointerDown: (event: ReactPointerEvent<HTMLElement>, panelId: 'legend') => void;
  onToggleLegendCollapsed: () => void;
}

type PanelStyle = CSSProperties & {
  '--diablo-panel-x': number;
  '--diablo-panel-y': number;
};

type DiabloLegendCoverage = 'supported' | 'partial' | 'classic';
type DiabloLegendEntryKind = 'tone' | 'frame' | 'glyph' | 'marker' | 'relationship' | 'person' | 'project' | 'week';

interface DiabloLegendEntry {
  className?: string;
  code?: string;
  coverage: DiabloLegendCoverage;
  detail: string;
  id: string;
  kind: DiabloLegendEntryKind;
  label: string;
}

interface DiabloLegendTab {
  description: string;
  groups: Array<{
    entries: DiabloLegendEntry[];
    title: string;
  }>;
  id: string;
  label: string;
}

const coverageLabels: Record<DiabloLegendCoverage, string> = {
  supported: 'Diablo',
  partial: 'partial',
  classic: 'classic',
};

const frameTypeEntries: DiabloLegendEntry[] = [
  { id: 'commercial', kind: 'frame', label: 'Commercial', className: 'is-work-commercial', detail: 'regular paid project, frame outline colour', coverage: 'supported' },
  { id: 'rd', kind: 'frame', label: 'R&D', className: 'is-work-research_development', detail: 'experiment / investment, frame outline colour', coverage: 'supported' },
  { id: 'waiting', kind: 'frame', label: 'Waiting room', className: 'is-work-waiting_room', detail: 'uncertain deal or opportunity, frame outline colour', coverage: 'supported' },
  { id: 'defensive', kind: 'frame', label: 'Defensive', className: 'is-work-defensive_maintenance', detail: 'maintenance / relationship protection, frame outline colour', coverage: 'supported' },
  { id: 'time-off', kind: 'frame', label: 'TIME OFF', className: 'is-work-time_off', detail: 'planned unavailability; cost does not generate revenue', coverage: 'supported' },
  { id: 'ghost', kind: 'frame', label: 'Ghost', className: 'is-ghost', detail: 'future sales reservation, dashed outline', coverage: 'supported' },
];

const benchLegendEntries: DiabloLegendEntry[] = [
  { id: 'bench-critical', kind: 'person', label: 'Critical bench', className: 'is-bench-critical', detail: 'senior/lead or high cost without a project', coverage: 'supported' },
  { id: 'bench-warning', kind: 'person', label: 'Bench warning', className: 'is-bench-warning', detail: 'person without a project needs a decision', coverage: 'supported' },
  { id: 'bench-watch', kind: 'person', label: 'Bench watch', className: 'is-bench-watch', detail: 'lower-priority bench monitoring', coverage: 'supported' },
  { id: 'low-value-assignment', kind: 'person', label: 'Low value', className: 'is-suspicious-assignment', detail: 'allocation does not cover the person\'s cost or target', coverage: 'supported' },
  { id: 'bench-footprint', kind: 'person', label: 'Footprint', className: 'is-bench-footprint', detail: 'the number of a person\'s bench squares shows the scale of the issue', coverage: 'supported' },
];

const layerLegendEntries: DiabloLegendEntry[] = [
  { id: 'layer-work', kind: 'glyph', label: 'Work', code: 'K', className: 'is-layer-work', detail: 'labour / delivery cost', coverage: 'supported' },
  { id: 'layer-admin', kind: 'glyph', label: 'Admin', code: 'B', className: 'is-layer-admin', detail: 'office, administration, overhead', coverage: 'supported' },
  { id: 'layer-sales', kind: 'glyph', label: 'Sales', code: 'S', className: 'is-layer-sales', detail: 'sales / marketing', coverage: 'supported' },
  { id: 'layer-margin', kind: 'glyph', label: 'Margin', code: 'M', className: 'is-layer-margin', detail: 'person\'s target/margin', coverage: 'supported' },
];

const legendTabs: DiabloLegendTab[] = [
  {
    id: 'colors',
    label: 'Colours',
    description: 'Frames and key visual signals in the inventory view.',
    groups: [
      {
        title: 'Patterns',
        entries: visualPatterns.map((pattern) => ({
          id: pattern.id,
          kind: 'tone',
          label: pattern.label,
          className: `is-tone-${pattern.tone}`,
          detail: pattern.detail,
          coverage: pattern.id === 'mixed' ? 'partial' : 'supported',
        })),
      },
      { title: 'Frame type', entries: frameTypeEntries },
    ],
  },
  {
    id: 'tiles',
    label: 'Tiles',
    description: 'Meaning of squares, initials, cost layers and micro-badges.',
    groups: [
      {
        title: 'Skill / seniority',
        entries: [
          ...visualSkillLegend.map((item) => ({
            id: `skill-${item.id}`,
            kind: 'glyph' as const,
            label: item.label,
            code: item.glyph,
            detail: 'micro-badge on an allocated person\'s tile',
            coverage: 'supported' as const,
          })),
          ...visualSeniorityLegend.map((item) => ({
            id: `seniority-${item}`,
            kind: 'glyph' as const,
            label: `Level ${item}`,
            code: item,
            detail: 'person\'s seniority on the tile',
            coverage: 'supported' as const,
          })),
        ],
      },
      { title: 'Person layers', entries: layerLegendEntries },
      {
        title: 'Frame geometry',
        entries: frameGeometryLegend.map((item) => ({
          id: item.id,
          kind: 'frame',
          label: item.label,
          className: item.className,
          detail: item.detail,
          coverage: item.id === 'poolRemaining' ? 'partial' : 'supported',
        })),
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    description: 'Bench, underutilisation and visibility of people without projects.',
    groups: [
      { title: 'Diablo bench', entries: benchLegendEntries },
      {
        title: 'Person states from the classic inventory',
        entries: personCardStateLegend.map((item) => ({
          id: item.id,
          kind: 'person',
          label: item.label,
          className: item.className,
          detail: item.detail,
          coverage: ['low-workload', 'bench-only', 'underloaded', 'underloaded-critical', 'low-value'].includes(item.id)
            ? 'partial'
            : 'classic',
        })),
      },
    ],
  },
  {
    id: 'traffic',
    label: 'Moves',
    description: 'Changes, handoffs, Plan B and other meeting markers.',
    groups: [
      {
        title: 'Meeting markers',
        entries: meetingMarkerLegend.map((item) => ({
          id: item.id,
          kind: 'marker',
          label: item.label,
          className: item.className,
          detail: item.detail,
          coverage: ['changed', 'handoff', 'plan-b', 'mentoring', 'backup', 'moved'].includes(item.id)
            ? 'supported'
            : ['rd-work', 'waiting-room', 'low-value', 'low-workload', 'bench-only', 'underloaded', 'underloaded-critical'].includes(item.id)
              ? 'partial'
              : 'classic',
        })),
      },
      {
        title: 'Relationships',
        entries: relationshipLegend.map((item) => ({
          id: item.id,
          kind: 'relationship',
          label: item.label,
          className: item.className,
          detail: item.detail,
          coverage: ['changed', 'handoff', 'plan-b', 'mentoring', 'backup', 'moved'].includes(item.id)
            ? 'partial'
            : 'classic',
        })),
      },
    ],
  },
  {
    id: 'project',
    label: 'Project',
    description: 'Project status badges from the classic board and their status in Diablo.',
    groups: [
      {
        title: 'Project status',
        entries: projectInventoryStateLegend.map((item) => ({
          id: item.id,
          kind: 'project',
          label: item.label,
          code: item.code,
          className: item.className,
          detail: item.detail,
          coverage: 'supported',
        })),
      },
      {
        title: 'Weeks',
        entries: weeklySlotLegend.map((item) => ({
          id: item.id,
          kind: 'week',
          label: `${item.label} ${item.hours}`,
          code: item.label,
          className: item.className,
          detail: `${item.title}: ${item.detail}`,
          coverage: 'classic',
        })),
      },
    ],
  },
];

export function DiabloFloatingPanels({
  layouts,
  onOpenHelp,
  onPanelPointerDown,
  onToggleLegendCollapsed,
}: DiabloFloatingPanelsProps) {
  const [activeLegendTabId, setActiveLegendTabId] = useState(legendTabs[0].id);
  const isLegendCollapsed = Boolean(layouts.legend.collapsed);
  const activeLegendTab = legendTabs.find((tab) => tab.id === activeLegendTabId) || legendTabs[0];

  return (
    <>
      <section
        className={`diablo-floating-panel diablo-legend-panel ${isLegendCollapsed ? 'is-collapsed' : ''}`}
        style={panelStyle(layouts.legend, { columns: isLegendCollapsed ? 5 : 8, rows: isLegendCollapsed ? 1 : 7 })}
      >
        <header onPointerDown={(event) => onPanelPointerDown(event, 'legend')}>
          <div>
            <strong>Legend</strong>
            <span>{isLegendCollapsed ? 'collapsed / state saved' : 'full inventory view / Diablo status'}</span>
          </div>
          <div className="diablo-panel-actions">
            <TrafficTooltip label={isLegendCollapsed ? 'Expand Diablo legend' : 'Collapse Diablo legend'} placement="top">
              <button
                aria-controls="diablo-legend-content"
                aria-expanded={!isLegendCollapsed}
                type="button"
                onClick={onToggleLegendCollapsed}
              >
                {isLegendCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </TrafficTooltip>
            <HelpButton label="Explain the legend" topicId="visual-inventory" onOpenHelp={onOpenHelp} />
          </div>
        </header>
        {!isLegendCollapsed ? (
          <div id="diablo-legend-content" className="diablo-legend-content">
            <div className="diablo-legend-tabs" aria-label="Diablo legend sections">
              {legendTabs.map((tab) => (
                <button
                  aria-pressed={activeLegendTab.id === tab.id}
                  className={activeLegendTab.id === tab.id ? 'is-active' : ''}
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveLegendTabId(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="diablo-legend-list" aria-label={`Diablo legend: ${activeLegendTab.label}`}>
              <p className="diablo-legend-description">{activeLegendTab.description}</p>
              {activeLegendTab.groups.map((group) => (
                <section className="diablo-legend-group" key={group.title}>
                  <strong>{group.title}</strong>
                  <div>
                    {group.entries.map((item) => (
                      <div className={`diablo-legend-item is-kind-${item.kind} is-coverage-${item.coverage} ${item.className || ''}`} key={item.id}>
                        <i aria-hidden="true">{item.code}</i>
                        <div>
                          <strong>{item.label}</strong>
                          <span>{item.detail}</span>
                        </div>
                        <em>{coverageLabels[item.coverage]}</em>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

function panelStyle(
  layout: DiabloPanelLayout,
  span: { columns: number; rows: number } = { columns: 8, rows: 7 }
): PanelStyle {
  return {
    gridColumn: `${layout.x} / span ${span.columns}`,
    gridRow: `${layout.y} / span ${span.rows}`,
    '--diablo-panel-x': layout.x,
    '--diablo-panel-y': layout.y,
  };
}
