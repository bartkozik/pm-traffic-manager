import { useEffect, useRef, useState } from 'react';
import { Modal } from '@mantine/core';

const steps = [
  {
    title: 'Assign people to projects',
    description: 'People and their available time are on the left. Projects you can assign work to are on the right.',
    action: 'Drag a person’s tile into a project. Watch their availability and workload change.',
    hint: 'Tiles represent working time. The board legend explains their colours and indicators.',
    labels: ['Person', 'Working time', 'Project'],
  },
  {
    title: 'Explore different time periods',
    description: 'The plan starts in the current month. Use the bar above the board to move between months and select weeks.',
    action: 'Select a week for a closer look, or move to the next month.',
    hint: 'Check the selected period before moving tiles — your changes apply to that part of the plan.',
    labels: ['Month', 'Week', 'Plan'],
  },
  {
    title: 'Compare costs and revenue',
    description: 'Allocations connect team time with project costs and revenue. Changing the plan affects these figures.',
    action: 'Use the “P/L” toggle in the bottom bar to see the financial side of your plan.',
    hint: 'This is sample data. Change allocations and compare scenarios without affecting a real team.',
    labels: ['Allocation', 'Cost', 'Revenue'],
  },
  {
    title: 'Experiment freely',
    description: 'Your board contains fictional data and is private to your session. Other visitors cannot see your changes. Find the AI planning assistant in “Board options”.',
    action: '“Reset demo” restores the sample data. Reopen this guide with “Quick guide” at the top of the page.',
    hint: 'AI is optional: up to 3 analyses per session, subject to the shared demo budget. Board data is sent to OpenAI only when you run an analysis. Resetting does not renew the limit. Do not enter confidential information.',
    labels: ['Experiment', 'Reset', 'New plan'],
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
    title="Demo guide"
    size="lg"
    centered
    returnFocus={false}
    transitionProps={{ duration: 0 }}
    overlayProps={{ backgroundOpacity: 0.7 }}
    closeButtonProps={{ 'aria-label': 'Close guide' }}
    classNames={{ content: 'demo-guide', header: 'demo-guide-header', title: 'demo-guide-title', close: 'demo-guide-close', body: 'demo-guide-body' }}
  >
    <p className="demo-guide-progress">Step {index + 1} of {steps.length} · About a minute</p>
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
      <button type="button" className="demo-guide-skip" onClick={onClose}>Skip guide</button>
      <div>
        {index > 0 && <button type="button" onClick={() => setIndex(index - 1)}>Back</button>}
        <button type="button" className="demo-guide-next" onClick={last ? onClose : () => setIndex(index + 1)}>
          {last ? 'Start planning' : 'Next'}
        </button>
      </div>
    </div>
  </Modal>;
}
