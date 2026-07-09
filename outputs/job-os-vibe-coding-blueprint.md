# Job OS Vibe Coding Implementation Blueprint

Version: V0.1
Date: 2026-07-07
Input: `03_Domain_Model.md.txt`

## 1. Product Positioning

Job OS is an AI-native personal job search operating system.

It is not a recruiting website, an ATS automation tool, or a generic job board. It helps the user continuously discover, understand, and manage career opportunities.

The product is Opportunity-Centric:

```text
Search Profile
  -> Discovery
  -> Source
  -> Source Job
  -> Opportunity
  -> AI Analysis
  -> Workspace
```

The core object is `Opportunity`.

All business features must eventually attach to an `Opportunity`, its `Timeline`, or its `Attachment`.

## 2. Architecture Rules

These rules should be placed in the project root as `ARCHITECTURE_RULES.md` after the codebase is created.

```md
# Job OS Architecture Rules

Job OS is Opportunity-Centric.

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
- Represents decisions, notes, status, and priority.
```

## 3. MVP Scope

The first usable version should implement a complete data loop, not the full final product.

### In Scope

- Search Profile CRUD.
- Source CRUD.
- Manual Source Job import.
- Source Job raw data storage.
- Rule-based Source Job normalization.
- Rule-based duplicate detection.
- Opportunity creation and merge.
- Opportunity lifecycle status updates.
- AI Analysis workflow stub or real LLM integration.
- Versioned Job Analysis records.
- Opportunity Workspace.
- Timeline append-only event log.
- Attachment upload metadata.

### Out of Scope

- Automatic job application.
- ATS auto-fill.
- Complex anti-crawler systems.
- Boss / LinkedIn / NiuKe production crawlers.
- Full Agent orchestration.
- Resume Agent.
- Interview Agent.
- Offer decision system.
- Multi-user permissions.

## 4. Recommended Tech Stack

Use a boring, direct stack. The product complexity is in the domain model, not the framework.

### Option A: Fastest Full-Stack Path

- Next.js
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- OpenAI-compatible LLM API
- Local filesystem for attachments in V0

### Option B: Backend-Heavy Path

- FastAPI
- SQLAlchemy
- PostgreSQL
- React / Next.js frontend
- OpenAI-compatible LLM API

Recommended first choice: Next.js + Prisma + PostgreSQL.

## 5. Domain Tables

The database is not the system core. The core is `Opportunity`.

That said, the database should protect the domain rules.

### users

Single-user in V0, but keep `user_id` on user-owned records.

Suggested fields:

- `id`
- `email`
- `name`
- `created_at`
- `updated_at`

### search_profiles

Defines what the system should discover.

Suggested fields:

- `id`
- `user_id`
- `name`
- `keywords` JSON
- `locations` JSON
- `industries` JSON
- `education_requirements` JSON
- `recruitment_types` JSON
- `source_scope` JSON
- `enabled`
- `created_at`
- `updated_at`

Rules:

- Does not store jobs.
- Does not own companies.
- Used only as Discovery input.

### sources

Represents recruiting information sources.

Suggested fields:

- `id`
- `name`
- `type`
- `base_url`
- `login_required`
- `search_capabilities` JSON
- `update_strategy` JSON
- `anti_crawl_notes`
- `adapter_key`
- `enabled`
- `created_at`
- `updated_at`

Source type enum:

- `OFFICIAL_SITE`
- `WORKDAY`
- `GREENHOUSE`
- `BOSS`
- `LINKEDIN`
- `NIUKE`
- `WECHAT`
- `OTHER`

Rules:

- Crawler targets `Source`, not `Company`.
- Adding a new channel should usually mean adding a new Source Adapter.

### source_jobs

Raw internet records.

Suggested fields:

- `id`
- `source_id`
- `external_id`
- `url`
- `raw_html`
- `raw_markdown`
- `raw_text`
- `screenshot_path`
- `published_at`
- `source_updated_at`
- `fetched_at`
- `content_hash`
- `created_at`

Rules:

