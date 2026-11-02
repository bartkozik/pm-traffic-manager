import { RefObject, useEffect, useRef } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface AccessibleDialogKeyboardOptions {
  ignoreSelectors?: string[];
  initialFocusSelector?: string;
  restoreFocus?: boolean;
}

export function useAccessibleDialogKeyboard(
  containerRef: RefObject<HTMLElement | null>,
  onCancel: () => void,
  {
    ignoreSelectors = [],
    initialFocusSelector,
    restoreFocus = true,
  }: AccessibleDialogKeyboardOptions = {}
) {
  const onCancelRef = useRef(onCancel);
  const ignoreSignature = ignoreSelectors.join('|');

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const ignoredSelectors = ignoreSignature ? ignoreSignature.split('|') : [];
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const animationFrame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container || container.contains(document.activeElement)) return;
      const focusTarget = getInitialFocusTarget(container, initialFocusSelector);
      focusTarget?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && ignoredSelectors.some((selector) => target.closest(selector))) return;

      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      if (target && !container.contains(target)) return;

      const focusableElements = getFocusableElements(container);
      if (!focusableElements.length) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !container.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus && previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, ignoreSignature, initialFocusSelector, restoreFocus]);
}

function getInitialFocusTarget(container: HTMLElement, initialFocusSelector: string | undefined) {
  if (initialFocusSelector) {
    const explicitTarget = container.querySelector<HTMLElement>(initialFocusSelector);
    if (explicitTarget && !isElementDisabledOrHidden(explicitTarget)) return explicitTarget;
  }

  return getFocusableElements(container)[0] ?? container;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !isElementDisabledOrHidden(element));
}

function isElementDisabledOrHidden(element: HTMLElement) {
  const style = getComputedStyle(element);
  return (
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-hidden') === 'true' ||
    element.hidden ||
    style.display === 'none' ||
    style.visibility === 'hidden'
  );
}
