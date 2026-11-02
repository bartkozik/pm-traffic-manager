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
  partial: 'część',
  classic: 'klasyczny',
};

const frameTypeEntries: DiabloLegendEntry[] = [
  { id: 'commercial', kind: 'frame', label: 'Komercyjny', className: 'is-work-commercial', detail: 'regularny projekt płatny, kolor obrysu ramki', coverage: 'supported' },
  { id: 'rd', kind: 'frame', label: 'R&D', className: 'is-work-research_development', detail: 'eksperyment / inwestycja, kolor obrysu ramki', coverage: 'supported' },
  { id: 'waiting', kind: 'frame', label: 'Poczekalnia', className: 'is-work-waiting_room', detail: 'deal lub temat bez pewności, kolor obrysu ramki', coverage: 'supported' },
  { id: 'defensive', kind: 'frame', label: 'Defensive', className: 'is-work-defensive_maintenance', detail: 'maintenance / obrona relacji, kolor obrysu ramki', coverage: 'supported' },
  { id: 'time-off', kind: 'frame', label: 'URLOP', className: 'is-work-time_off', detail: 'zaplanowana niedostępność; koszt nie pracuje na revenue', coverage: 'supported' },
  { id: 'ghost', kind: 'frame', label: 'Ghost', className: 'is-ghost', detail: 'rezerwacja przyszłej sprzedaży, przerywany obrys', coverage: 'supported' },
];

const benchLegendEntries: DiabloLegendEntry[] = [
  { id: 'bench-critical', kind: 'person', label: 'Ławka krytyczna', className: 'is-bench-critical', detail: 'senior/lead albo wysoki koszt bez projektu', coverage: 'supported' },
  { id: 'bench-warning', kind: 'person', label: 'Ławka warning', className: 'is-bench-warning', detail: 'osoba bez projektu wymaga decyzji', coverage: 'supported' },
  { id: 'bench-watch', kind: 'person', label: 'Ławka watch', className: 'is-bench-watch', detail: 'niższy poziom obserwacji ławki', coverage: 'supported' },
  { id: 'low-value-assignment', kind: 'person', label: 'Niska wartość', className: 'is-suspicious-assignment', detail: 'przypisanie nie domyka kosztu lub targetu osoby', coverage: 'supported' },
  { id: 'bench-footprint', kind: 'person', label: 'Footprint', className: 'is-bench-footprint', detail: 'liczba kwadratów osoby na ławce pokazuje skalę problemu', coverage: 'supported' },
];

const layerLegendEntries: DiabloLegendEntry[] = [
  { id: 'layer-work', kind: 'glyph', label: 'Work', code: 'K', className: 'is-layer-work', detail: 'koszt pracy / delivery', coverage: 'supported' },
  { id: 'layer-admin', kind: 'glyph', label: 'Admin', code: 'B', className: 'is-layer-admin', detail: 'biuro, administracja, overhead', coverage: 'supported' },
  { id: 'layer-sales', kind: 'glyph', label: 'Sales', code: 'S', className: 'is-layer-sales', detail: 'sprzedaż / marketing', coverage: 'supported' },
  { id: 'layer-margin', kind: 'glyph', label: 'Margin', code: 'M', className: 'is-layer-margin', detail: 'target/marża osoby', coverage: 'supported' },
];

const legendTabs: DiabloLegendTab[] = [
  {
    id: 'colors',
    label: 'Kolory',
    description: 'Ramki i główne sygnały skanowania z inventory view.',
    groups: [
      {
        title: 'Patterny',
        entries: visualPatterns.map((pattern) => ({
          id: pattern.id,
          kind: 'tone',
          label: pattern.label,
          className: `is-tone-${pattern.tone}`,
          detail: pattern.detail,
          coverage: pattern.id === 'mixed' ? 'partial' : 'supported',
        })),
      },
      { title: 'Typ ramki', entries: frameTypeEntries },
    ],
  },
  {
    id: 'tiles',
    label: 'Kafelki',
    description: 'Znaczenie kwadratów, inicjałów, warstw kosztu i mikro-badge.',
    groups: [
      {
        title: 'Skill / seniority',
        entries: [
          ...visualSkillLegend.map((item) => ({
            id: `skill-${item.id}`,
            kind: 'glyph' as const,
            label: item.label,
            code: item.glyph,
            detail: 'mikro-badge na kafelku przypisanej osoby',
            coverage: 'supported' as const,
          })),
          ...visualSeniorityLegend.map((item) => ({
            id: `seniority-${item}`,
            kind: 'glyph' as const,
            label: `Poziom ${item}`,
            code: item,
            detail: 'seniority osoby na kafelku',
            coverage: 'supported' as const,
          })),
        ],
      },
      { title: 'Warstwy osoby', entries: layerLegendEntries },
      {
        title: 'Geometria ramki',
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
    label: 'Ludzie',
    description: 'Ławka, niedociążenie i widoczność osób poza projektem.',
    groups: [
      { title: 'Ławka Diablo', entries: benchLegendEntries },
      {
        title: 'Stany osoby z klasycznego inventory',
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
    label: 'Ruch',
    description: 'Zmiany, handoffy, Plan B i inne markery spotkania.',
    groups: [
      {
        title: 'Markery spotkania',
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
        title: 'Relacje',
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
    label: 'Projekt',
    description: 'Project-state chips z klasycznego boardu i ich status w Diablo.',
    groups: [
      {
        title: 'Stan projektu',
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
        title: 'Tygodnie',
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
            <strong>Legenda</strong>
            <span>{isLegendCollapsed ? 'zwinięta / status zapamiętany' : 'pełny inventory view / status Diablo'}</span>
          </div>
          <div className="diablo-panel-actions">
            <TrafficTooltip label={isLegendCollapsed ? 'Rozwiń legendę Diablo' : 'Zwiń legendę Diablo'} placement="top">
              <button
                aria-controls="diablo-legend-content"
                aria-expanded={!isLegendCollapsed}
                type="button"
                onClick={onToggleLegendCollapsed}
              >
                {isLegendCollapsed ? 'Rozwiń' : 'Zwiń'}
              </button>
            </TrafficTooltip>
            <HelpButton label="Wyjaśnij legendę" topicId="visual-inventory" onOpenHelp={onOpenHelp} />
          </div>
        </header>
        {!isLegendCollapsed ? (
          <div id="diablo-legend-content" className="diablo-legend-content">
            <div className="diablo-legend-tabs" aria-label="Sekcje legendy Diablo">
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
            <div className="diablo-legend-list" aria-label={`Legenda Diablo: ${activeLegendTab.label}`}>
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
