import type { ReactNode, Ref } from 'react';
import styles from './DemoToolbar.module.css';

type DemoToolbarProps = {
  projectName: string;
  portfolioUrl: string;
  busy: boolean;
  onOpenGuide: () => void;
  onReset: () => void;
  guideButtonRef?: Ref<HTMLButtonElement>;
  details?: ReactNode;
};

export function DemoToolbar({
  projectName,
  portfolioUrl,
  busy,
  onOpenGuide,
  onReset,
  guideButtonRef,
  details,
}: Readonly<DemoToolbarProps>): JSX.Element {
  return (
    <nav className={styles.toolbar} aria-label="Demo navigation">
      <div className={styles.row}>
        <div className={styles.identity}>
          <a className={styles.portfolio} href={portfolioUrl} aria-label="Back to portfolio — kozikowski.it">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="m12 5-7 7 7 7M5 12h14" />
            </svg>
            kozikowski.it
          </a>
          <span className={styles.project}>{projectName}</span>
          <span className={styles.badge}>Live demo</span>
        </div>
        <div className={styles.actions}>
          <button type="button" ref={guideButtonRef} disabled={busy} onClick={onOpenGuide}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 15.5v1" />
            </svg>
            Quick guide
          </button>
          <button type="button" disabled={busy} onClick={onReset}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 4v6h6M3.5 10a8.5 8.5 0 1 1 .5 5" />
            </svg>
            Reset demo
          </button>
        </div>
      </div>
      <div className={styles.details}>
        <span>Private workspace · Fictional data · Up to 24 hours</span>
        {details}
      </div>
    </nav>
  );
}
