# Job OS MVP Backlog

This backlog is ordered for implementation. Complete one vertical slice before expanding sideways.

## Sprint 0: Domain Guardrails

- Create project scaffold.
- Add `ARCHITECTURE_RULES.md`.
- Add initial README with product boundary.
- Configure formatter, linter, test runner.

Acceptance:

- New contributors or coding agents can identify the core object as `Opportunity`.
- No crawler or Agent work has started.

## Sprint 1: Database Kernel

- Implement Prisma schema.
- Add enums.
- Add seed data:
  - one user
  - one source
  - one search profile
  - one company
- Add migration.

Acceptance:

- Database can be migrated and seeded.
- Schema contains no extra first-level business objects.

## Sprint 2: Timeline and SourceJob Services

- Implement `TimelineService`.
- Implement `SourceJobService`.
- Calculate `content_hash`.
- Prevent raw SourceJob updates through service APIs.

Acceptance:

- SourceJob can be created.
- SourceJob raw content cannot be changed through services.
- Timeline event can be appended.

## Sprint 3: Manual Import Vertical Slice

- Build manual import API.
- Add simple normalization.
- Add simple merge logic.
- Create Opportunity.
- Link SourceJob to Opportunity.
- Write `OPPORTUNITY_DISCOVERED`.

Acceptance:

- Pasting one JD creates one SourceJob, one Opportunity, one Timeline event.

## Sprint 4: Mock Analysis

- Implement mock `AnalysisService`.
- Create versioned `JobAnalysis`.
- Write `AI_ANALYSIS_STARTED`.
- Write `AI_ANALYSIS_COMPLETED`.
- Move Opportunity to `READY`.

Acceptance:

- Imported JD gets a generated analysis.
- Re-analysis creates version 2.
- SourceJob raw data remains unchanged.

## Sprint 5: Opportunity Work List

- Build `/opportunities`.
- Add status tabs.
- Add filters.
- Add compact list rows.
- Link to workspace.

Acceptance:

- User can see all created Opportunities.
- User can filter by status.

## Sprint 6: Opportunity Workspace

- Build `/opportunities/:id`.
- Show normalized job info.
- Show raw SourceJobs.
- Show latest AI Analysis.
- Show Timeline.
- Add status update.
- Add user notes.

Acceptance:

- User can manage one Opportunity end to end.
- Status changes write Timeline events.

## Sprint 7: Attachments

- Add attachment metadata.
- Add upload placeholder or local storage.
- Show attachments in workspace.
- Write `FILE_UPLOADED`.

Acceptance:

- Attachment belongs to Opportunity.
- Upload creates Timeline event.

## Sprint 8: Search Profile and Source Management

- Build `/search-profiles`.
- Build `/sources`.
- Add enable/disable controls.

Acceptance:

- User can define discovery intent.
- User can define where future discovery should search.

## Sprint 9: Real AI Analysis

- Add environment-based LLM config.
- Replace mock analysis.
- Validate JSON output.
- Write `ANALYSIS_ERROR` on failure.

Acceptance:

- Analysis is generated from SourceJob raw text.
- Invalid model output does not corrupt system state.

## Sprint 10: Discovery V0

- Implement `ManualSourceAdapter`.
- Implement `MockSourceAdapter`.
- Add `run discovery` action on SearchProfile.

Acceptance:

- SearchProfile can create SourceJobs through adapter flow.
- New SourceJobs merge into Opportunities.

