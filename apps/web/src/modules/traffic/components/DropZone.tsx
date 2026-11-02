import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { DragPayload, DropPayloadOptions } from './types';

type DropEventWithHandledMarker = DragEvent & {
  __ptmDropHandled?: boolean;
};

interface DropZoneProps {
  target: string;
  periodId: string;
  className: string;
  children: React.ReactNode;
  collaborationTargetLabel?: string;
  collaborationTargetType?: 'project' | 'person' | 'allocation';
  dropOptions?: DropPayloadOptions;
  isDropDisabled?: boolean;
  style?: CSSProperties;
  onDropPayload: (payload: DragPayload, target: string, periodId: string, options?: DropPayloadOptions) => void;
}

export function DropZone({
  target,
  periodId,
  className,
  children,
  collaborationTargetLabel,
  collaborationTargetType,
  dropOptions,
  isDropDisabled = false,
  style,
  onDropPayload,
}: DropZoneProps) {
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    if (!isOver) return undefined;
    const clearDragState = () => setIsOver(false);
    window.addEventListener('dragend', clearDragState);
    window.addEventListener('drop', clearDragState);
    return () => {
      window.removeEventListener('dragend', clearDragState);
      window.removeEventListener('drop', clearDragState);
    };
  }, [isOver]);

  return (
    <div
      className={`${className} ${isOver ? 'is-dragover' : ''}`}
      data-collaboration-target-id={collaborationTargetType ? target : undefined}
      data-collaboration-target-label={collaborationTargetLabel}
      data-collaboration-target-type={collaborationTargetType}
      style={style}
      onDragOver={(event) => {
        if (isDropDisabled) {
          event.dataTransfer.dropEffect = 'none';
          setIsOver(false);
          return;
        }
        event.preventDefault();
        setIsOver((current) => (current ? current : true));
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        setIsOver(false);
      }}
      onDrop={(event) => {
        const nativeEvent = event.nativeEvent as DropEventWithHandledMarker;
        event.preventDefault();
        setIsOver(false);
        if (isDropDisabled) return;
        if (nativeEvent.__ptmDropHandled) return;
        const raw = event.dataTransfer.getData('application/json');
        if (!raw) return;
        nativeEvent.__ptmDropHandled = true;
        onDropPayload(JSON.parse(raw) as DragPayload, target, periodId, dropOptions);
      }}
    >
      {children}
    </div>
  );
}