- No update to raw fields after creation.
- If page content changes, insert a new `SourceJob` version or a separate version table.
- AI must never write to this table except possibly read-derived metadata in a separate generated table.

### companies

Long-term monitoring targets.

Suggested fields:

- `id`
- `user_id`
- `name`
- `normalized_name`
- `website_url`
- `career_url`
- `recruiting_urls` JSON
- `tags` JSON
- `priority`
- `status`
- `monitor_config` JSON
- `created_at`
- `updated_at`

Company status enum:

- `CANDIDATE`
- `MONITORING`
- `PAUSED`
- `ARCHIVED`

Rules:

- Company is Monitor input.
- Company is not Discovery input.
- Company does not own raw jobs.

### opportunities

The core business object.

Suggested fields:

- `id`
- `user_id`
- `company_id`
- `title`
- `normalized_title`
- `location`
- `recruitment_type`
- `status`
- `priority`
- `user_notes`
- `deadline_at`
- `first_discovered_at`
- `last_seen_at`
- `created_at`
- `updated_at`

Opportunity status enum:

- `DISCOVERED`
- `ANALYZING`
- `READY`
- `WATCHING`
- `APPLIED`
- `INTERVIEW`
- `OFFER`
- `CLOSED`

Rules:

- Lifecycle describes the relationship between the user and the job.
- Status changes must create Timeline events.
- Opportunity can be linked to multiple Source Jobs.

### opportunity_source_jobs

Many-to-many mapping between Opportunity and Source Job.

Suggested fields:

- `id`
- `opportunity_id`
- `source_job_id`
- `match_reason`
- `match_score`
- `created_at`

Rules:

- Used to merge the same job from multiple sources.
- Never duplicate an Opportunity just because it appears on another Source.

### job_analyses

Versioned AI-generated understanding.

Suggested fields:

- `id`
- `opportunity_id`
- `source_job_id`
- `version`
- `model`
- `prompt_version`
- `summary`
- `responsibilities` JSON
- `requirements` JSON
- `keywords` JSON
- `skills` JSON
- `fit_notes`
- `risks` JSON
- `raw_output` JSON
- `created_at`

Rules:

- Append-only versioning.
- Re-analysis creates a new row.
- Does not overwrite previous analysis.

### timelines

Append-only event stream for Opportunity.

Suggested fields:

- `id`
- `opportunity_id`
- `actor_type`
- `event_type`
- `title`
- `body`
- `metadata` JSON
- `created_at`

Actor type enum:

- `SYSTEM`
- `AI`
- `USER`

Event type examples:

- `OPPORTUNITY_DISCOVERED`
- `AI_ANALYSIS_STARTED`
- `AI_ANALYSIS_COMPLETED`
- `STATUS_CHANGED`
- `NOTE_CREATED`
- `FILE_UPLOADED`
- `APPLIED`
- `INTERVIEW`
- `OFFER`
- `JOB_UPDATED`
- `JOB_CLOSED`
- `SOURCE_ERROR`
- `ANALYSIS_ERROR`
- `DATA_ERROR`

Rules:

- No update.
- No delete in normal product flows.
- It records what happened, not only current state.

### attachments

Files attached to an Opportunity.

Suggested fields:

- `id`
- `opportunity_id`
- `type`
- `filename`
- `mime_type`
- `file_size`
- `storage_path`
- `description`
- `created_at`

Attachment type examples:

- `RESUME`
- `COVER_LETTER`
- `PDF`
- `IMAGE`
- `OFFER`
- `OTHER`

Rules:

- Cannot exist without an Opportunity.
- Upload should create a Timeline event.

## 6. Services

Keep services small and explicit. Do not start with Agents.

### DiscoveryService

Purpose:

- Reads enabled Search Profiles.
- Selects Sources.
- Invokes Source Adapters.
- Saves Source Jobs.
- Calls Normalize and Merge services.

V0 behavior:

- Manual trigger.
- Mock Source Adapter or manual URL/text import.

### SourceAdapter

Purpose:

