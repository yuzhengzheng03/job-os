# Job OS Architecture Rules

Job OS is Opportunity-Centric.

## Product Boundary

Job OS helps users discover, understand, and manage career opportunities.

Job OS does not:

- Automatically apply to jobs.
- Auto-fill ATS forms.
- Own company recruiting workflows.
- Decide offers for the user.
- Replace recruiting websites.

## Non-Negotiable Rules

1. `Opportunity` is the only core business object.
2. `SourceJob` is raw internet fact and must never be overwritten.
3. AI can only create generated data such as `JobAnalysis`; AI must never modify raw data.
4. `Timeline` is append-only.
5. Every meaningful automatic action must create a `Timeline` event.
6. `SearchProfile` defines discovery scope but does not own job data.
7. `Source` is a recruiting source, not a company.
8. `Company` is for long-term monitoring, not discovery input.
9. `Attachment` cannot exist independently; it always belongs to an `Opportunity`.
10. Do not introduce new top-level domain objects without explicit approval.

## Data Layers

Raw Data:

- Produced by crawler/importer.
- Immutable.
- Source of truth.

Generated Data:

- Produced by AI or system services.
- Versioned.
- Regenerable.

User Data:

- Produced by user actions.
- Represents decisions, notes, status, priority, and attached materials.

## Core Objects

The system has seven first-level domain objects:

- `SearchProfile`
- `Source`
- `SourceJob`
- `Company`
- `Opportunity`
- `Timeline`
- `Attachment`

`JobAnalysis` is generated data attached to `Opportunity`.

## Workflow Principle

V0 uses:

```text
Task -> Service -> Database
```

Do not start with complex Agents.

Future Agents may orchestrate workflows, but the underlying domain model must remain unchanged.

## First Implementation Goal

Build this loop first:

```text
Manual SourceJob Import
  -> Normalize
  -> Merge/Create Opportunity
  -> AI Analysis
  -> Opportunity Workspace
  -> Timeline
```

