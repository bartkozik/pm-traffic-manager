import { useEffect } from 'react';
import {
  getContractTypeLabel,
  getStageLabel,
  type Period,
  type ProjectFrame,
} from '../models/traffic.model';
import { getProjectPeriodRevenueK } from './diabloLayout';

interface DiabloHiddenProjectsModalProps {
  period: Period;
  projects: ProjectFrame[];
  onClose: () => void;
  onRestoreProject: (projectId: string) => void;
}

export function DiabloHiddenProjectsModal({
  period,
  projects,
  onClose,
  onRestoreProject,
}: DiabloHiddenProjectsModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="diablo-hidden-projects-overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="diablo-hidden-projects-title"
        aria-modal="true"
        className="diablo-hidden-projects-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="diablo-hidden-projects-header">
          <div>
            <span>{period.label}</span>
            <h2 id="diablo-hidden-projects-title">Ukryte projekty</h2>
          </div>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </header>

        {projects.length ? (
          <div className="diablo-hidden-projects-list">
            {projects.map((project) => {
              const revenueK = getProjectPeriodRevenueK(project, period.id);

              return (
                <article className="diablo-hidden-project-row" key={project.id}>
                  <div>
                    <strong>{project.client}</strong>
                    <span>{project.name}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Typ</dt>
                      <dd>{getContractTypeLabel(project.contractType)}</dd>
                    </div>
                    <div>
                      <dt>Etap</dt>
                      <dd>{getStageLabel(project.stage)}</dd>
                    </div>
                    <div>
                      <dt>Plan</dt>
                      <dd>{revenueK}k</dd>
                    </div>
                  </dl>
                  <button type="button" onClick={() => onRestoreProject(project.id)}>
                    Przywróć
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="diablo-hidden-projects-empty">Brak ukrytych projektów w tym miesiącu.</p>
        )}
      </section>
    </div>
  );
}
