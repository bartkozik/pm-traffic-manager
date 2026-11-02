import { FormEvent, useEffect, useRef, useState } from 'react';
import { HelpTopicId } from '../help/helpContent';
import { useAccessibleDialogKeyboard } from '../hooks/useAccessibleDialogKeyboard';
import { useOnClickOutside } from '../hooks/useOnClickOutside';
import { BenchAlertSeverity, Period, Person, PersonCostModel, Seniority, Skill, SkillId } from '../models/traffic.model';
import { costModelTypes, seniorityLabels, seniorityOptions } from './constants';
import { HelpSectionHeader } from './HelpSectionHeader';
import { MonthlyPersonOverrideEditor } from './MonthlyPersonOverrideEditor';
import { getPersonInitialsFromName } from '../utils/personInitials';
import './TrafficEditors.css';

interface PersonEditorProps {
  person: Person;
  people: Person[];
  activePeriodId: string;
  periods: Period[];
  skills: Skill[];
  isNew?: boolean;
  onClose: () => void;
  onArchive?: (personId: string) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onSave: (person: Person) => void;
}

const costModelLabels: Record<PersonCostModel['type'], string> = {
  fixed_monthly: 'Stały koszt miesięczny',
  hourly: 'Koszt godzinowy',
  monthly_override: 'Zmienny miesięcznie',
};

const benchAlertSeverityLabels: Record<BenchAlertSeverity, string> = {
  auto: 'Auto',
  none: 'Nie alarmuj',
  watch: 'Obserwuj',
  warning: 'Wysoki alert',
  critical: 'Krytyczny alert',
};

