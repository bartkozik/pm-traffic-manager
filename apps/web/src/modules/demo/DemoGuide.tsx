import { useEffect, useRef, useState } from 'react';
import { Modal } from '@mantine/core';

const steps = [
  {
    title: 'Przydziel osoby do projektów',
    description: 'Po lewej znajdziesz osoby i ich dostępny czas. Po prawej są projekty, do których możesz przydzielać pracę.',
    action: 'Przeciągnij kafelek osoby do projektu. Obserwuj, jak zmieniają się dostępność i obciążenie.',
    hint: 'Kafelki reprezentują czas pracy. Kolory i oznaczenia wyjaśnia legenda na tablicy.',
    labels: ['Osoba', 'Czas pracy', 'Projekt'],
  },
  {
    title: 'Zmieniaj perspektywę czasu',
    description: 'Plan zaczyna się od bieżącego miesiąca. Pasek nad tablicą pozwala przechodzić między miesiącami i wybierać tygodnie.',
    action: 'Wybierz tydzień, aby przyjrzeć się krótszemu okresowi, albo przejdź do kolejnego miesiąca.',
    hint: 'Sprawdzaj zaznaczony okres przed przenoszeniem kafelków — pracujesz na wybranym fragmencie planu.',
    labels: ['Miesiąc', 'Tydzień', 'Plan'],
  },
  {
    title: 'Porównuj koszty i przychody',
    description: 'Przydziały łączą czas zespołu z kosztami i przychodami projektów. Zmiana planu wpływa na te wartości.',
    action: 'Użyj przełącznika „P/L” na dolnym pasku, aby sprawdzić finansową stronę planowania.',
    hint: 'To dane demonstracyjne. Możesz zmieniać przydziały i porównywać warianty bez wpływu na rzeczywisty zespół.',
    labels: ['Przydział', 'Koszt', 'Przychód'],
  },
  {
    title: 'Eksperymentuj bez obaw',
    description: 'Masz prywatną tablicę z fikcyjnymi danymi. Inni odwiedzający nie zobaczą Twoich zmian. Asystenta planowania znajdziesz w „Opcjach tablicy”.',
    action: '„Reset demo” odtworzy dane startowe. Do przewodnika wrócisz przyciskiem „Jak to działa?” na górze strony.',
    hint: 'AI jest opcjonalne: do 3 analiz na sesję, w ramach wspólnego budżetu demo. Dane tablicy są wysyłane do OpenAI dopiero po uruchomieniu analizy. Reset nie odnawia limitu. Nie wpisuj poufnych danych.',
    labels: ['Eksperyment', 'Reset', 'Nowy plan'],
  },
] as const;

export function DemoGuide({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => { heading.current?.focus(); }, [index]);

  return <Modal
    opened
    onClose={onClose}
    title="Przewodnik po demo"
    size="lg"
    centered
    returnFocus={false}
    transitionProps={{ duration: 0 }}
    overlayProps={{ backgroundOpacity: 0.7 }}
    closeButtonProps={{ 'aria-label': 'Zamknij przewodnik' }}
    classNames={{ content: 'demo-guide', header: 'demo-guide-header', title: 'demo-guide-title', close: 'demo-guide-close', body: 'demo-guide-body' }}
  >
    <p className="demo-guide-progress">Krok {index + 1} z {steps.length} · Około minuty</p>
    <div className="demo-guide-track" aria-hidden="true">
      {steps.map((item, position) => <span key={item.title} data-current={position === index || undefined} data-complete={position < index || undefined} />)}
    </div>
    <h2 ref={heading} tabIndex={-1} data-autofocus>{step.title}</h2>
    <p>{step.description}</p>
    <div className="demo-guide-example" aria-hidden="true">
      {step.labels.map((label, position) => <span key={label}>
        <small>0{position + 1}</small>{label}
      </span>)}
    </div>
    <p className="demo-guide-action">{step.action}</p>
    <p className="demo-guide-hint">{step.hint}</p>
    <div className="demo-guide-actions">
      <button type="button" className="demo-guide-skip" onClick={onClose}>Pomiń przewodnik</button>
      <div>
        {index > 0 && <button type="button" onClick={() => setIndex(index - 1)}>Wstecz</button>}
        <button type="button" className="demo-guide-next" onClick={last ? onClose : () => setIndex(index + 1)}>
          {last ? 'Zaczynam planować' : 'Dalej'}
        </button>
      </div>
    </div>
  </Modal>;
}