- Converts a Source query into Source Jobs.

Adapter interface:

```ts
interface SourceAdapter {
  fetch(input: SourceFetchInput): Promise<RawSourceJob[]>;
}
```

V0 adapters:

- `ManualSourceAdapter`
- `MockSourceAdapter`
- Optional `OfficialSiteBasicAdapter`

### SourceJobService

Purpose:

- Creates immutable Source Jobs.
- Calculates content hash.
- Prevents accidental raw overwrite.

### NormalizeService

Purpose:

- Extracts company, title, location, publish time, and external id.

V0 behavior:

- Rule-based extraction.
- Optional AI assist later, but AI output must not modify raw data.

### OpportunityMergeService

Purpose:

- Finds whether a Source Job belongs to an existing Opportunity.

V0 match rules:

- Same normalized company.
- Similar normalized title.
- Same or compatible location.
- Same external id if available.
- Similar raw JD text hash or simple token overlap.

Output:

- `MATCH`: link Source Job to existing Opportunity.
- `NEW`: create Opportunity.

### AnalysisService

Purpose:

- Reads Source Job raw data.
- Sends prompt to LLM.
- Saves versioned Job Analysis.
- Updates Opportunity status from `ANALYZING` to `READY`.
- Writes Timeline events.

V0 can use either:

- A deterministic mock analysis for local development.
- A real LLM call behind an environment variable.

### TimelineService

Purpose:

- Single write path for Timeline events.
- Enforces append-only behavior.

### OpportunityService

Purpose:

- Status changes.
- User notes.
- Priority.
- Workspace data aggregation.

Rules:

- Status changes must write `STATUS_CHANGED`.

### AttachmentService

Purpose:

- Saves metadata.
- Stores file.
- Writes `FILE_UPLOADED`.

## 7. API Design

V0 can use REST endpoints.

### Search Profiles

- `GET /api/search-profiles`
- `POST /api/search-profiles`
- `GET /api/search-profiles/:id`
- `PATCH /api/search-profiles/:id`
- `POST /api/search-profiles/:id/run-discovery`

### Sources

- `GET /api/sources`
- `POST /api/sources`
- `PATCH /api/sources/:id`

### Source Jobs

- `GET /api/source-jobs`
- `POST /api/source-jobs/manual-import`
- `GET /api/source-jobs/:id`
- `POST /api/source-jobs/:id/normalize`
- `POST /api/source-jobs/:id/merge`

Do not expose a generic raw update endpoint.

### Opportunities

- `GET /api/opportunities`
- `GET /api/opportunities/:id`
- `PATCH /api/opportunities/:id/user-fields`
- `POST /api/opportunities/:id/status`
- `POST /api/opportunities/:id/analyze`
- `POST /api/opportunities/:id/attachments`

### Companies

- `GET /api/companies`
- `POST /api/companies`
- `PATCH /api/companies/:id`
- `POST /api/companies/:id/run-monitor`

### Timeline

- `GET /api/opportunities/:id/timeline`
- `POST /api/opportunities/:id/timeline/note`

Do not expose update/delete timeline endpoints in V0.

## 8. Frontend Pages

Do not build a marketing landing page first.

The first screen should be the user workspace.

### `/opportunities`

Purpose:

- Daily operating list.

Features:

- Status tabs.
- Search by company/title.
- Filter by source, location, priority.
- Sort by last activity, deadline, discovered date.
- Compact rows.

### `/opportunities/:id`

Purpose:

- Core Opportunity Workspace.

Layout:

- Header: title, company, status, priority, main actions.
- Left/main: normalized job info, AI analysis.
- Right/side: source links, attachments, metadata.
- Lower section: raw JD tabs and timeline.

Required components:

- Status control.
- AI analysis panel.
- Raw source job viewer.
- Timeline.
- Notes.
- Attachment list.

### `/search-profiles`

Purpose:

- Define discovery intent.

Features:

- Keywords.
- Locations.
- Industries.
- Recruitment types.
- Source scope.
- Enabled toggle.
- Run discovery button.

