import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Person, Skill } from '../models/traffic.model';
import { PersonVisualBadge } from './PersonVisualBadge';

const skills: Skill[] = [
  { id: 'backend', label: 'Backend', defaultTargetRatePlnH: 260 },
  { id: 'qa', label: 'QA', defaultTargetRatePlnH: 190 },
];

const person: Person = {
  id: 'maks',
  name: 'Maks',
  role: 'Backend Developer',
  initials: "MP",
  color: '#10b981',
  skillIds: ['backend', 'qa'],
  seniority: 'senior',
  costModel: {
    type: 'fixed_monthly',
    defaultMonthlyHours: 160,
    internalHourlyCostPln: 120,
    fixedMonthlyCostK: 16,
  },
  monthlyCostK: 16,
  hoursPerTile: 6,
  layers: { workK: 10, adminK: 13, salesK: 16, targetK: 21 },
};

describe('PersonVisualBadge', () => {
  it('renders seniority and skill glyphs from existing person skills', () => {
    render(<PersonVisualBadge person={person} skillsById={new Map(skills.map((skill) => [skill.id, skill]))} />);

    expect(screen.getByText('Sr')).toBeInTheDocument();
    expect(screen.getByText('BE')).toBeInTheDocument();
    expect(screen.getByText('QA')).toBeInTheDocument();
    expect(screen.getByLabelText('seniority Sr, kompetencje: Backend, QA')).toBeInTheDocument();
  });
});
