import { HelpTopicId } from '../help/helpContent';
import { MonthlyOverrideStatus, Period, Person } from '../models/traffic.model';
import { getPersonPeriodOverride, getPersonPeriodProfile, removeMonthlyOverride, upsertMonthlyOverride } from '../utils/personPeriod';
import { HelpSectionHeader } from './HelpSectionHeader';
import './TrafficEditors.css';

interface MonthlyPersonOverrideEditorProps {
  person: Person;
  periods: Period[];
  selectedPeriodId: string;
  onChange: (person: Person) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onSelectedPeriodChange: (periodId: string) => void;
}

function getOptionalNumber(value: string) {
  return value === '' ? undefined : Number(value);
}

const overrideStatuses: { value: MonthlyOverrideStatus; label: string }[] = [
  { value: 'holiday', label: 'Urlop' },
  { value: 'notice_period', label: 'Okres wypowiedzenia' },
  { value: 'partial_availability', label: 'Częściowa dostępność' },
  { value: 'unavailable', label: 'Niedostępny' },
  { value: 'other', label: 'Inne' },
];

export function MonthlyPersonOverrideEditor({
  person,
  periods,
  selectedPeriodId,
  onChange,
  onOpenHelp,
  onSelectedPeriodChange,
}: MonthlyPersonOverrideEditorProps) {
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  const selectedOverride = getPersonPeriodOverride(person, selectedPeriodId);
  const selectedProfile = getPersonPeriodProfile(person, selectedPeriodId);
  const selectedOverrideLayers = selectedOverride?.layers;

  const patchSelectedOverride = (patch: Parameters<typeof upsertMonthlyOverride>[2]) => {
    onChange(upsertMonthlyOverride(person, selectedPeriodId, patch));
  };

  const clearSelectedOverride = () => {
    onChange(removeMonthlyOverride(person, selectedPeriodId));
  };

  const patchLayer = (key: keyof Person['layers'], value: string) => {
    const parsedValue = getOptionalNumber(value);
    patchSelectedOverride({
      layers: parsedValue === undefined
        ? undefined
        : {
            ...(selectedOverrideLayers || selectedProfile.layers),
            [key]: parsedValue,
          },
    });
  };

  return (
    <section className="traffic-editor-section">
      <HelpSectionHeader
        title="Dostępność i koszt w miesiącu"
        topicId="person-monthly-override"
        onOpenHelp={onOpenHelp}
        actions={(
          <button className="traffic-button" type="button" onClick={clearSelectedOverride}>
            Wyczyść nadpisanie
          </button>
        )}
      >
        <p className="traffic-editor-section-note">Nadpisanie działa tylko dla wybranego miesiąca.</p>
      </HelpSectionHeader>
      <div className="traffic-form-grid">
        <label>
          Miesiąc
          <select value={selectedPeriodId} onChange={(event) => onSelectedPeriodChange(event.target.value)}>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dostępne godziny
          <input
            min={0}
            type="number"
            value={selectedOverride?.availableHours ?? ''}
            placeholder={`${selectedProfile.costModel.defaultMonthlyHours}`}
            onChange={(event) =>
              patchSelectedOverride({
                availableHours: getOptionalNumber(event.target.value),
              })
            }
          />
        </label>
        <label>
          Status HR
          <select
            value={selectedOverride?.status || ''}
            onChange={(event) =>
              patchSelectedOverride({
                status: event.target.value ? (event.target.value as MonthlyOverrideStatus) : undefined,
              })
            }
          >
            <option value="">bez statusu</option>
            {overrideStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Inny koszt PLN/h
          <input
            min={0}
            type="number"
            value={selectedOverride?.internalHourlyCostPln ?? ''}
            placeholder={selectedProfile.costModel.internalHourlyCostPln ? `${selectedProfile.costModel.internalHourlyCostPln}` : 'brak'}
            onChange={(event) =>
              patchSelectedOverride({
                internalHourlyCostPln: getOptionalNumber(event.target.value),
              })
            }
          />
        </label>
        <label>
          Inny koszt miesięczny (k)
          <input
            min={0}
            type="number"
            value={selectedOverride?.fixedMonthlyCostK ?? ''}
            placeholder={`${selectedProfile.monthlyCostK}`}
            onChange={(event) =>
              patchSelectedOverride({
                fixedMonthlyCostK: getOptionalNumber(event.target.value),
              })
            }
          />
        </label>
      </div>
      <label className="traffic-field-block">
        Notatka statusu
        <textarea
          value={selectedOverride?.note || ''}
          placeholder="np. urlop 10-14.03, notice period, tylko 3 dni/tydz."
          onChange={(event) =>
            patchSelectedOverride({
              note: event.target.value || undefined,
            })
          }
        />
      </label>
      <div className="traffic-form-grid">
        <label>
          Koszt pracy (k)
          <input
            min={0}
            type="number"
            value={selectedOverrideLayers?.workK ?? ''}
            placeholder={`${selectedProfile.layers.workK}`}
            onChange={(event) => patchLayer('workK', event.target.value)}
          />
        </label>
        <label>
          Koszt z admin/biuro (k)
          <input
            min={0}
            type="number"
            value={selectedOverrideLayers?.adminK ?? ''}
            placeholder={`${selectedProfile.layers.adminK}`}
            onChange={(event) => patchLayer('adminK', event.target.value)}
          />
        </label>
        <label>
          Koszt ze sprzedaż/marketing (k)
          <input
            min={0}
            type="number"
            value={selectedOverrideLayers?.salesK ?? ''}
            placeholder={`${selectedProfile.layers.salesK}`}
            onChange={(event) => patchLayer('salesK', event.target.value)}
          />
        </label>
        <label>
          Cel przychodu (k)
          <input
            min={0}
            type="number"
            value={selectedOverrideLayers?.targetK ?? ''}
            placeholder={`${selectedProfile.layers.targetK}`}
            onChange={(event) => patchLayer('targetK', event.target.value)}
          />
        </label>
      </div>
      <p className="traffic-editor-section-note">
        {selectedOverride
          ? `${selectedPeriod?.label || selectedPeriodId}: zapisane nadpisanie miesięczne.`
          : `${selectedPeriod?.label || selectedPeriodId}: używane są wartości bazowe osoby.`}
      </p>
    </section>
  );
}
