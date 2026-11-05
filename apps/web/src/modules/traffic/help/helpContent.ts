export type HelpTopicId =
  | 'allocation-mapping'
  | 'allocation-calculation'
  | 'allocation-validation'
  | 'allocation-weekly-hours'
  | 'bench'
  | 'generated-risks'
  | 'lens-summary'
  | 'person-basic'
  | 'person-collaboration'
  | 'person-cost-layers'
  | 'person-monthly-override'
  | 'people-palette'
  | 'person-skills'
  | 'period-planning'
  | 'people-availability'
  | 'project-basic'
  | 'project-monthly-split'
  | 'project-people-fit'
  | 'project-requirements'
  | 'project-risks'
  | 'relationship-overlay'
  | 'tile-scale'
  | 'traffic-review'
  | 'visual-inventory'
  | 'weekly-drilldown';

export interface HelpTopicSection {
  heading: string;
  body: string;
}

export interface HelpTopic {
  id: HelpTopicId;
  title: string;
  summary: string;
  tags: string[];
  sections: HelpTopicSection[];
}

export const helpTopics: HelpTopic[] = [
  {
    id: 'people-palette',
    title: "People palette",
    summary: "How to use people and tiles from the left palette.",
    tags: ["people", "palette", "drag", "tiles", "reset"],
    sections: [
      {
        heading: "What does this section show?",
        body: "The palette shows active people, their cost, skills, and tiles that are not yet assigned to a project in the active month.",
      },
      {
        heading: "How do I plan?",
        body: "Drag a person onto a project to move all their free tiles, or drag one tile to assign only part of the month.",
      },
      {
        heading: "Reset a person",
        body: "When a person has tiles in projects, Reset appears on their card. It moves all their tiles from the active month back to the bench.",
      },
      {
        heading: "Reset project allocations",
        body: "The project panel has a Reset allocations action. A second click on Confirm moves all project tiles in the active month back to the bench.",
      },
      {
        heading: "Clear a month",
        body: "The bottom Diablo bar has a Clear month action. It hides people and projects only in the active month and removes its tiles, without archiving or deleting database records.",
      },
    ],
  },
  {
    id: 'person-basic',
    title: "Person details and cost model",
    summary: "Basic person fields, cost, and default hours.",
    tags: ["person", "cost", "hours", "seniority"],
    sections: [
      {
        heading: "What does this section change?",
        body: "Sets basic person details, default monthly availability, internal cost, and the hours represented by one tile.",
      },
      {
        heading: "Where is this used?",
        body: "These fields affect monthly cost, person utilization, margin calculations, and the number of generated tiles.",
      },
    ],
  },
  {
    id: 'person-monthly-override',
    title: "Monthly availability and cost",
    summary: "Person overrides for a specific month.",
    tags: ["person", "month", "availability", "cost", "hr"],
    sections: [
      {
        heading: "What does this section change?",
        body: "Overrides available hours, cost, and target thresholds for the selected month only. The base person settings remain unchanged.",
      },
      {
        heading: "When should I use it?",
        body: "Use it for leave, a notice period, partial availability, a cost change in a specific month, or a temporary revenue target.",
      },
    ],
  },
  {
    id: 'person-skills',
    title: "Person skills",
    summary: "How person skills cover project requirements.",
    tags: ["person", "skills", "requirements", "allocations"],
    sections: [
      {
        heading: "What does this section change?",
        body: "Defines the skills used to match person tiles to project requirements automatically.",
      },
      {
        heading: "How does it work with allocations?",
        body: "If a project requires one matching skill, the person tile counts towards coverage without manual mapping. Manual mapping is needed for ambiguous cases.",
      },
    ],
  },
  {
    id: 'person-collaboration',
    title: "Person collaboration risks",
    summary: "Restrictions on planning people together in one project.",
    tags: ["person", "risks", "hr", "collaboration"],
    sections: [
      {
        heading: "What does this section change?",
        body: "Lets you mark people who should not be planned together in the same project.",
      },
      {
        heading: "Where does the effect appear?",
        body: "The board still allows dragging tiles, but generates warnings on allocations, in project risks, and in PM/HR perspectives.",
      },
    ],
  },
  {
    id: 'person-cost-layers',
    title: "Cost and target layers",
    summary: "Labour, overhead, sales, and target thresholds.",
    tags: ["person", "cost", "target", "margin"],
    sections: [
      {
        heading: "What does this section change?",
        body: "Sets revenue coverage thresholds for labour cost, admin/office, sales/marketing, and target revenue.",
      },
      {
        heading: "Why does it matter?",
        body: "These layers distinguish basic cost coverage from a healthy monthly business target.",
      },
    ],
  },
  {
    id: 'project-basic',
    title: "Project details and rates",
    summary: "Contract type, work type, stage, revenue, probability, and rates.",
    tags: ["project", "contract", "rates", "revenue", "rd", "waiting room", "scope"],
    sections: [
      {
        heading: "What does this section change?",
        body: "Defines how the project calculates revenue, whether it is active or in the pipeline, its probability and work type, and how revenue converts into hours.",
      },
      {
        heading: "Work type",
        body: "Work type distinguishes commercial projects, R&D, waiting-room projects, and defensive maintenance. It drives purple/orange project patterns, person markers, and long-term traffic triggers.",
      },
      {
        heading: "Source and scope consistency",
        body: "Source/scope status shows whether the board matches the CRM, brief, or current sales decision. A missing or outdated entry does not block planning, but becomes a visible PM/Sales trigger.",
      },
      {
        heading: "Rates",
        body: "The client rate determines how many hours the budget buys. The company target rate checks whether those hours should generate more revenue.",
      },
    ],
  },
  {
    id: 'project-monthly-split',
    title: "Monthly revenue split",
    summary: "Manual revenue splits for fixed-price and multi-month projects.",
    tags: ["project", "revenue", "months", "fixed"],
    sections: [
      {
        heading: "What does this section change?",
        body: "Distributes planned and committed project revenue across specific months. This is not a payment schedule.",
      },
      {
        heading: "When should I use it?",
        body: "Use it for fixed-phase or multi-month projects when a single budget needs a commercial breakdown by month.",
      },
    ],
  },
  {
    id: 'project-people-fit',
    title: "Preferred and blocked people",
    summary: "Matching people to a project.",
    tags: ["project", "people", "preferences", "restrictions"],
    sections: [
      {
        heading: "What does this section change?",
        body: "Lets you identify preferred people and people who should not be assigned to the project.",
      },
      {
        heading: "Does it block drag and drop?",
        body: "It does not block planning. You can experiment while the system shows clear risks on tiles and in summaries.",
      },
    ],
  },
  {
    id: 'allocation-mapping',
    title: "Map a tile to a requirement",
    summary: "What editing one person tile changes.",
    tags: ["allocation", "tile", "skill", "requirement", "validation"],
    sections: [
      {
        heading: "What does it do?",
        body: "Clicking a tile opens one specific person allocation. Set its skill or requirement manually only when matching from the person profile is ambiguous.",
      },
      {
        heading: "What does it leave unchanged?",
        body: "It does not change the whole bench, all person tiles, or the project budget. A single tile remains the basic unit of monthly planning.",
      },
      {
        heading: "Example",
        body: "If a person has Backend in their profile and the project has one Backend requirement, the dragged tile counts towards it without extra editing. Manual mapping is needed when several skills match or you want to override the default match.",
      },
    ],
  },
  {
    id: 'allocation-calculation',
    title: "Tile calculation",
    summary: "Rates, internal cost, and the target gap.",
    tags: ["allocation", "calculation", "rates", "margin"],
    sections: [
      {
        heading: "What does this section show?",
        body: "Shows the rate used to convert the tile into hours, the internal person cost, and whether tile revenue covers the target.",
      },
      {
        heading: "Does it change the board?",
        body: "This section makes no changes. It explains the effects of the current assignment of one tile.",
      },
    ],
  },
  {
    id: 'allocation-validation',
    title: "Tile validation",
    summary: "Warnings and meeting markers in the allocation editor.",
    tags: ["allocation", "validation", "risks", "meeting", "handoff", "plan b"],
    sections: [
      {
        heading: "What does this section show?",
        body: "Shows risks for this tile: skills, seniority, project preferences, collaboration conflicts, cost, and target revenue.",
      },
      {
        heading: "Does it block planning?",
        body: "No. You can continue planning, and warnings help identify assignments that need adjustment.",
      },
      {
        heading: "Meeting markers",
        body: "Markers such as unchanged, changed this week, handoff, Plan B, mentoring, and backup represent meeting decisions. The editor saves them for the entire person-project-month group, even when you open one tile.",
      },
      {
        heading: "Calculated markers",
        body: "Some markers are automatic: 20h+ from hours, HR from monthly availability, bench/0h for work outside a project or no productive work, low/critical for underload, R&D/wait/low from project work type, and PM from person skills.",
      },
    ],
  },
  {
    id: 'visual-inventory',
    title: "Visual pattern inventory",
    summary: "Colours, glyphs, markers, and card states for reading the board quickly.",
    tags: ["legend", "patterns", "miro", "colours", "glyphs", "states"],
    sections: [
      {
        heading: "What is the inventory for?",
        body: "The inventory explains the visual language of the board. It helps you recognise patterns on project and person cards without opening detailed lists.",
      },
      {
        heading: "Colours",
        body: "Red means pressure or risk, yellow a gap or uncertainty, green healthy coverage, blue a reservation or future opportunity, orange defensive work, and purple R&D, waiting-room work, or low commercial value.",
      },
      {
        heading: "Glyphs and person cards",
        body: "Skills and seniority appear as small badges on a person. The whole card can show fragmentation, HR context, bench/no project, underload, R&D/wait, mentoring, backup, or 20h+.",
      },
      {
        heading: "Weeks on a person card",
        body: "The W1/W2/W3 strip shows hours across the weeks of the month. A regular tile means proportional distribution, a dashed yellow tile means a manual weekly override, and a strong bottom border marks a week with 20h+ workload.",
      },
      {
        heading: "Project card",
        body: "The project card is the main inventory frame. It shows filled space, empty windows, the fixed-price pool, overflow, and states such as one person, people shortage, R&D, waiting room, low value, and scope/source mismatch.",
      },
    ],
  },
  {
    id: 'relationship-overlay',
    title: "Relationships and moves",
    summary: "Relationships between person assignments in projects and the month.",
    tags: ["relationships", "moves", "handoff", "backup", "mentoring", "fragmentation"],
    sections: [
      {
        heading: "What does the overlay show?",
        body: "The monthly overlay collects relationships visible on project cards: stable assignments, moves from a previous target, weekly changes, handoffs, Plan B, mentoring, backup, and people split across targets. When both ends are visible, the board draws a subtle line between frames.",
      },
      {
        heading: "Where do moves come from?",
        body: "Moves come from the previousTarget field. It is set by drag and drop, resets to the bench, hiding a project, or manual marking in the allocation editor.",
      },
      {
        heading: "What does it not show yet?",
        body: "This is not a full audit history. Lines are a lightweight overlay for visible frames and help recognise patterns without obscuring the board.",
      },
    ],
  },
  {
    id: 'traffic-review',
    title: "Traffic review",
    summary: "Short-term and long-term modes and meeting triggers.",
    tags: ["traffic", "meeting", "short term", "long term", "agenda", "triggers"],
    sections: [
      {
        heading: "What is this panel for?",
        body: "Traffic Review turns the meeting agenda and supporting questions into lightweight checklists and triggers based on the current board. It supports discussion alongside the project cards.",
      },
      {
        heading: "Short term",
        body: "Short term covers the next cycle: weekly changes, handoffs, Plan B, backup, BE/FE/QA, onboarding, budget, scope mismatch, and overload.",
      },
      {
        heading: "Long term",
        body: "Long term covers about three months: pipeline, underload, R&D/waiting rooms, single points of failure, skill gaps, contract ends, budget/margin, and over-promising.",
      },
      {
        heading: "Roles",
        body: "Each trigger has an owner role, such as HR, PM, Tech, Sales, or Finance, and a suggested action. This helps assign follow-ups before the next planning session.",
      },
    ],
  },
  {
    id: 'allocation-weekly-hours',
    title: "Weekly tile hours",
    summary: "The weekly distribution of hours for one allocation.",
    tags: ["allocation", "weeks", "hours"],
    sections: [
      {
        heading: "What does this section change?",
        body: "Lets you distribute the monthly hours of one tile across weeks. The month remains the financial source of truth.",
      },
      {
        heading: "When should I use it?",
        body: "Use it when work is unevenly spread across the month or you want to see actual weekly overload.",
      },
    ],
  },
  {
    id: 'project-requirements',
    title: "Project requirements",
    summary: "How projects calculate skill and hour coverage.",
    tags: ["project", "requirements", "skills", "hours"],
    sections: [
      {
        heading: "What does the counter mean?",
        body: "A requirement such as Fullstack mid: 0/32h shows how many required skill hours are covered by tiles in this project.",
      },
      {
        heading: "Where does coverage come from?",
        body: "Coverage increases when the tile person has an unambiguous matching profile skill, the tile has a matching skill set, or it is mapped to a specific project requirement.",
      },
      {
        heading: "What does it not mean?",
        body: "This is not a separate task manager or task list. It is a quick signal of whether the monthly plan has the required capacity and skills.",
      },
    ],
  },
  {
    id: 'project-risks',
    title: "Project risks",
    summary: "The risk list on a project card.",
    tags: ["risks", "project", "validation", "tiles"],
    sections: [
      {
        heading: "Where do risks come from?",
        body: "Risks come from validation of assigned tiles: skills, seniority, people preferences, restrictions, collaboration conflicts, costs, and target rate.",
      },
      {
        heading: "How should I read them?",
        body: "Each entry shows a person and a specific message. If there are more risks, use the button to show the full list.",
      },
      {
        heading: "What should I do?",
        body: "Usually you need to map the tile to the right requirement, replace a person, change the project team, or review the rate and scope.",
      },
    ],
  },
  {
    id: 'generated-risks',
    title: "Generated risks",
    summary: "Aggregated risks for the active month.",
    tags: ["risks", "month", "summary", "validation"],
    sections: [
      {
        heading: "What does this section show?",
        body: "A summary of the main issues in the active month: target gaps, bench cost, allocation warnings, rates, required skills, and team conflicts.",
      },
      {
        heading: "Why are examples shown?",
        body: "An aggregate alone is less useful, so the card shows specific people, projects, and the first validation messages.",
      },
      {
        heading: "What does it leave unchanged?",
        body: "This section does not change the plan automatically. It maps risks to help you decide what to adjust on the board.",
      },
    ],
  },
  {
    id: 'lens-summary',
    title: "Lenses and summary",
    summary: "Why each perspective shows different signals.",
    tags: ["lens", "management", "finance", "sales", "pm", "hr"],
    sections: [
      {
        heading: "What are lenses for?",
        body: "A lens filters signals for a specific perspective. Management takes a broad view, Finance focuses on rates, costs, and margins, PM on delivery, and HR on workload and people fit.",
      },
      {
        heading: "What does the summary mean?",
        body: "The summary shows the main warnings for the selected lens, with examples of people and projects.",
      },
      {
        heading: "What is it not?",
        body: "This is not a separate financial report or CRM. It is a shortcut for reading the same monthly board from different perspectives.",
      },
    ],
  },
  {
    id: 'people-availability',
    title: "Monthly people availability",
    summary: "Cost, target, hours, and person utilization in the active month.",
    tags: ["people", "availability", "cost", "target", "utilization"],
    sections: [
      {
        heading: "What does this section show?",
        body: "People availability shows monthly hours and revenue targets for a person, and how much is already assigned to projects.",
      },
      {
        heading: "Where do the numbers come from?",
        body: "Hours and cost come from the person profile and monthly overrides. Assignments count allocation tiles assigned to projects in that month.",
      },
      {
        heading: "What is it not?",
        body: "This is not a timesheet or final cost estimate. It is a quick view for planning monthly people capacity.",
      },
    ],
  },
  {
    id: 'period-planning',
    title: "Monthly planning range",
    summary: "Adding and switching months.",
    tags: ["month", "range", "planning", "period"],
    sections: [
      {
        heading: "What does this panel do?",
        body: "Adds an empty month, switches the active month, and changes the range of visible months.",
      },
      {
        heading: "What does it not do?",
        body: "It does not copy a plan from another month. A new month starts empty to avoid duplicating incorrectly arranged data.",
      },
      {
        heading: "Why is it collapsed by default?",
        body: "The active monthly board is the main view. The months panel is a supporting tool.",
      },
    ],
  },
  {
    id: 'bench',
    title: "Bench / unassigned target",
    summary: "Unused person tiles.",
    tags: ["bench", "tiles", "people"],
    sections: [
      {
        heading: "What is the bench?",
        body: "The bench shows person tiles that are not assigned to a project in a given month. If a person has only bench tiles and 0h of productive work, the board shows a stronger no-project state.",
      },
      {
        heading: "How should I use it?",
        body: "Drag individual bench tiles onto a project to assign part of the person capacity to project work.",
      },
      {
        heading: "What is it not?",
        body: "The bench is not a project or an editor for all allocations at once. It is the starting point for unassigned tiles.",
      },
    ],
  },
  {
    id: 'weekly-drilldown',
    title: "Weekly breakdown",
    summary: "An operational breakdown of the month into weeks.",
    tags: ["weeks", "hours", "workload", "drilldown"],
    sections: [
      {
        heading: "Why use a weekly breakdown?",
        body: "The month remains the main financial unit, while weeks show whether the plan is operationally achievable.",
      },
      {
        heading: "What can I check?",
        body: "You can see person workloads, weekly overload, and project work spread across weeks.",
      },
      {
        heading: "What does it leave unchanged?",
        body: "It does not change monthly project revenue. Weeks help check feasibility and hour distribution.",
      },
    ],
  },
  {
    id: 'tile-scale',
    title: "Tile display mode",
    summary: "The Hours/Cost toggle on Diablo tiles.",
    tags: ["tiles", "cost", "hours", "view"],
    sections: [
      {
        heading: "What does the mode change?",
        body: "The toggle changes only the visible tile metric: Hours shows effort, while Cost shows the internal person cost for that slot.",
      },
      {
        heading: "What does it leave unchanged?",
        body: "It does not change allocation data, project budget, frame layout, or the drag-and-drop unit. A single tile still represents the basic unit of capacity/revenue.",
      },
      {
        heading: "Why is there no 1k/2k/5k scale?",
        body: "The board scale and separate hours context were removed from the toolbox because they created unclear descriptions. Diablo uses a simple Hours/Cost choice.",
      },
    ],
  },
];

export const helpTopicsById = new Map(helpTopics.map((topic) => [topic.id, topic]));
