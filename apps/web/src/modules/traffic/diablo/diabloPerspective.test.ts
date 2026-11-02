import { describe, expect, it } from 'vitest';
import {
  getDiabloPlanningPerspectiveFromSearch,
  getDiabloPlanningSearchForPerspective,
} from './diabloPerspective';

describe('diabloPerspective', () => {
  it('uses weekly planning as the default Diablo perspective', () => {
    expect(getDiabloPlanningPerspectiveFromSearch('')).toBe('week');
  });

  it('keeps explicit weekly links compatible', () => {
    expect(getDiabloPlanningPerspectiveFromSearch('?view=week')).toBe('week');
  });

  it('uses month planning only when it is explicit in the URL', () => {
    expect(getDiabloPlanningPerspectiveFromSearch('?view=month')).toBe('month');
  });

  it('keeps the default weekly URL canonical', () => {
    expect(getDiabloPlanningSearchForPerspective('week')).toBe('');
    expect(getDiabloPlanningSearchForPerspective('month')).toBe('?view=month');
  });
});