### `/source-jobs`

Purpose:

- Debug raw imported jobs.

Features:

- Raw text preview.
- Source.
- Content hash.
- Linked Opportunity.
- Normalize/merge action.

### `/companies`

Purpose:

- Manage long-term monitored companies.

Features:

- Status.
- Priority.
- Career URL.
- Tags.
- Monitor config.

## 9. Workflows

### Manual Import Workflow

```text
User pastes job URL/raw JD
  -> SourceJobService creates SourceJob
  -> NormalizeService extracts fields
  -> OpportunityMergeService finds or creates Opportunity
  -> TimelineService writes OPPORTUNITY_DISCOVERED
  -> AnalysisService starts
  -> TimelineService writes AI_ANALYSIS_COMPLETED
  -> Opportunity becomes READY
```

This is the best V0 workflow because it proves the core product without crawler risk.

### Discovery Workflow

```text
SearchProfile
  -> DiscoveryService
  -> SourceAdapter
  -> SourceJob
  -> Normalize
  -> Merge
  -> Opportunity
  -> Timeline
```

### Monitor Workflow

```text
Company
  -> Monitor config
  -> SourceAdapter
  -> SourceJob
  -> Change detection
  -> Opportunity update
  -> Timeline event
```

### AI Analysis Workflow

```text
Opportunity
  -> latest linked SourceJob raw data
  -> LLM
  -> structured JSON
  -> JobAnalysis version
  -> Timeline event
  -> Opportunity READY
```

### Lifecycle Workflow

```text
DISCOVERED
  -> ANALYZING
  -> READY
  -> WATCHING
  -> APPLIED
  -> INTERVIEW
  -> OFFER
  -> CLOSED
```

Not every Opportunity must pass through every state. But every state change must be tracked.

## 10. AI Prompt Contract

The analysis prompt should produce structured JSON only.

Input:

- Opportunity title if available.
- Company if available.
- Source Job raw text.
- Source URL.

Output schema:

```json
{
  "summary": "",
  "responsibilities": [],
  "requirements": [],
  "keywords": [],
  "skills": [],
  "experience_level": "",
  "education": "",
  "location": "",
  "deadline": "",
  "fit_notes": "",
  "risks": []
}
```

Prompt rule:

```text
You analyze job descriptions for Job OS.
You must not invent facts.
Use only the provided raw job data.
If a field is unknown, return an empty string or empty array.
Return valid JSON only.
```

## 11. Test Strategy

Write tests around domain rules first.

### Must-Have Tests

- Source Job raw fields cannot be updated.
- Creating Source Job calculates content hash.
- Duplicate Source Job links to existing Opportunity when match rules pass.
- New Source Job creates new Opportunity when match rules fail.
- Opportunity status change writes Timeline event.
- Timeline event cannot be updated by normal service.
- Re-analysis creates new JobAnalysis version.
- Attachment creation writes Timeline event.
- AI Analysis does not modify Source Job raw fields.

### Useful Integration Tests

- Manual import creates Source Job, Opportunity, Timeline.
- Analyze Opportunity creates JobAnalysis and updates status.
- Multiple Source Jobs can map to one Opportunity.

## 12. Vibe Coding Task Queue

Use these prompts in order. Do not skip the architecture rules.

### Task 1: Project Scaffold

```text
Create a Next.js + TypeScript + Prisma project for Job OS.
Before coding, create ARCHITECTURE_RULES.md from the provided rules.
Use PostgreSQL in schema design but allow local SQLite only if needed for development.
Do not implement crawlers yet.
```

### Task 2: Prisma Schema

```text
Implement the Job OS Prisma schema based on ARCHITECTURE_RULES.md.
Include User, SearchProfile, Source, SourceJob, Company, Opportunity, OpportunitySourceJob, JobAnalysis, Timeline, Attachment.
Enforce enums for Source type, Company status, Opportunity status, Timeline actor type, and Timeline event type.
Do not add extra top-level domain models.
```

### Task 3: Domain Services

