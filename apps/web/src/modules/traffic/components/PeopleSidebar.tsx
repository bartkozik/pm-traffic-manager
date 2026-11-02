import { HelpTopicId } from '../help/helpContent';
import { Person, PersonTileAllocation, Skill, TileUnit } from '../models/traffic.model';
import { HelpButton } from './HelpButton';
import { PersonVisualBadge } from './PersonVisualBadge';
import { ReviewTriggerPulses } from './ReviewTriggerPulses';
import { TrafficTile } from './TrafficTile';
import { DragPayload } from './types';
import { TrafficReviewTrigger } from '../utils/trafficReview';
import './PeopleSidebar.css';

const MAX_VISIBLE_PERSON_REVIEW_TRIGGERS = 3;

interface PeopleSidebarProps {
  people: Person[];
  periodAllocations: PersonTileAllocation[];
  benchAllocations: PersonTileAllocation[];
  skillsById: Map<string, Skill>;
  displayTileUnit?: TileUnit;
  reviewTriggersByPersonId?: Map<string, TrafficReviewTrigger[]>;
  pendingArchivePersonId: string | null;
  onCreatePerson: () => void;
  onArchivePerson: (personId: string) => void;
  onEditPerson: (personId: string) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onOpenAllocation: (allocationId: string) => void;
  onPersonDragStart: (event: React.DragEvent, payload: DragPayload) => void;
  onResetPersonAllocations: (personId: string) => void;
  onTileDragStart: (event: React.DragEvent, payload: DragPayload) => void;
}

export function PeopleSidebar({
  people,
  periodAllocations,
  benchAllocations,
  skillsById,
  displayTileUnit,
  reviewTriggersByPersonId,
  pendingArchivePersonId,
  onCreatePerson,
  onArchivePerson,
  onEditPerson,
  onOpenHelp,
  onOpenAllocation,
  onPersonDragStart,
  onResetPersonAllocations,
  onTileDragStart,
}: PeopleSidebarProps) {
  return (
    <aside className="traffic-sidebar">
      <div className="traffic-section-title">
        <span>
          Paleta ludzi
          <HelpButton
            label="Wyjasnij palete ludzi"
            topicId="people-palette"
            onOpenHelp={onOpenHelp}
          />
        </span>
        <button className="traffic-pill" type="button" onClick={onCreatePerson}>
          + Osoba
        </button>
      </div>
      <div className="traffic-sidebar-hint">Przeciągnij osobę albo pojedynczy kafelek na projekt</div>
      <div className="traffic-people">
        {people.map((person) => {
          const personBench = benchAllocations.filter((allocation) => allocation.personId === person.id);
          const assignedCount = periodAllocations.filter((allocation) => (
            allocation.personId === person.id && allocation.target !== 'bench'
          )).length;
          const reviewTriggers = reviewTriggersByPersonId?.get(person.id) || [];
          return (
            <div
              key={person.id}
              className="traffic-person"
              data-collaboration-target-id={person.id}
              data-collaboration-target-label={person.name}
              data-collaboration-target-type="person"
              draggable
              onDragStart={(event) => {
                const payload: DragPayload = event.shiftKey && personBench[0]
                  ? { type: 'tile', tileId: personBench[0].id }
                  : { type: 'person', personId: person.id };
                onPersonDragStart(event, payload);
              }}
            >
              <div className="traffic-person-header">
                <div>
                  <div className="traffic-person-name">{person.name}</div>
                  <div className="traffic-person-role">{person.role}</div>
                </div>
                <div className="traffic-person-actions">
                  <div className="traffic-person-cost">{person.monthlyCostK}k koszt</div>
                  {assignedCount ? (
                    <button
                      aria-label={`Cofnij wszystkie przypisania osoby w aktywnym miesiącu: ${person.name}`}
                      className="traffic-icon-button"
                      title={`Wróć ${assignedCount}k na ławkę`}
                      type="button"
                      onClick={() => onResetPersonAllocations(person.id)}
                    >
                      Reset
                    </button>
                  ) : null}
                  <button
                    aria-label={`Edytuj osobę: ${person.name}`}
                    className="traffic-icon-button"
                    type="button"
                    onClick={() => onEditPerson(person.id)}
                  >
                    Edytuj
                  </button>
                  <button
                    aria-label={`${pendingArchivePersonId === person.id ? 'Potwierdź archiwizację osoby' : 'Archiwizuj osobę'}: ${person.name}`}
                    className={`traffic-icon-button ${pendingArchivePersonId === person.id ? 'is-danger' : ''}`}
                    type="button"
                    onClick={() => onArchivePerson(person.id)}
                  >
                    {pendingArchivePersonId === person.id ? 'Potwierdź' : 'Archiwizuj'}
                  </button>
                </div>
              </div>
              <div className="traffic-person-skills">
                <PersonVisualBadge person={person} skillsById={skillsById} />
              </div>
              <ReviewTriggerPulses
                ariaLabel={`Triggery Traffic Review osoby: ${person.name}`}
                className="traffic-person-review-pulse"
                maxVisible={MAX_VISIBLE_PERSON_REVIEW_TRIGGERS}
                triggers={reviewTriggers}
              />
              <div className="traffic-mini-grid">
                {personBench.map((allocation) => (
                  <TrafficTile
                    key={allocation.id}
                    allocation={allocation}
                    person={person}
                    tileUnit={displayTileUnit}
                    mini
                    onOpen={onOpenAllocation}
                    onDragStart={onTileDragStart}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
