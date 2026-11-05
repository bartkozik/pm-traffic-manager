import { getProjectInventoryPatternCode } from './visualInventory';
import type { SkillId } from '../models/traffic.model';

export const visualPatterns = [
  { id: 'red', label: 'Red pressure', detail: 'risks, overflow, or a plan that falls short of target', tone: 'red' },
  { id: 'yellow', label: 'Yellow gap', detail: 'available frame capacity or lower deal confidence', tone: 'yellow' },
  { id: 'green', label: 'Green coverage', detail: 'allocation meets the target or signals healthy coverage', tone: 'green' },
  { id: 'blue', label: 'Blue reservation', detail: 'ghost deal / future opportunity reserved on the board', tone: 'blue' },
  { id: 'orange', label: 'Orange defensive work', detail: 'defensive project: revenue now, potential capacity constraint', tone: 'orange' },
  { id: 'purple', label: 'Purple R&D / waiting room', detail: 'experiment, low commercial return, or waiting-room project', tone: 'purple' },
  { id: 'dark', label: 'Dark leave / unavailability', detail: 'leave or other planned unavailability cost without revenue', tone: 'dark' },
  { id: 'mixed', label: 'Mixed group', detail: 'the same person has substantial work across several projects', tone: 'mixed' },
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
  { id: 'unchanged', className: 'is-unchanged', label: 'unchanged', detail: 'confirmed: stays as it was' },
  { id: 'changed', className: 'is-changed', label: 'change', detail: 'agreed or changed this week' },
  { id: 'handoff', className: 'is-handoff', label: 'info', detail: 'requires a handoff' },
  { id: 'plan-b', className: 'is-plan-b', label: 'Plan B', detail: 'fallback' },
  { id: 'mentoring', className: 'is-mentoring', label: 'mentor', detail: 'mentoring in the project' },
  { id: 'backup', className: 'is-backup', label: 'backup', detail: 'another person knows the context' },
  { id: 'moved', className: 'is-moved', label: 'move', detail: 'person moved from the previous target' },
  { id: 'active-engagement', className: 'is-active-engagement', label: '20h+', detail: 'substantial engagement in this period' },
  { id: 'unavailable-context', className: 'is-unavailable-context', label: 'HR', detail: 'leave, unavailability, or notice period' },
  { id: 'low-workload', className: 'is-low-workload', label: 'bench', detail: 'tile is on the bench or outside a project' },
  { id: 'bench-only', className: 'is-bench-only', label: '0h', detail: 'person has no productive work in this period' },
  { id: 'underloaded', className: 'is-underloaded', label: 'low', detail: 'too little productive work in this period' },
  { id: 'underloaded-critical', className: 'is-underloaded-critical', label: 'low', detail: 'extremely low productive utilization' },
  { id: 'rd-work', className: 'is-rd-work', label: 'R&D', detail: 'allocation in an experiment / R&D' },
  { id: 'waiting-room', className: 'is-waiting-room', label: 'wait', detail: 'allocation in a waiting-room project' },
  { id: 'low-value', className: 'is-low-value', label: 'low', detail: 'defensive, ghost, or uncertain project' },
  { id: 'ownership', className: 'is-ownership', label: 'PM', detail: 'ownership / PM marker' },
] as const;

export const frameGeometryLegend = [
  { id: 'filled', className: 'is-filled', label: 'filled', detail: 'people and revenue/capacity within the project frame' },
  { id: 'empty', className: 'is-empty', label: 'free / window', detail: 'empty space: available cap or part of a fixed-price window/pool' },
  { id: 'poolRemaining', className: 'is-poolRemaining', label: 'remaining pool', detail: 'fixed price: part of the shared pool that may be needed later' },
  { id: 'overflow', className: 'is-overflow', label: 'overflow', detail: 'allocation exceeding project funding or cap' },
] as const;

export const weeklySlotLegend = [
  { id: 'auto', className: 'is-auto', label: 'W1', hours: '16h', title: 'proportional', detail: 'hours spread from the month without a manual weekly override' },
  { id: 'manual', className: 'is-manual', label: 'W2', hours: '24h', title: 'manually', detail: 'week has manually set allocation hours' },
  { id: 'heavy', className: 'is-heavy', label: 'W3', hours: '20h+', title: 'heavy week', detail: 'week carries at least 20h for this person in the project' },
] as const;

