import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrafficTooltip } from './TrafficTooltip';

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

describe('TrafficTooltip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
  });

  it('shows a custom tooltip bubble on mouse and keyboard focus without a native title', () => {
    render(
      <TrafficTooltip label={'Hidden signals:\nBENCH: Bench - capacity outside projects'} delayMs={40}>
        <button type="button">+1</button>
      </TrafficTooltip>
    );

    const button = screen.getByRole('button', { name: '+1' });
    const bubble = screen.getByRole('tooltip');
    const tooltip = button.closest('.traffic-tooltip') as HTMLElement;

    expect(button).not.toHaveAttribute('title');
    expect(tooltip).toHaveStyle({ '--traffic-tooltip-delay': '40ms' });
    expect(bubble.textContent).toBe('Hidden signals:\nBENCH: Bench - capacity outside projects');
    expect(document.body).toContainElement(bubble);
    expect(tooltip).not.toContainElement(bubble);
    expect(tooltip).not.toHaveClass('is-visible');

    fireEvent.mouseEnter(tooltip);
    expect(tooltip).toHaveClass('is-visible');
    expect(bubble).toHaveClass('is-visible');

    fireEvent.mouseLeave(tooltip);
    expect(tooltip).not.toHaveClass('is-visible');

    fireEvent.focus(button);
    expect(tooltip).toHaveClass('is-visible');

    fireEvent.blur(button);
    expect(tooltip).not.toHaveClass('is-visible');
  });

  it('keeps the portal tooltip inside the viewport without extending a scrollable panel', () => {
    render(
      <div data-testid="settings-panel" style={{ maxHeight: 120, overflow: 'auto' }}>
        <TrafficTooltip label="Switch to dark mode" placement="bottom">
          <button type="button">Light</button>
        </TrafficTooltip>
      </div>
    );

    const panel = screen.getByTestId('settings-panel');
    const button = screen.getByRole('button', { name: 'Light' });
    const tooltip = button.closest('.traffic-tooltip') as HTMLElement;
    const bubble = screen.getByRole('tooltip');
    vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue(getRect(160, 170, 80, 24));
    vi.spyOn(bubble, 'getBoundingClientRect').mockReturnValue(getRect(0, 0, 180, 40));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 });

    fireEvent.mouseEnter(tooltip);

    expect(panel).not.toContainElement(bubble);
    expect(bubble).toHaveClass('is-visible', 'is-top');
    expect(bubble).toHaveStyle({ left: '110px', top: '122px' });
  });
});

function getRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}
