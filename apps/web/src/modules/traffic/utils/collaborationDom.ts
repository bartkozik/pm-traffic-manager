import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  type CollaborationCursor,
  type CollaborationTarget,
  getCollaborationTargetLabel,
} from './collaborationPresence';

export interface CollaborationTargetHit {
  element: HTMLElement;
  target: CollaborationTarget;
}

export function getCollaborationTargetHitFromElement(target: EventTarget | null): CollaborationTargetHit | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('[data-collaboration-target-type]');
  if (!element?.dataset.collaborationTargetType || !element.dataset.collaborationTargetId) return null;
  const type = element.dataset.collaborationTargetType;
  if (!isCollaborationTargetType(type)) return null;
  return {
    element,
    target: {
      type,
      id: element.dataset.collaborationTargetId,
      label: element.dataset.collaborationTargetLabel,
    },
  };
}

export function getCollaborationCursorFromPointer(
  event: ReactPointerEvent<HTMLElement>,
  hit: CollaborationTargetHit | null
): CollaborationCursor {
  const fallback = {
    x: Math.round(event.clientX),
    y: Math.round(event.clientY),
  };
  if (!hit) return fallback;

  const rect = hit.element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return {
      ...fallback,
      target: hit.target,
    };
  }

  return {
    ...fallback,
    target: hit.target,
    relativeX: clampUnit((event.clientX - rect.left) / rect.width),
    relativeY: clampUnit((event.clientY - rect.top) / rect.height),
  };
}

export function getPresenceClickActionLabel(target: EventTarget | null, collaborationTarget: CollaborationTarget | null) {
  if (!(target instanceof Element)) {
    return collaborationTarget ? `Klik: ${getCollaborationTargetLabel(collaborationTarget)}` : '';
  }

  const actionElement = target.closest<HTMLElement>(
    '[data-collaboration-action-label], button, [role="button"], summary, a, input, select, textarea'
  );
  const rawLabel = actionElement
    ? actionElement.dataset.collaborationActionLabel ||
      actionElement.getAttribute('aria-label') ||
      actionElement.getAttribute('title') ||
      getFormControlLabel(actionElement) ||
      actionElement.textContent
    : '';
  const actionLabel = sanitizePresenceLabel(rawLabel || '');

  if (actionLabel && collaborationTarget) {
    return `Klik: ${actionLabel} (${getCollaborationTargetLabel(collaborationTarget)})`;
  }
  if (actionLabel) return `Klik: ${actionLabel}`;
  return collaborationTarget ? `Klik: ${getCollaborationTargetLabel(collaborationTarget)}` : '';
}

function getFormControlLabel(element: HTMLElement) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.placeholder || element.name || 'pole tekstowe';
  }
  if (element instanceof HTMLSelectElement) {
    return element.getAttribute('aria-label') || element.name || 'lista wyboru';
  }
  return '';
}

function sanitizePresenceLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 96);
}

function isCollaborationTargetType(value: string): value is CollaborationTarget['type'] {
  return value === 'project' ||
    value === 'person' ||
    value === 'allocation' ||
    value === 'section' ||
    value === 'control';
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}