export const relationshipLegend = [
  { id: 'unchanged', className: 'is-unchanged', label: 'unchanged', detail: 'assignment stays as it was' },
  { id: 'moved', className: 'is-moved', label: 'move', detail: 'previous target → current project frame, with an overlay line' },
  { id: 'changed', className: 'is-changed', label: 'change', detail: 'allocation agreed or changed this week' },
  { id: 'handoff', className: 'is-handoff', label: 'handoff', detail: 'someone needs a handoff after the change' },
  { id: 'plan-b', className: 'is-plan-b', label: 'Plan B', detail: 'fallback or alternative staffing' },
  { id: 'mentoring', className: 'is-mentoring', label: 'mentoring', detail: 'support relationship in the project' },
  { id: 'backup', className: 'is-backup', label: 'backup', detail: 'another person knows the context or code' },
  { id: 'fragmented', className: 'is-fragmented', label: 'fragmentation', detail: 'the same person has substantial work across several targets, with an overlay line' },
] as const;

export const personCardStateLegend = [
  { id: 'fragmentation', className: 'has-fragmentation', label: 'fragmented person', detail: 'the same person has substantial work across several projects' },
  { id: 'unavailable', className: 'has-unavailable-context', label: 'HR / unavailability', detail: 'leave, notice period, or missing HR context' },
  { id: 'low-workload', className: 'has-low-workload', label: 'bench', detail: 'at least some tiles are outside a project' },
  { id: 'bench-only', className: 'has-bench-only', label: 'no project', detail: 'person has no productive work in this period' },
  { id: 'underloaded', className: 'has-underloaded', label: 'underloaded', detail: 'person has productive work below the healthy threshold' },
  { id: 'underloaded-critical', className: 'has-underloaded-critical', label: 'very little work', detail: 'person has extremely low productive utilization' },
  { id: 'rd-work', className: 'has-rd-work', label: 'R&D', detail: 'person works on an experiment / R&D' },
  { id: 'waiting-room', className: 'has-waiting-room', label: 'waiting room', detail: 'person works on a waiting-room project' },
  { id: 'time-off', className: 'has-time-off', label: 'leave', detail: 'part of the person cost is planned as leave / unavailability' },
  { id: 'low-value', className: 'has-low-value', label: 'low value', detail: 'defensive, ghost, or uncertain project' },
  { id: 'active', className: 'has-active-engagement', label: '20h+', detail: 'substantial engagement: the person card gets a strong right border' },
  { id: 'ownership', className: 'has-ownership', label: 'ownership', detail: 'PM or person responsible for the agreement' },
] as const;

export const projectInventoryStateLegend = [
  { id: 'healthy-team', className: 'is-healthy-team', code: getProjectInventoryPatternCode('healthyTeam'), label: 'self-sufficient team', detail: 'several people cover the frame without gaps or fragmentation' },
  { id: 'single-person', className: 'is-single-person', code: getProjectInventoryPatternCode('singlePersonProject'), label: 'one-person project', detail: 'one person holds the context projektu' },
  { id: 'people-shortage', className: 'is-people-shortage', code: getProjectInventoryPatternCode('peopleShortage'), label: 'People shortage', detail: 'missing hours in project requirements' },
  { id: 'empty-project', className: 'is-empty-project', code: getProjectInventoryPatternCode('emptyProject'), label: 'no people', detail: 'no person is assigned to the project this month' },
  { id: 'many-project-people', className: 'is-many-project-people', code: getProjectInventoryPatternCode('manyProjectPeople'), label: 'people across multiple projects', detail: 'someone in the frame also works elsewhere' },
  { id: 'fragmented-collaborators', className: 'is-fragmented-collaborators', code: getProjectInventoryPatternCode('fragmentedCollaborators'), label: 'mixed team', detail: 'a dedicated person works with colleagues split across projects' },
  { id: 'rd-project', className: 'is-rd-project', code: getProjectInventoryPatternCode('researchDevelopmentProject'), label: 'R&D', detail: 'experiment / investment without a direct commercial return' },
  { id: 'waiting-room-project', className: 'is-waiting-room-project', code: getProjectInventoryPatternCode('waitingRoomProject'), label: 'waiting room', detail: 'project uses capacity without a clear deliverable or decision' },
  { id: 'low-value-project', className: 'is-low-value-project', code: getProjectInventoryPatternCode('lowValueProject'), label: 'low value', detail: 'defensive, ghost, or uncertain project' },
  { id: 'source-mismatch', className: 'is-source-mismatch', code: getProjectInventoryPatternCode('sourceMismatch'), label: 'source/scope', detail: 'scope changed but CRM/source is outdated' },
] as const;

export type VisualPatternTone = typeof visualPatterns[number]['tone'];
