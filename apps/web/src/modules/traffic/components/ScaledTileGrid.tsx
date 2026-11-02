import { memo, useMemo, type CSSProperties } from 'react';
import { getTileLayer, Period, Person, PersonTileAllocation, ProjectFrame, Skill, TileUnit } from '../models/traffic.model';
import {
  AllocationMeetingStateKey,
  BoardVisualFocusMode,
  groupAllocationsByMoneyUnit,
  groupAllocationsByPerson,
  getPersonGroupStatus,
  getPersonGroupVisualFocusClassName,
  getPersonGroupVisualClasses,
  PersonAllocationGroup,
  PersonAllocationGroupContext,
  PersonUnderloadSeverity,
} from '../utils/visualInventory';
import { TrafficTile } from './TrafficTile';
import { PersonVisualBadge } from './PersonVisualBadge';
import { DragPayload } from './types';
import { getAllocationWeekHours, getWeeksForMonth } from '../utils/weeklyDrilldown';
import './ScaledTileGrid.css';

interface ScaledTileGridProps {
  allocations: PersonTileAllocation[];
  boardTileUnit?: TileUnit;
  className?: string;
  displayTileUnit?: TileUnit;
  emptyRevenueK?: number;
  emptySlotLabel?: string | null;
  emptySlotKeyPrefix: string;
  emptySlotTone?: 'capped' | 'pooled';
  periodAllocations?: PersonTileAllocation[];
  personGroupContext?: PersonAllocationGroupContext;
  periods?: Period[];
  peopleById: Map<string, Person>;
  projectsById?: Map<string, ProjectFrame>;
  skillsById: Map<string, Skill>;
  visualFocusMode?: BoardVisualFocusMode;
  onOpenAllocation: (allocationId: string) => void;
  onTileDragStart: (event: React.DragEvent, payload: DragPayload) => void;
}

type TileUnitStyle = CSSProperties & {
  '--traffic-tile-unit-size': number;
};

type PersonGroupStyle = CSSProperties & {
  '--traffic-person-color': string;
};

interface PersonStateMarker {
  id: string;
  label: string;
  title: string;
  className: string;
  count?: number;
}

interface PersonSignalChip {
  id: string;
  label: string;
  compactLabel: string;
  title: string;
  className: string;
}

interface PersonWeeklySlot {
  id: string;
  label: string;
  hours: number;
  isManual: boolean;
}

type PersonMeetingStateEntry = {
  label: string;
  compactLabel: string;
  title: string;
  className: string;
  key: AllocationMeetingStateKey;
  count: number;
};

const meetingStateLabels: Record<AllocationMeetingStateKey, { label: string; compactLabel: string; title: string; className: string }> = {
  unchanged: {
    label: 'bez zmian',
    compactLabel: 'BZ',
    title: 'Przypisanie potwierdzone jako zostaje bez zmian',
    className: 'is-unchanged',
  },
  changedThisWeek: {
    label: 'zmiana',
    compactLabel: 'Z',
    title: 'Ustalone lub zmienione w tym tygodniu',
    className: 'is-changed',
  },
  handoffRequired: {
    label: 'info',
    compactLabel: 'I',
    title: 'Wymaga przekazania informacji',
    className: 'is-handoff',
  },
  planB: {
    label: 'Plan B',
    compactLabel: 'PB',
    title: 'Plan B / rezerwowa ścieżka',
    className: 'is-plan-b',
  },
  mentoring: {
    label: 'mentor',
    compactLabel: 'M',
    title: 'Mentoring w projekcie',
    className: 'is-mentoring',
  },
  backup: {
    label: 'backup',
    compactLabel: 'B',
    title: 'Backup / druga osoba znająca kontekst',
    className: 'is-backup',
  },
  moved: {
    label: 'ruch',
    compactLabel: 'R',
    title: 'Osoba została przesunięta z poprzedniego targetu',
    className: 'is-moved',
  },
  activeEngagement: {
    label: '20h+',
    compactLabel: '20h',
    title: 'Zaangażowanie co najmniej 20h w tym okresie',
    className: 'is-active-engagement',
  },
  unavailableContext: {
    label: 'HR',
    compactLabel: 'HR',
    title: 'Osoba ma urlop, niedostępność lub notice period w tym miesiącu',
    className: 'is-unavailable-context',
  },
  lowWorkload: {
    label: 'bench',
    compactLabel: '0h',
    title: 'Osoba lub kafelek jest na ławce / bez projektu',
    className: 'is-low-workload',
  },
  underloaded: {
    label: 'mało',
    compactLabel: 'MŁ',
    title: 'Osoba ma za mało produktywnej pracy w tym okresie',
    className: 'is-underloaded',
  },
  rdWork: {
    label: 'R&D',
    compactLabel: 'RD',
    title: 'Alokacja w projekcie R&D / eksperymentalnym',
    className: 'is-rd-work',
  },
  waitingRoomWork: {
    label: 'wait',
    compactLabel: 'W',
    title: 'Alokacja w projekcie-poczekalni',
    className: 'is-waiting-room',
  },
  timeOffWork: {
    label: 'urlop',
    compactLabel: 'UR',
    title: 'Alokacja w urlopie / zaplanowanej niedostępności',
    className: 'is-time-off',
  },
  lowValueWork: {
    label: 'low',
    compactLabel: 'LOW',
    title: 'Projekt ma niski lub niepewny sygnał komercyjny',
    className: 'is-low-value',
  },
  ownership: {
    label: 'PM',
    compactLabel: 'PM',
    title: 'Osoba niesie marker PM / ownership',
    className: 'is-ownership',
  },
};

