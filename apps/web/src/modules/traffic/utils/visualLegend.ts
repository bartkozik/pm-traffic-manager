import { getProjectInventoryPatternCode } from './visualInventory';
import type { SkillId } from '../models/traffic.model';

export const visualPatterns = [
  { id: 'red', label: 'Czerwony nacisk', detail: 'ryzyka, overflow albo target nie domyka planu', tone: 'red' },
  { id: 'yellow', label: 'Żółta luka', detail: 'wolne miejsce w ramce lub słabsza pewność deala', tone: 'yellow' },
  { id: 'green', label: 'Zielone pokrycie', detail: 'alokacja domyka target albo daje zdrowy sygnał', tone: 'green' },
  { id: 'blue', label: 'Niebieska rezerwacja', detail: 'ghost deal / przyszła szansa zarezerwowana na boardzie', tone: 'blue' },
  { id: 'orange', label: 'Pomarańczowy plaster', detail: 'projekt defensywny: przychód teraz, możliwa blokada capacity', tone: 'orange' },
  { id: 'purple', label: 'Fioletowe R&D / poczekalnia', detail: 'eksperyment, niski komercyjny zwrot albo projekt-poczekalnia', tone: 'purple' },
  { id: 'dark', label: 'Ciemny urlop / niedostępność', detail: 'urlop albo inny zaplanowany koszt niedostępności bez przychodu', tone: 'dark' },
  { id: 'mixed', label: 'Mieszana grupa', detail: 'ta sama osoba ma istotną pracę w kilku miejscach', tone: 'mixed' },
] as const;

export const visualSkillLegend = [
  { id: 'backend', glyph: 'BE', label: 'Backend' },
  { id: 'frontend', glyph: 'FE', label: 'Frontend' },
  { id: 'fullstack', glyph: 'FS', label: 'Fullstack' },
  { id: 'design', glyph: 'UX', label: 'UX/UI' },
  { id: 'qa', glyph: 'QA', label: 'QA' },
  { id: 'pm', glyph: 'PM', label: 'PM' },
  { id: 'devops', glyph: 'DO', label: 'DevOps' },
  { id: 'mobile', glyph: 'MOB', label: 'Mobile' },
] as const;

const visualSkillGlyphById = new Map<SkillId, string>(
  visualSkillLegend.map((item) => [item.id as SkillId, item.glyph])
);

export function getVisualSkillGlyph(skillId: SkillId | undefined, fallbackLabel?: string) {
  if (!skillId) return null;
  return visualSkillGlyphById.get(skillId)
    || fallbackLabel?.slice(0, 3).toUpperCase()
    || skillId.slice(0, 3).toUpperCase();
}

export const visualSeniorityLegend = ['Jr', 'Mid', 'Sr', 'Lead'] as const;

export const meetingMarkerLegend = [
  { id: 'unchanged', className: 'is-unchanged', label: 'bez zmian', detail: 'potwierdzone: zostaje jak było' },
  { id: 'changed', className: 'is-changed', label: 'zmiana', detail: 'ustalone lub zmienione w tym tygodniu' },
  { id: 'handoff', className: 'is-handoff', label: 'info', detail: 'wymaga przekazania informacji' },
  { id: 'plan-b', className: 'is-plan-b', label: 'Plan B', detail: 'rezerwowa ścieżka' },
  { id: 'mentoring', className: 'is-mentoring', label: 'mentor', detail: 'mentoring w projekcie' },
  { id: 'backup', className: 'is-backup', label: 'backup', detail: 'druga osoba zna kontekst' },
  { id: 'moved', className: 'is-moved', label: 'ruch', detail: 'osoba przeniesiona z poprzedniego miejsca' },
  { id: 'active-engagement', className: 'is-active-engagement', label: '20h+', detail: 'duże zaangażowanie w okresie' },
  { id: 'unavailable-context', className: 'is-unavailable-context', label: 'HR', detail: 'urlop, niedostępność lub notice period' },
  { id: 'low-workload', className: 'is-low-workload', label: 'bench', detail: 'kafelek jest na ławce albo poza projektem' },
  { id: 'bench-only', className: 'is-bench-only', label: '0h', detail: 'osoba nie ma produktywnej pracy w okresie' },
  { id: 'underloaded', className: 'is-underloaded', label: 'mało', detail: 'za mało produktywnej pracy w okresie' },
  { id: 'underloaded-critical', className: 'is-underloaded-critical', label: 'niska', detail: 'skrajnie niskie wykorzystanie produktywne' },
  { id: 'rd-work', className: 'is-rd-work', label: 'R&D', detail: 'alokacja w eksperymencie / R&D' },
  { id: 'waiting-room', className: 'is-waiting-room', label: 'wait', detail: 'alokacja w projekcie-poczekalni' },
  { id: 'low-value', className: 'is-low-value', label: 'low', detail: 'defensywny, ghost lub niepewny projekt' },
  { id: 'ownership', className: 'is-ownership', label: 'PM', detail: 'marker ownership / PM' },
] as const;

