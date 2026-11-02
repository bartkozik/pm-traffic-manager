import { getTileLayer, Person, PersonTileAllocation, TileUnit } from '../models/traffic.model';
import { DragPayload } from './types';
import './TrafficTile.css';

interface TrafficTileProps {
  allocation: PersonTileAllocation;
  compact?: boolean;
  person: Person;
  tileUnit?: TileUnit;
  mini?: boolean;
  onDragStart: (event: React.DragEvent, payload: DragPayload) => void;
  onOpen: (allocationId: string) => void;
}

function formatUnitValue(allocation: PersonTileAllocation, tileUnit: TileUnit | undefined) {
  if (!tileUnit) return null;
  const rawValue = tileUnit.kind === 'money' ? allocation.revenueK / tileUnit.value : allocation.hours / tileUnit.value;
  const roundedValue = Number.isInteger(rawValue) ? rawValue : Math.round(rawValue * 100) / 100;
  const sourceValue = tileUnit.kind === 'money' ? `${allocation.revenueK}k PLN` : `${allocation.hours}h`;
  return `${sourceValue} = ${roundedValue} x ${tileUnit.label}`;
}

const layerLabels = {
  work: 'koszt pracy',
  admin: 'koszty administracyjne',
  sales: 'koszty sprzedaży',
  margin: 'marża',
};

function setTileDragImage(event: React.DragEvent<HTMLButtonElement>) {
  const source = event.currentTarget;
  const dragImage = source.cloneNode(true) as HTMLElement;
  const { width, height } = source.getBoundingClientRect();

  dragImage.style.position = 'fixed';
  dragImage.style.top = '-1000px';
  dragImage.style.left = '-1000px';
  dragImage.style.width = `${width}px`;
  dragImage.style.height = `${height}px`;
  dragImage.style.pointerEvents = 'none';
  dragImage.style.zIndex = '-1';

  document.body.appendChild(dragImage);
  event.dataTransfer.setDragImage(dragImage, width / 2, height / 2);
  window.setTimeout(() => dragImage.remove(), 0);
}

export function TrafficTile({ allocation, compact = false, person, tileUnit, mini = false, onDragStart, onOpen }: TrafficTileProps) {
  const layer = getTileLayer(person, allocation.tileIndex, allocation.periodId);
  const riskCount = (allocation.validation || []).filter((validation) => validation.severity !== 'info').length;
  const positiveSignalCount = (allocation.validation || []).filter((validation) => validation.severity === 'info').length;
  const hasWarnings = riskCount > 0;
  const hasPositiveSignal = positiveSignalCount > 0;
  const warningLabel = hasWarnings
    ? `${riskCount} ostrzeżeń`
    : hasPositiveSignal
      ? `${positiveSignalCount} dobrych sygnałów`
      : 'bez ostrzeżeń';
  const skillLabel = allocation.skillId ? `, kompetencja: ${allocation.skillId}` : '';
  const unitLabel = formatUnitValue(allocation, tileUnit);
  const unitDetails = unitLabel ? `, jednostka: ${unitLabel}` : '';
  const tileDetails = `${person.name}: ${allocation.revenueK}k PLN, ${allocation.hours}h${unitDetails}${skillLabel}, warstwa: ${layerLabels[layer]}, ${warningLabel}`;

  return (
    <button
      className={`traffic-tile ${mini ? 'is-mini' : ''} ${compact ? 'is-compact' : ''} ${hasWarnings ? 'has-warning' : ''} ${hasPositiveSignal && !hasWarnings ? 'has-positive' : ''}`}
      aria-label={`${tileDetails}. Kliknij, żeby edytować alokację.`}
      data-collaboration-target-id={allocation.id}
      data-collaboration-target-label={`${person.name} · ${allocation.target === 'bench' ? 'ławka' : allocation.target}`}
      data-collaboration-target-type="allocation"
      data-tooltip={tileDetails}
      data-layer={layer}
      draggable={!mini}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(allocation.id);
      }}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'move';
        setTileDragImage(event);
        onDragStart(event, { type: 'tile', tileId: allocation.id });
      }}
    >
      {!mini && !compact ? person.initials : null}
    </button>
  );
}