export function PersonEditor({
  person,
  activePeriodId,
  periods,
  skills,
  isNew = false,
  onArchive,
  onClose,
  onOpenHelp,
  onSave,
}: PersonEditorProps) {
  const editorRef = useRef<HTMLFormElement | null>(null);
  const [draft, setDraft] = useState<Person>(() => structuredClone(person));
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isArchivePending, setIsArchivePending] = useState(false);
  const [shouldSyncInitialsWithName, setShouldSyncInitialsWithName] = useState(
    () => person.initials === getPersonInitialsFromName(person.name)
  );
  const [selectedPeriodId, setSelectedPeriodId] = useState(activePeriodId);

  useOnClickOutside(editorRef, onClose, { ignoreSelectors: ['.traffic-help-overlay'] });
  useAccessibleDialogKeyboard(editorRef, onClose, {
    ignoreSelectors: ['.traffic-help-overlay'],
    initialFocusSelector: 'input',
  });

  useEffect(() => {
    setDraft(structuredClone(person));
    setShouldSyncInitialsWithName(person.initials === getPersonInitialsFromName(person.name));
  }, [person.id]);

  useEffect(() => {
    setIsDetailsOpen(false);
    setIsArchivePending(false);
  }, [person.id]);

  useEffect(() => {
    setSelectedPeriodId(activePeriodId);
  }, [activePeriodId]);

  const patchDraft = (patch: Partial<Person>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const patchName = (name: string) => {
    setDraft((current) => ({
      ...current,
      name,
      initials: shouldSyncInitialsWithName ? getPersonInitialsFromName(name) : current.initials,
    }));
  };

  const patchInitials = (initials: string) => {
    setShouldSyncInitialsWithName(false);
    patchDraft({ initials });
  };

  const patchSkill = (skillId: SkillId, checked: boolean) => {
    setDraft((current) => {
      const currentSkillIds = current.skillIds || [];
      const nextSkillIds = checked
        ? [...new Set([...currentSkillIds, skillId])]
        : currentSkillIds.filter((id) => id !== skillId);
      return { ...current, skillIds: nextSkillIds };
    });
  };

  const patchCostModel = (patch: Partial<PersonCostModel>) => {
    patchDraft({ costModel: { ...draft.costModel, ...patch } });
  };

  const patchBaseMonthlyCost = (monthlyCostK: number) => {
    patchDraft({
      monthlyCostK,
      costModel: { ...draft.costModel, fixedMonthlyCostK: monthlyCostK },
    });
  };

  const patchLayers = (patch: Partial<Person['layers']>) => {
    patchDraft({ layers: { ...draft.layers, ...patch } });
  };

  const baseTileCount = draft.monthlyCostK > 0 ? Math.ceil(draft.monthlyCostK) : 0;
  const draftSkillIds = draft.skillIds || [];
  const canArchive = Boolean(onArchive && !isNew);
  const savePerson = () => {
    onSave(draft);
    onClose();
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    savePerson();
  };

  return (
    <form
      aria-label="Edytor osoby"
      aria-modal="true"
      className="traffic-editor"
      ref={editorRef}
      role="dialog"
      tabIndex={-1}
      onSubmit={handleSubmit}
    >
      <div className="traffic-editor-header">
        <div>
          <h2>Osoba</h2>
          <p>Podstawowe dane osoby i koszt miesięczny.</p>
        </div>
        <button aria-label="Zamknij edytor osoby" className="traffic-icon-button" type="button" onClick={onClose}>
          x
        </button>
      </div>

      <section className="traffic-editor-section is-first">
        <HelpSectionHeader title="Dane i koszt bazowy" topicId="person-basic" onOpenHelp={onOpenHelp} />
        <div className="traffic-form-grid">
          <label>
            Imię i nazwisko
            <input value={draft.name} onChange={(event) => patchName(event.target.value)} />
          </label>
          <label>
            Koszt miesięczny (k PLN / kafelki)
            <input
              aria-describedby="person-base-cost-summary"
              min={0}
              type="number"
              value={draft.monthlyCostK}
              onChange={(event) => patchBaseMonthlyCost(Number(event.target.value))}
            />
          </label>
        </div>
        <p className="traffic-editor-section-note" id="person-base-cost-summary">
          {baseTileCount} kafelków w inventory.
        </p>
      </section>

      <div className="traffic-editor-details-toggle">
        <button
          aria-controls="person-advanced-details"
          aria-expanded={isDetailsOpen}
          className="traffic-button"
          type="button"
          onClick={() => setIsDetailsOpen((current) => !current)}
        >
          {isDetailsOpen ? 'Ukryj szczegóły' : 'Więcej szczegółów'}
        </button>
      </div>

      {isDetailsOpen ? (
        <div className="traffic-editor-advanced" id="person-advanced-details">
          <section className="traffic-editor-section">
            <HelpSectionHeader title="Profil i model" topicId="person-basic" onOpenHelp={onOpenHelp} />
            <div className="traffic-form-grid">
              <label>
                Rola
                <input value={draft.role} onChange={(event) => patchDraft({ role: event.target.value })} />
              </label>
              <label>
                Inicjały
                <input value={draft.initials} onChange={(event) => patchInitials(event.target.value)} />
              </label>
              <label>
                Kolor
                <input type="color" value={draft.color} onChange={(event) => patchDraft({ color: event.target.value })} />
              </label>
              <label>
                Poziom
                <select
                  value={draft.seniority || ''}
                  onChange={(event) => patchDraft({ seniority: event.target.value ? (event.target.value as Seniority) : undefined })}
                >
                  <option value="">Bez preferencji</option>
                  {seniorityOptions.map((seniority) => (
                    <option key={seniority} value={seniority}>
                      {seniorityLabels[seniority]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Model kosztu
                <select
                  value={draft.costModel.type}
                  onChange={(event) => patchCostModel({ type: event.target.value as PersonCostModel['type'] })}
                >
                  {costModelTypes.map((type) => (
                    <option key={type} value={type}>
                      {costModelLabels[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Alert ławki
                <select
                  value={draft.benchAlertSeverity || 'auto'}
                  onChange={(event) => patchDraft({ benchAlertSeverity: event.target.value as BenchAlertSeverity })}
                >
                  {Object.entries(benchAlertSeverityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Domyślne godziny miesięczne
                <input
                  min={0}
                  type="number"
                  value={draft.costModel.defaultMonthlyHours}
                  onChange={(event) => patchCostModel({ defaultMonthlyHours: Number(event.target.value) })}
                />
              </label>
              <label>
                Koszt wewnętrzny PLN/h
                <input
                  min={0}
                  type="number"
                  value={draft.costModel.internalHourlyCostPln ?? ''}
                  onChange={(event) =>
                    patchCostModel({ internalHourlyCostPln: event.target.value ? Number(event.target.value) : undefined })
                  }
                />
              </label>
              <label>
                Godziny pracy na 1k PLN
                <input
                  min={1}
                  type="number"
                  value={draft.hoursPerTile}
                  onChange={(event) => patchDraft({ hoursPerTile: Number(event.target.value) })}
                />
              </label>
            </div>
          </section>

          <MonthlyPersonOverrideEditor
            person={draft}
            periods={periods}
            selectedPeriodId={selectedPeriodId}
            onChange={setDraft}
            onOpenHelp={onOpenHelp}
            onSelectedPeriodChange={setSelectedPeriodId}
          />

          <section className="traffic-editor-section">
            <HelpSectionHeader title="Kompetencje" topicId="person-skills" onOpenHelp={onOpenHelp} />
            <div className="traffic-skill-picker">
              {skills.map((skill) => {
                const isSelected = draftSkillIds.includes(skill.id);
                return (
                  <button
                    aria-checked={isSelected}
                    className={`traffic-skill-chip ${isSelected ? 'is-selected' : ''}`}
                    key={skill.id}
                    role="checkbox"
                    type="button"
                    onClick={() => patchSkill(skill.id, !isSelected)}
                  >
                    <span className="traffic-skill-chip-box" aria-hidden="true" />
                    {skill.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="traffic-editor-section">
            <HelpSectionHeader title="Warstwy kosztu / celu" topicId="person-cost-layers" onOpenHelp={onOpenHelp} />
            <div className="traffic-form-grid">
              <label>
                Koszt pracy (k)
                <input
                  min={0}
                  type="number"
                  value={draft.layers.workK}
                  onChange={(event) => patchLayers({ workK: Number(event.target.value) })}
                />
              </label>
              <label>
                Admin/biuro (k)
                <input
                  min={0}
                  type="number"
                  value={draft.layers.adminK}
                  onChange={(event) => patchLayers({ adminK: Number(event.target.value) })}
                />
              </label>
              <label>
                Sprzedaż/marketing (k)
                <input
                  min={0}
                  type="number"
                  value={draft.layers.salesK}
                  onChange={(event) => patchLayers({ salesK: Number(event.target.value) })}
                />
              </label>
              <label>
                Cel przychodu (k)
                <input
                  min={0}
                  type="number"
                  value={draft.layers.targetK}
                  onChange={(event) => patchLayers({ targetK: Number(event.target.value) })}
                />
              </label>
            </div>
          </section>

          <label className="traffic-field-block">
            Preferencje / ryzyka HR
            <textarea
              value={(draft.preferences || []).join('\n')}
              onChange={(event) =>
                patchDraft({
                  preferences: event.target.value
                    .split('\n')
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        </div>
      ) : null}

      <div className={`traffic-editor-actions ${canArchive ? 'has-destructive' : ''}`}>
        {canArchive ? (
          <div className="traffic-editor-action-group">
            <button
              aria-label={`${isArchivePending ? 'Potwierdź archiwizację osoby' : 'Archiwizuj osobę'}: ${draft.name}`}
              className={`traffic-button ${isArchivePending ? 'is-danger' : ''}`}
              type="button"
              onClick={() => {
                if (isArchivePending) {
                  onArchive?.(person.id);
                  onClose();
                  return;
                }
                setIsArchivePending(true);
              }}
            >
              {isArchivePending ? 'Potwierdź archiwizację' : 'Archiwizuj osobę'}
            </button>
          </div>
        ) : null}
        <div className="traffic-editor-action-group">
          <button className="traffic-button" type="button" onClick={onClose}>
            Anuluj
          </button>
          <button
            className="traffic-button is-primary"
            type="submit"
            onClick={(event) => {
              event.preventDefault();
              savePerson();
            }}
          >
            Zapisz osobę
          </button>
        </div>
      </div>
    </form>
  );
}