export const frameGeometryLegend = [
  { id: 'filled', className: 'is-filled', label: 'zajęte', detail: 'osoby i revenue/capacity mieszczące się w ramce projektu' },
  { id: 'empty', className: 'is-empty', label: 'wolne / okno', detail: 'puste miejsce: w CAP-ie wolny limit, w fixed-price część okna/puli' },
  { id: 'poolRemaining', className: 'is-poolRemaining', label: 'pula dalej', detail: 'fixed-price: część wspólnej puli, która może być potrzebna później' },
  { id: 'overflow', className: 'is-overflow', label: 'poza ramką', detail: 'alokacja wystająca poza finansowanie albo limit projektu' },
] as const;

export const weeklySlotLegend = [
  { id: 'auto', className: 'is-auto', label: 'W1', hours: '16h', title: 'proporcjonalnie', detail: 'godziny rozlane z miesiąca, bez ręcznego override tygodnia' },
  { id: 'manual', className: 'is-manual', label: 'W2', hours: '24h', title: 'ręcznie', detail: 'tydzień ma ręcznie ustawione godziny w alokacji' },
  { id: 'heavy', className: 'is-heavy', label: 'W3', hours: '20h+', title: 'ciężki tydzień', detail: 'tydzień niesie co najmniej 20h tej osoby w projekcie' },
] as const;

export const relationshipLegend = [
  { id: 'unchanged', className: 'is-unchanged', label: 'bez zmian', detail: 'przypisanie zostaje jak było' },
  { id: 'moved', className: 'is-moved', label: 'ruch', detail: 'poprzednie miejsce → obecna ramka projektu, z linią w overlayu' },
  { id: 'changed', className: 'is-changed', label: 'zmiana', detail: 'alokacja ustalona albo zmieniona w tym tygodniu' },
  { id: 'handoff', className: 'is-handoff', label: 'handoff', detail: 'ktoś musi dostać informację po zmianie' },
  { id: 'plan-b', className: 'is-plan-b', label: 'Plan B', detail: 'rezerwowa ścieżka lub alternatywna obsada' },
  { id: 'mentoring', className: 'is-mentoring', label: 'mentoring', detail: 'relacja wsparcia w projekcie' },
  { id: 'backup', className: 'is-backup', label: 'backup', detail: 'druga osoba zna kontekst albo kod' },
  { id: 'fragmented', className: 'is-fragmented', label: 'fragmentacja', detail: 'ta sama osoba ma istotną pracę w wielu targetach, z linią w overlayu' },
] as const;

