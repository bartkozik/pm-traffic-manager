import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DropZone } from './DropZone';

describe('DropZone', () => {
  it('clears dragover state when the browser drag ends outside the zone', () => {
    render(
      <DropZone
        className="traffic-test-dropzone"
        periodId="2026-06"
        target="project-alpha"
        onDropPayload={vi.fn()}
      >
        <span>Drop target</span>
      </DropZone>
    );

    const dropZone = screen.getByText('Drop target').parentElement as HTMLElement;

    fireEvent.dragOver(dropZone);
    expect(dropZone).toHaveClass('is-dragover');

    fireEvent.dragEnd(window);
    expect(dropZone).not.toHaveClass('is-dragover');
  });
});
