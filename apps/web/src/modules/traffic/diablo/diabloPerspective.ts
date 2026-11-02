export type DiabloPlanningPerspective = 'week' | 'month';

export function getDiabloPlanningPerspectiveFromSearch(search: string): DiabloPlanningPerspective {
  const view = new URLSearchParams(search).get('view');
  return view === 'month' ? 'month' : 'week';
}

export function getDiabloPlanningSearchForPerspective(perspective: DiabloPlanningPerspective) {
  return perspective === 'month' ? '?view=month' : '';
}
