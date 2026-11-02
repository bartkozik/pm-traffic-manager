import { useEffect, type RefObject } from 'react';

interface UseOnClickOutsideOptions {
  disabled?: boolean;
  ignoreSelectors?: string[];
}

export function useOnClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutsideClick: () => void,
  options: UseOnClickOutsideOptions = {}
) {
  const { disabled = false, ignoreSelectors = [] } = options;

  useEffect(() => {
    if (disabled) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (ignoreSelectors.some((selector) => target.closest(selector))) return;
      if (ref.current?.contains(target)) return;
      onOutsideClick();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [disabled, ignoreSelectors, onOutsideClick, ref]);
}
