import { useEffect, useMemo, useState } from 'react';
import './WeeklyDrilldown.css';
import { Period, Person, PersonTileAllocation, ProjectFrame, Skill } from '../models/traffic.model';
import { buildWeeklyDrilldown } from '../utils/weeklyDrilldown';

interface WeeklyDrilldownProps {
  allocations: PersonTileAllocation[];
  people: Person[];
  peopleById: Map<string, Person>;
  period: Period;
  periods: Period[];
  projects: ProjectFrame[];
  skillsById: Map<string, Skill>;
}

export function WeeklyDrilldown({
  allocations,
  people,
  peopleById,
  period,
  periods,
  projects,
  skillsById,
}: WeeklyDrilldownProps) {
  const weeks = useMemo(() => buildWeeklyDrilldown({
    allocations,
    monthPeriod: period,
    people,
    periods,
    projects,
  }), [allocations, people, period, periods, projects]);
  const [selectedWeekId, setSelectedWeekId] = useState(weeks[0]?.period.id || '');

  useEffect(() => {
    setSelectedWeekId((current) => (
      weeks.some((week) => week.period.id === current) ? current : weeks[0]?.period.id || ''
    ));
  }, [weeks]);

  const selectedWeek = weeks.find((week) => week.period.id === selectedWeekId) || weeks[0];
  if (!selectedWeek) return null;

  return (
    <section className="traffic-weekly-drilldown" aria-label={`${period.label} - podział tygodniowy`}>
      <div className="traffic-week-tabs">
        {weeks.map((week) => (
          <button
            className={`traffic-week-tab is-${week.overloadedPeople ? 'over' : 'ok'} ${week.period.id === selectedWeek.period.id ? 'is-active' : ''}`}
            key={week.period.id}
            type="button"
            onClick={() => setSelectedWeekId(week.period.id)}
          >
            <strong>{week.period.label.replace(`${period.label} `, '')}</strong>
            <span>{week.period.startsOn} - {week.period.endsOn}</span>
            <em>{week.allocatedHours}/{week.availableHours}h · {week.utilizationPercent}%</em>
          </button>
        ))}
      </div>

      <div className="traffic-week-detail">
        <div className="traffic-week-people">
          <div className="traffic-section-title">
            <span>Obciążenie ludzi</span>
            <span>{selectedWeek.overloadedPeople} przeciążeń</span>
          </div>
          <div className="traffic-week-people-list">
            {selectedWeek.people.map((load) => {
              const person = peopleById.get(load.personId);
              if (!person) return null;

              return (
                <div className={`traffic-week-person is-${load.status}`} key={load.personId}>
                  <span className="traffic-person-dot" style={{ background: person.color }} />
                  <strong>{person.name}</strong>
                  <span>{load.allocatedHours}/{load.availableHours}h</span>
                  <div className="traffic-utilization-meter" aria-label={`${load.utilizationPercent}% wykorzystania tygodniowego`}>
                    <span style={{ width: `${Math.min(100, load.utilizationPercent)}%` }} />
                  </div>
                  <small>{load.utilizationPercent}% tygodniowo</small>
                </div>
              );
            })}
          </div>
        </div>

        <div className="traffic-week-projects">
          <div className="traffic-section-title">
            <span>Praca na projektach</span>
            <span>{selectedWeek.projectWorkloads.length}</span>
          </div>
          <div className="traffic-week-project-list">
            {selectedWeek.projectWorkloads.length ? selectedWeek.projectWorkloads.map((workload) => {
              const skill = workload.skillId ? skillsById.get(workload.skillId) : undefined;

              return (
                <div className="traffic-week-project" key={`${workload.projectId}-${workload.skillId || 'unassigned'}`}>
                  <strong>{workload.client}</strong>
                  <span>{workload.projectName}</span>
                  <em>{skill?.label || 'Bez kompetencji'} · {workload.hours}h · {workload.revenueK}k</em>
                </div>
              );
            }) : (
              <div className="traffic-week-empty">Brak produktywnych alokacji w tym tygodniu.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