export const personCardStateLegend = [
  { id: 'fragmentation', className: 'has-fragmentation', label: 'pocięta osoba', detail: 'ta sama osoba ma istotną pracę w kilku miejscach' },
  { id: 'unavailable', className: 'has-unavailable-context', label: 'HR / niedostępność', detail: 'urlop, notice period albo brak kontekstu HR' },
  { id: 'low-workload', className: 'has-low-workload', label: 'ławka', detail: 'co najmniej część kafelków jest poza projektem' },
  { id: 'bench-only', className: 'has-bench-only', label: 'bez projektu', detail: 'osoba nie ma produktywnej pracy w tym okresie' },
  { id: 'underloaded', className: 'has-underloaded', label: 'niedociążona', detail: 'osoba ma poniżej zdrowego progu produktywnej pracy' },
  { id: 'underloaded-critical', className: 'has-underloaded-critical', label: 'bardzo mało pracy', detail: 'osoba ma skrajnie niskie wykorzystanie produktywne' },
  { id: 'rd-work', className: 'has-rd-work', label: 'R&D', detail: 'osoba siedzi w eksperymencie / R&D' },
  { id: 'waiting-room', className: 'has-waiting-room', label: 'poczekalnia', detail: 'osoba siedzi w projekcie-poczekalni' },
  { id: 'time-off', className: 'has-time-off', label: 'urlop', detail: 'osoba ma część kosztu zaplanowaną jako urlop / niedostępność' },
  { id: 'low-value', className: 'has-low-value', label: 'niska wartość', detail: 'defensywny, ghost lub niepewny projekt' },
  { id: 'active', className: 'has-active-engagement', label: '20h+', detail: 'duże zaangażowanie: karta osoby dostaje mocny prawy pasek' },
  { id: 'ownership', className: 'has-ownership', label: 'ownership', detail: 'PM albo osoba niosąca odpowiedzialność za ustalenie' },
] as const;

export const projectInventoryStateLegend = [
  { id: 'healthy-team', className: 'is-healthy-team', code: getProjectInventoryPatternCode('healthyTeam'), label: 'samodzielny zespół', detail: 'kilka osób domyka ramkę bez braków i fragmentacji' },
  { id: 'single-person', className: 'is-single-person', code: getProjectInventoryPatternCode('singlePersonProject'), label: 'projekt jednoosobowy', detail: 'jedna osoba niesie kontekst projektu' },
  { id: 'people-shortage', className: 'is-people-shortage', code: getProjectInventoryPatternCode('peopleShortage'), label: 'niedobór ludzi', detail: 'brak godzin w wymaganiach projektu' },
  { id: 'empty-project', className: 'is-empty-project', code: getProjectInventoryPatternCode('emptyProject'), label: 'brak ludzi', detail: 'projekt nie ma przypisanej osoby w miesiącu' },
  { id: 'many-project-people', className: 'is-many-project-people', code: getProjectInventoryPatternCode('manyProjectPeople'), label: 'osoby w wielu projektach', detail: 'ktoś z ramki pracuje też w innych miejscach' },
  { id: 'fragmented-collaborators', className: 'is-fragmented-collaborators', code: getProjectInventoryPatternCode('fragmentedCollaborators'), label: 'mieszany zespół', detail: 'osoba stała pracuje z pociętymi współpracownikami' },
  { id: 'rd-project', className: 'is-rd-project', code: getProjectInventoryPatternCode('researchDevelopmentProject'), label: 'R&D', detail: 'eksperyment / inwestycja bez prostego komercyjnego domknięcia' },
  { id: 'waiting-room-project', className: 'is-waiting-room-project', code: getProjectInventoryPatternCode('waitingRoomProject'), label: 'poczekalnia', detail: 'projekt zajmuje capacity bez jasnego deliverable albo decyzji' },
  { id: 'low-value-project', className: 'is-low-value-project', code: getProjectInventoryPatternCode('lowValueProject'), label: 'niska wartość', detail: 'defensywny, ghost albo niepewny projekt' },
  { id: 'source-mismatch', className: 'is-source-mismatch', code: getProjectInventoryPatternCode('sourceMismatch'), label: 'źródło/scope', detail: 'scope zmieniony, ale CRM/źródło nieaktualne' },
] as const;

export type VisualPatternTone = typeof visualPatterns[number]['tone'];