```text
Implement domain services:
SourceJobService, OpportunityMergeService, TimelineService, OpportunityService, AnalysisService.
Ensure SourceJob raw data is immutable at the service layer.
Ensure Timeline writes are append-only.
Ensure status changes write timeline events.
Use mock AI analysis for now.
```

### Task 4: Manual Import

```text
Implement manual Source Job import.
The user can paste source, URL, raw text, and optional company/title/location.
On submit:
create SourceJob,
normalize fields,
create or merge Opportunity,
write Timeline event,
then trigger mock AnalysisService.
```

### Task 5: Opportunity List

```text
Build the Opportunities page as the first app screen.
It should be a compact work list, not a marketing page.
Support filtering by status, company, location, and priority.
```

### Task 6: Opportunity Workspace

```text
Build Opportunity Workspace.
Show normalized info, raw Source Jobs, AI Analysis versions, Timeline, Attachments, status control, priority, and notes.
All user actions must write Timeline where appropriate.
```

### Task 7: Search Profiles and Sources

```text
Build Search Profiles and Sources management pages.
Search Profiles define discovery intent.
Sources define where data comes from.
Do not make Company a discovery input.
```

### Task 8: Tests

```text
Add tests for the non-negotiable architecture rules:
raw SourceJob immutability,
Timeline append-only,
AI Analysis versioning,
status change Timeline events,
SourceJob to Opportunity merge.
```

### Task 9: Real AI Analysis

```text
Replace mock analysis with an LLM-backed AnalysisService.
Read from SourceJob raw data only.
Return structured JSON.
Save as new JobAnalysis version.
Never modify SourceJob.
```

### Task 10: Basic Discovery Adapter

```text
Add one basic SourceAdapter after manual import works.
Use a simple official site or mock adapter first.
Discovery reads SearchProfile and creates SourceJobs.
Do not implement complex anti-crawler sources yet.
```

## 13. Implementation Milestones

### Milestone 1: Domain Kernel

Done when:

- Schema exists.
- Services enforce rules.
- Manual import creates Source Job and Opportunity.
- Timeline events are written.

### Milestone 2: Workspace

Done when:

- User can browse Opportunities.
- User can open an Opportunity.
- User can update status, notes, priority.
- User can see raw JD, AI analysis, and Timeline.

### Milestone 3: AI Understanding

Done when:

- Analysis creates structured JobAnalysis.
- Re-analysis creates a new version.
- Opportunity reaches READY.

### Milestone 4: Discovery V0

Done when:

- SearchProfile can trigger a basic adapter.
- Adapter produces SourceJobs.
- SourceJobs merge into Opportunities.

### Milestone 5: Monitor V0

Done when:

- Company can be marked MONITORING.
- Basic monitor run can detect new/changed Source Jobs.
- Opportunity Timeline records changes.

## 14. Major Risks

### Risk: Building a job board instead of Job OS

Mitigation:

- First screen is Opportunities, not source search.
- Every feature must answer how it helps manage an Opportunity.

### Risk: AI overwrites facts

Mitigation:

- Raw fields are immutable.
- Analysis is versioned.
- Prompt says AI must not invent facts.

### Risk: Crawler complexity swallows MVP

Mitigation:

- Start with manual import.
- Add simple adapters later.
- Do not start with Boss or LinkedIn.

### Risk: Timeline becomes decorative

Mitigation:

- Make TimelineService mandatory for status, analysis, attachment, discovery, errors.

### Risk: Too many agents too early

Mitigation:

- V0 uses Task + Service + Database.
- Agent layer can orchestrate later but must not replace domain workflows.

## 15. First Coding Session Definition of Done

The first actual code session should stop when this is true:

- Project scaffold exists.
- `ARCHITECTURE_RULES.md` exists.
- Prisma schema exists.
- Seed data creates one User, one Source, one SearchProfile.
- Manual Source Job import can create one Opportunity.
- Opportunity detail page shows raw JD, status, and timeline.

That is the smallest meaningful Job OS.

