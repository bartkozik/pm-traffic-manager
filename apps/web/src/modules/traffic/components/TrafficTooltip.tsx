import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './TrafficTooltip.css';

type TrafficTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TrafficTooltipProps {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  label: string;
  placement?: TrafficTooltipPlacement;
}

type TooltipStyle = CSSProperties & {
  '--traffic-tooltip-delay'?: string;
};

interface TooltipPosition {
  left: number;
  placement: TrafficTooltipPlacement;
  top: number;
}

const TOOLTIP_GAP = 8;
const TOOLTIP_VIEWPORT_PADDING = 8;

export function TrafficTooltip({
  children,
  className,
  delayMs = 120,
  label,
  placement = 'top',
}: TrafficTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isSuppressed, setIsSuppressed] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const isSuppressedRef = useRef(false);
  const style = {
    '--traffic-tooltip-delay': `${delayMs}ms`,
  } as TooltipStyle;

  const showTooltip = () => {
    if (!isSuppressedRef.current && !isSuppressed) {
      setIsVisible(true);
    }
  };

  const resetTooltip = () => {
    isSuppressedRef.current = false;
    setIsVisible(false);
    setIsSuppressed(false);
    setTooltipPosition(null);
  };

  const suppressTooltip = () => {
    isSuppressedRef.current = true;
    setIsVisible(false);
    setIsSuppressed(true);
    setTooltipPosition(null);
  };

  const updateTooltipPosition = useCallback(() => {
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!isVisible || !anchor || !bubble) return;

    const nextPosition = getTooltipPosition({
      anchorRect: anchor.getBoundingClientRect(),
      bubbleRect: bubble.getBoundingClientRect(),
      placement,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    });

    setTooltipPosition((current) => (
      current &&
      current.placement === nextPosition.placement &&
      Math.abs(current.left - nextPosition.left) < 0.5 &&
      Math.abs(current.top - nextPosition.top) < 0.5
        ? current
        : nextPosition
    ));
  }, [isVisible, placement]);

  useLayoutEffect(() => {
    if (!isVisible) return undefined;

    updateTooltipPosition();
    const handleViewportChange = () => updateTooltipPosition();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(handleViewportChange);

    if (anchorRef.current) resizeObserver?.observe(anchorRef.current);
    if (bubbleRef.current) resizeObserver?.observe(bubbleRef.current);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isVisible, label, updateTooltipPosition]);

  const tooltipBubble = typeof document === 'undefined'
    ? null
    : createPortal(
      <span
        ref={bubbleRef}
        className={`traffic-tooltip-bubble is-portaled is-${tooltipPosition?.placement || placement}${isVisible ? tooltipPosition ? ' is-visible' : ' is-measuring' : ''}`}
        role="tooltip"
        style={{
          ...style,
          left: tooltipPosition ? `${tooltipPosition.left}px` : '0px',
          top: tooltipPosition ? `${tooltipPosition.top}px` : '0px',
        }}
      >
        {label}
      </span>,
      document.body
    );

  const handleFocusCapture = () => {
    showTooltip();
  };

  const handleBlurCapture = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      resetTooltip();
    }
  };

  const handlePointerEnter = () => {
    showTooltip();
  };

  const handlePointerLeave = () => {
    resetTooltip();
  };

  const handleMouseEnter = () => {
    showTooltip();
  };

  const handleMouseLeave = () => {
    resetTooltip();
  };

  const handlePointerDownCapture = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'touch' || event.pointerType === 'pen') {
      suppressTooltip();
    }
  };

  return (
    <span
      ref={anchorRef}
      className={`traffic-tooltip is-${placement}${isVisible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      onBlurCapture={handleBlurCapture}
      onClickCapture={suppressTooltip}
      onFocusCapture={handleFocusCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {children}
      {tooltipBubble}
    </span>
  );
}

function getTooltipPosition({
  anchorRect,
  bubbleRect,
  placement,
  viewportHeight,
  viewportWidth,
}: {
  anchorRect: DOMRect;
  bubbleRect: DOMRect;
  placement: TrafficTooltipPlacement;
  viewportHeight: number;
  viewportWidth: number;
}): TooltipPosition {
  const fits = {
    bottom: anchorRect.bottom + TOOLTIP_GAP + bubbleRect.height <= viewportHeight - TOOLTIP_VIEWPORT_PADDING,
    left: anchorRect.left - TOOLTIP_GAP - bubbleRect.width >= TOOLTIP_VIEWPORT_PADDING,
    right: anchorRect.right + TOOLTIP_GAP + bubbleRect.width <= viewportWidth - TOOLTIP_VIEWPORT_PADDING,
    top: anchorRect.top - TOOLTIP_GAP - bubbleRect.height >= TOOLTIP_VIEWPORT_PADDING,
  };
  const oppositePlacement: Record<TrafficTooltipPlacement, TrafficTooltipPlacement> = {
    bottom: 'top',
    left: 'right',
    right: 'left',
    top: 'bottom',
  };
  const resolvedPlacement = fits[placement] || !fits[oppositePlacement[placement]]
    ? placement
    : oppositePlacement[placement];
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const rawPosition = getRawTooltipPosition(
    anchorRect,
    bubbleRect,
    resolvedPlacement,
    anchorCenterX,
    anchorCenterY
  );
  const maxLeft = Math.max(
    TOOLTIP_VIEWPORT_PADDING,
    viewportWidth - bubbleRect.width - TOOLTIP_VIEWPORT_PADDING
  );
  const maxTop = Math.max(
    TOOLTIP_VIEWPORT_PADDING,
    viewportHeight - bubbleRect.height - TOOLTIP_VIEWPORT_PADDING
  );

  return {
    left: clamp(rawPosition.left, TOOLTIP_VIEWPORT_PADDING, maxLeft),
    placement: resolvedPlacement,
    top: clamp(rawPosition.top, TOOLTIP_VIEWPORT_PADDING, maxTop),
  };
}

function getRawTooltipPosition(
  anchorRect: DOMRect,
  bubbleRect: DOMRect,
  placement: TrafficTooltipPlacement,
  anchorCenterX: number,
  anchorCenterY: number
) {
  switch (placement) {
    case 'bottom':
      return { left: anchorCenterX - bubbleRect.width / 2, top: anchorRect.bottom + TOOLTIP_GAP };
    case 'left':
      return { left: anchorRect.left - bubbleRect.width - TOOLTIP_GAP, top: anchorCenterY - bubbleRect.height / 2 };
    case 'right':
      return { left: anchorRect.right + TOOLTIP_GAP, top: anchorCenterY - bubbleRect.height / 2 };
    case 'top':
    default:
      return { left: anchorCenterX - bubbleRect.width / 2, top: anchorRect.top - bubbleRect.height - TOOLTIP_GAP };
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