const COMPACT_TILE_CLUSTER_THRESHOLD = 7;
const COMPACT_SCALED_TILE_CLUSTER_THRESHOLD = 4;
const MAX_VISIBLE_PERSON_SIGNAL_CHIPS = 5;

function ScaledTileGridComponent({
  allocations,
  boardTileUnit,
  className = 'traffic-tile-grid',
  displayTileUnit,
  emptyRevenueK = 0,
  emptySlotLabel = 'Wolne miejsce',
  emptySlotKeyPrefix,
  emptySlotTone = 'capped',
  periodAllocations,
  personGroupContext,
  periods = [],
  peopleById,
  projectsById,
  skillsById,
  visualFocusMode = 'all',
  onOpenAllocation,
  onTileDragStart,
}: ScaledTileGridProps) {
  const shouldGroupMoney = boardTileUnit?.kind === 'money' && boardTileUnit.value > 1;
  const personGroups = useMemo(
    () => groupAllocationsByPerson(allocations, peopleById, periodAllocations || allocations, projectsById, personGroupContext),
    [allocations, peopleById, periodAllocations, personGroupContext, projectsById]
  );

  if (!shouldGroupMoney) {
    return (
      <div className={className}>
        {personGroups.length ? (
          <div className="traffic-tile-grid-people">
            {personGroups.map((group) => renderPersonGroup(group, skillsById, displayTileUnit, periods, visualFocusMode, onOpenAllocation, onTileDragStart))}
          </div>
        ) : null}
        {emptyRevenueK > 0 ? (
          <div className={`traffic-frame-empty-slots is-${emptySlotTone}`} aria-label={`${emptySlotLabel || 'Wolne miejsce'}: ${emptyRevenueK}k`}>
            <div className="traffic-frame-empty-slots-header">
              <span className="traffic-frame-empty-slots-label">{emptySlotLabel || 'Wolne miejsce'}</span>
              <strong>{formatMoneyLabel(emptyRevenueK)}</strong>
            </div>
            <div className="traffic-frame-empty-slots-list">
              {Array.from({ length: emptyRevenueK }, (_, index) => (
                <div className="traffic-empty-slot" key={`${emptySlotKeyPrefix}-empty-${index}`}>
                  +1k
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const unitValue = boardTileUnit.value;
  const emptyGroups = groupEmptyRevenue(emptyRevenueK, unitValue);

  return (
    <div className={`${className} is-scaled`} style={{ '--traffic-tile-unit-size': unitValue } as TileUnitStyle}>
      {personGroups.length ? (
        <div className="traffic-tile-grid-people">
          {personGroups.map((group) => renderPersonGroup(
            group,
            skillsById,
            displayTileUnit,
            periods,
            visualFocusMode,
            onOpenAllocation,
            onTileDragStart,
            unitValue
          ))}
        </div>
      ) : null}
      {emptyGroups.length ? (
        <div className={`traffic-frame-empty-slots is-${emptySlotTone}`} aria-label={`${emptySlotLabel || 'Wolne miejsce'}: ${emptyRevenueK}k`}>
          <div className="traffic-frame-empty-slots-header">
            <span className="traffic-frame-empty-slots-label">{emptySlotLabel || 'Wolne miejsce'}</span>
            <strong>{formatMoneyLabel(emptyRevenueK)}</strong>
          </div>
          <div className="traffic-frame-empty-slots-list">
            {emptyGroups.map((revenueK, index) => (
              <div className="traffic-empty-slot is-unit" key={`${emptySlotKeyPrefix}-empty-group-${index}`}>
                +{formatMoneyLabel(revenueK)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const ScaledTileGrid = memo(ScaledTileGridComponent);

function renderPersonGroup(
  group: PersonAllocationGroup,
  skillsById: Map<string, Skill>,
  tileUnit: TileUnit | undefined,
  periods: Period[],
  visualFocusMode: BoardVisualFocusMode,
  onOpenAllocation: (allocationId: string) => void,
  onTileDragStart: (event: React.DragEvent, payload: DragPayload) => void,
  moneyUnitValue?: number
) {
  const status = getPersonGroupStatus(group);
  const allocationIds = group.allocations.map((allocation) => allocation.id);
  const allocationGroups = moneyUnitValue
    ? groupAllocationsByMoneyUnit(group.allocations, moneyUnitValue)
    : [{ allocations: group.allocations, revenueK: group.revenueK }];
  const warningLabel = group.warningCount
    ? `ryzyka: ${group.warningCount}`
    : group.positiveCount
      ? `dobre sygnały: ${group.positiveCount}`
      : 'bez sygnałów';
  const fragmentLabel =
    group.fragmentCount > 1 ? `, ta sama osoba jest alokowana w ${group.fragmentCount} miejscach` : '';
  const layerSummary = getLayerSummary(group);
  const groupLabel = `${group.person.name}: ${formatMoneyLabel(group.revenueK)} przychodu, ${formatHours(group.hours)}h pracy, ${warningLabel}${fragmentLabel}. Warstwy: ${layerSummary.map((layer) => `${layer.label} ${formatMoneyLabel(layer.revenueK)}`).join(', ')}. Przeciągnij uchwyt, żeby przenieść tę grupę alokacji.`;
  const meetingStateEntries = (Object.keys(meetingStateLabels) as AllocationMeetingStateKey[])
    .map((key) => ({ ...meetingStateLabels[key], key, count: group.meetingStateCounts[key] }))
    .filter((item) => item.count > 0);
  const visibleMeetingStateEntries = getVisibleMeetingStateEntries(group.underloadSeverity, meetingStateEntries);
  const underloadSignal = getUnderloadVisualEntry(group.underloadSeverity);
  const stateMarkers = getPersonStateMarkers(group, visibleMeetingStateEntries);
  const visualClassNames = getPersonGroupVisualClasses(group).join(' ');
  const focusClassName = getPersonGroupVisualFocusClassName(group, visualFocusMode);
  const isCompactTileCluster = shouldUseCompactTileCluster(group, moneyUnitValue);
  const signalChips = getPersonSignalChips(group, underloadSignal, visibleMeetingStateEntries);
  const weeklySlots = getPersonWeeklySlots(group, periods);
  const weeklySlotLabel = weeklySlots.length
    ? `Rozkład tygodniowy osoby ${group.person.name}: ${weeklySlots.map((slot) => `${slot.label} ${formatHours(slot.hours)}h${slot.isManual ? ' ręcznie' : ''}`).join(', ')}`
    : undefined;
  const visibleSignalChips = signalChips.slice(0, MAX_VISIBLE_PERSON_SIGNAL_CHIPS);
  const hiddenSignalChipCount = Math.max(0, signalChips.length - visibleSignalChips.length);
  const hiddenSignalChipLabels = signalChips
    .slice(MAX_VISIBLE_PERSON_SIGNAL_CHIPS)
    .map((chip) => chip.label)
    .join(', ');
  const compactTileClusterLabel = isCompactTileCluster
    ? `Kompaktowy klaster kafelków osoby ${group.person.name}: ${group.allocations.length} kafelków, ${formatMoneyLabel(group.revenueK)}, ${formatHours(group.hours)}h. Pojedyncze kafelki nadal można kliknąć albo przeciągnąć.`
    : undefined;

  return (
    <section
      aria-label={groupLabel}
      className={`traffic-person-tile-group is-${status} ${visualClassNames} ${focusClassName}`}
      key={group.person.id}
      style={{ '--traffic-person-color': group.person.color } as PersonGroupStyle}
    >
      <button
        aria-label={groupLabel}
        className="traffic-person-tile-handle"
        draggable
        title={groupLabel}
        type="button"
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = 'move';
          onTileDragStart(event, { type: 'allocation-group', allocationIds });
        }}
      >
        <span>{group.person.initials}</span>
      </button>
      <div className="traffic-person-tile-group-body">
        <div className="traffic-person-tile-group-meta">
          <div>
            <strong>{group.person.name}</strong>
            <PersonVisualBadge compact person={group.person} skillsById={skillsById} />
          </div>
          <span className="traffic-person-tile-group-metric">
            <b>{formatMoneyLabel(group.revenueK)}</b>
            <em>{formatHours(group.hours)}h</em>
          </span>
        </div>
        {stateMarkers.length ? (
          <div
            aria-label={`Markery wizualne osoby ${group.person.name}: ${stateMarkers.map((marker) => `${marker.label}${marker.count && marker.count > 1 ? ` ${marker.count}` : ''}`).join(', ')}`}
            className="traffic-person-state-strip"
          >
            {stateMarkers.map((marker) => (
              <span
                aria-label={`${marker.label}${marker.count && marker.count > 1 ? ` ${marker.count}` : ''}: ${marker.title}`}
                className={marker.className}
                data-count={marker.count && marker.count > 1 ? marker.count : undefined}
                key={marker.id}
                title={marker.title}
              />
            ))}
          </div>
        ) : null}
        <div className="traffic-person-tile-group-signals">
          {visibleSignalChips.map((chip) => (
            <span aria-label={chip.title} className={chip.className} key={chip.id} title={chip.title}>
              <span className="traffic-person-signal-full">{chip.label}</span>
              <span aria-hidden="true" className="traffic-person-signal-compact">{chip.compactLabel}</span>
            </span>
          ))}
          {hiddenSignalChipCount ? (
            <span
              aria-label={`${hiddenSignalChipCount} dodatkowe markery osoby ${group.person.name}: ${hiddenSignalChipLabels}`}
              className="is-more"
              title={`${hiddenSignalChipCount} kolejne markery osoby: ${hiddenSignalChipLabels}`}
            >
              <span className="traffic-person-signal-full">więcej {hiddenSignalChipCount}</span>
              <span aria-hidden="true" className="traffic-person-signal-compact">+{hiddenSignalChipCount}</span>
            </span>
          ) : null}
        </div>
        <div className="traffic-person-layer-strip" aria-label={`Warstwy alokacji: ${layerSummary.map((layer) => `${layer.label} ${formatMoneyLabel(layer.revenueK)}`).join(', ')}`}>
          {layerSummary.map((layer) => (
            <span
              aria-label={`${layer.label}: ${formatMoneyLabel(layer.revenueK)}`}
              data-layer={layer.id}
              key={layer.id}
              style={{ '--traffic-layer-share': `${layer.share}%` } as CSSProperties}
              title={`${layer.label}: ${formatMoneyLabel(layer.revenueK)}`}
            >
              <b aria-hidden="true">{layer.code}</b>
              <small aria-hidden="true">{formatMoneyLabel(layer.revenueK)}</small>
            </span>
          ))}
        </div>
        {weeklySlots.length ? (
          <div className="traffic-person-week-strip" aria-label={weeklySlotLabel}>
            {weeklySlots.map((slot) => (
              <span
                aria-label={`${slot.label}: ${formatHours(slot.hours)}h${slot.isManual ? ', ustawione ręcznie' : ', rozlane proporcjonalnie'}`}
                className={`${slot.isManual ? 'is-manual' : 'is-auto'} ${slot.hours >= 20 ? 'is-heavy' : ''}`}
                key={slot.id}
                title={`${slot.label}: ${formatHours(slot.hours)}h${slot.isManual ? ' · ręcznie' : ' · proporcjonalnie'}`}
              >
                <b>{slot.label}</b>
                <small>{formatHours(slot.hours)}h</small>
              </span>
            ))}
          </div>
        ) : null}
        {isCompactTileCluster ? (
          <div className="traffic-person-tile-cluster-summary" aria-label={compactTileClusterLabel} role="note">
            <span>{group.allocations.length} kaf.</span>
            <strong>{formatMoneyLabel(group.revenueK)}</strong>
            <em>{formatHours(group.hours)}h</em>
          </div>
        ) : null}
        <div
          aria-label={isCompactTileCluster ? `Kafelki w kompaktowym klastrze osoby ${group.person.name}` : undefined}
          className={`traffic-person-tile-group-tiles ${moneyUnitValue ? 'is-scaled' : ''} ${isCompactTileCluster ? 'is-compact-cluster' : ''}`}
          role={isCompactTileCluster ? 'group' : undefined}
        >
          {allocationGroups.map((allocationGroup, index) => (
            <div className={moneyUnitValue ? 'traffic-tile-unit-group' : 'traffic-tile-unit-tiles'} key={`${group.person.id}-${index}`}>
              {moneyUnitValue ? (
                <span className="traffic-tile-unit-label">{formatMoneyLabel(allocationGroup.revenueK)}</span>
              ) : null}
              <div className="traffic-tile-unit-tiles">
                {allocationGroup.allocations.map((allocation) => (
                  <TrafficTile
                    key={allocation.id}
                    allocation={allocation}
                    compact={isCompactTileCluster}
                    person={group.person}
                    tileUnit={tileUnit}
                    onOpen={onOpenAllocation}
                    onDragStart={onTileDragStart}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function shouldUseCompactTileCluster(group: PersonAllocationGroup, moneyUnitValue?: number) {
  const threshold = moneyUnitValue ? COMPACT_SCALED_TILE_CLUSTER_THRESHOLD : COMPACT_TILE_CLUSTER_THRESHOLD;
  return group.allocations.length >= threshold;
}

function getPersonWeeklySlots(group: PersonAllocationGroup, periods: Period[]): PersonWeeklySlot[] {
  if (!periods.length || !group.allocations.some((allocation) => allocation.target !== 'bench')) return [];

  const monthPeriodId = group.allocations[0]?.periodId;
  const monthPeriod = periods.find((period) => period.id === monthPeriodId && period.granularity === 'month');
  if (!monthPeriod) return [];

  const weeks = getWeeksForMonth(periods, monthPeriod);
  if (weeks.length <= 1) return [];

  const monthDays = getInclusiveDays(monthPeriod.startsOn, monthPeriod.endsOn);
  return weeks.map((week, index) => {
    const hours = group.allocations.reduce((sum, allocation) => (
      sum + getAllocationWeekHours(allocation, week, weeks, monthDays)
    ), 0);
    const isManual = group.allocations.some((allocation) => (
      allocation.weeklyOverrides?.some((override) => override.periodId === week.id && typeof override.hours === 'number')
    ));

    return {
      id: week.id,
      label: `W${index + 1}`,
      hours: Math.round(hours * 10) / 10,
      isManual,
    };
  });
}

function getInclusiveDays(startsOn: string, endsOn: string) {
  const start = new Date(`${startsOn}T00:00:00.000Z`);
  const end = new Date(`${endsOn}T00:00:00.000Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function getPersonSignalChips(
  group: PersonAllocationGroup,
  underloadSignal: PersonStateMarker | null,
  meetingStateEntries: PersonMeetingStateEntry[]
): PersonSignalChip[] {
  const chips: PersonSignalChip[] = [];
  if (group.warningCount > 0) {
    chips.push({
      id: 'warning',
      label: `ryzyka: ${group.warningCount}`,
      compactLabel: `R${group.warningCount}`,
      title: `${group.warningCount} ryzyk dla tej grupy alokacji`,
      className: 'is-warning',
    });
  }
  if (group.positiveCount > 0) {
    chips.push({
      id: 'positive',
      label: `OK: ${group.positiveCount}`,
      compactLabel: `OK${group.positiveCount}`,
      title: `${group.positiveCount} dobrych sygnałów dla tej grupy alokacji`,
      className: 'is-positive',
    });
  }
  if (group.fragmentCount > 1) {
    chips.push({
      id: 'fragmented',
      label: `w ${group.fragmentCount} miejscach`,
      compactLabel: `W${group.fragmentCount}`,
      title: `Ta sama osoba jest alokowana w ${group.fragmentCount} miejscach`,
      className: 'is-fragmented',
    });
  }
  if (underloadSignal) {
    chips.push({
      id: underloadSignal.id,
      label: underloadSignal.label,
      compactLabel: getCompactSignalLabel(underloadSignal.label),
      title: underloadSignal.title,
      className: underloadSignal.className,
    });
  }

  meetingStateEntries.forEach((item) => {
    const suffix = item.count > 1 ? ` ${item.count}` : '';
    chips.push({
      id: item.key,
      label: `${item.label}${suffix}`,
      compactLabel: `${item.compactLabel}${item.count > 1 ? item.count : ''}`,
      title: `${item.title}: ${item.count} kaf.`,
      className: item.className,
    });
  });

  return chips;
}

function getCompactSignalLabel(label: string) {
  if (label === 'niska') return 'N';
  if (label === 'mało') return 'MŁ';
  if (label === 'bench') return '0h';
  return label;
}

function getPersonStateMarkers(
  group: PersonAllocationGroup,
  meetingStateEntries: PersonMeetingStateEntry[]
): PersonStateMarker[] {
  const markers: PersonStateMarker[] = [];
  if (group.warningCount > 0) {
    markers.push({
      id: 'warning',
      label: 'ryzyka',
      title: `${group.warningCount} ryzyk dla tej grupy alokacji`,
      className: 'is-warning',
      count: group.warningCount,
    });
  }
  if (group.positiveCount > 0) {
    markers.push({
      id: 'positive',
      label: 'OK',
      title: `${group.positiveCount} dobrych sygnałów dla tej grupy alokacji`,
      className: 'is-positive',
      count: group.positiveCount,
    });
  }
  if (group.fragmentCount > 1) {
    markers.push({
      id: 'fragmented',
      label: 'w kilku miejscach',
      title: `Ta sama osoba jest alokowana w ${group.fragmentCount} miejscach`,
      className: 'is-fragmented',
      count: group.fragmentCount,
    });
  }
  const underloadMarker = getUnderloadVisualEntry(group.underloadSeverity);
  if (underloadMarker) {
    markers.push(underloadMarker);
  }

  meetingStateEntries.forEach((entry) => {
    markers.push({
      id: entry.key,
      label: entry.label,
      title: entry.title,
      className: entry.className,
      count: entry.count,
    });
  });

  return markers;
}

function getVisibleMeetingStateEntries(
  underloadSeverity: PersonUnderloadSeverity,
  meetingStateEntries: PersonMeetingStateEntry[]
) {
  if (underloadSeverity === 'none') return meetingStateEntries;
  return meetingStateEntries.filter((entry) => entry.key !== 'lowWorkload' && entry.key !== 'underloaded');
}

function getUnderloadVisualEntry(underloadSeverity: PersonUnderloadSeverity): PersonStateMarker | null {
  switch (underloadSeverity) {
    case 'bench':
      return {
        id: 'underload-bench',
        label: '0h',
        title: 'Osoba nie ma produktywnej pracy w tym okresie i siedzi na ławce',
        className: 'is-bench-only',
      };
    case 'critical':
      return {
        id: 'underload-critical',
        label: 'niska',
        title: 'Osoba ma skrajnie niskie wykorzystanie produktywne w tym okresie',
        className: 'is-underloaded-critical',
      };
    case 'low':
      return {
        id: 'underload-low',
        label: 'mało',
        title: 'Osoba ma za mało produktywnej pracy w tym okresie',
        className: 'is-underloaded',
      };
    case 'none':
    default:
      return null;
  }
}

function getLayerSummary(group: PersonAllocationGroup) {
  const labels = {
    work: { label: 'koszt pracy', code: 'K' },
    admin: { label: 'biuro/admin', code: 'B' },
    sales: { label: 'sprzedaż/marketing', code: 'S' },
    margin: { label: 'marża/cel', code: 'M' },
  };
  const revenueByLayer = group.allocations.reduce<Record<keyof typeof labels, number>>((result, allocation) => {
    const layer = getTileLayer(group.person, allocation.tileIndex, allocation.periodId);
    result[layer] += allocation.revenueK;
    return result;
  }, { work: 0, admin: 0, sales: 0, margin: 0 });

  return (Object.keys(labels) as Array<keyof typeof labels>)
    .filter((layer) => revenueByLayer[layer] > 0)
    .map((layer) => ({
      id: layer,
      label: labels[layer].label,
      code: labels[layer].code,
      revenueK: revenueByLayer[layer],
      share: group.revenueK > 0 ? Math.max(12, Math.round((revenueByLayer[layer] / group.revenueK) * 100)) : 0,
    }));
}

function groupEmptyRevenue(emptyRevenueK: number, unitValue: number) {
  const groups: number[] = [];
  let remaining = emptyRevenueK;
  while (remaining > 0) {
    const next = Math.min(unitValue, remaining);
    groups.push(next);
    remaining -= next;
  }
  return groups;
}

function formatMoneyLabel(revenueK: number) {
  return `${revenueK}k`;
}

function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 10) / 10);
}
