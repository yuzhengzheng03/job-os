# Job OS Vibe Coding Prompts

Use these prompts in order. Keep `ARCHITECTURE_RULES.md` attached or pasted into every coding session.

## 1. Project Scaffold

```text
Create a Next.js + TypeScript + Prisma project for Job OS.
Before coding, create ARCHITECTURE_RULES.md from the provided rules.
Use PostgreSQL in schema design.
Do not implement crawlers yet.
Do not build a marketing landing page.
The first product surface should be the Opportunity work list.
```

## 2. Prisma Schema

```text
Implement the Job OS Prisma schema based on ARCHITECTURE_RULES.md.
Include User, SearchProfile, Source, SourceJob, Company, Opportunity, OpportunitySourceJob, JobAnalysis, Timeline, Attachment.
Enforce enums for Source type, Company status, Opportunity status, Timeline actor type, Timeline event type, and Attachment type.
Do not add extra top-level domain models.
Add comments explaining which tables are Raw Data, Generated Data, and User Data.
```

## 3. Domain Services

```text
Implement domain services:
SourceJobService, NormalizeService, OpportunityMergeService, TimelineService, OpportunityService, AnalysisService, AttachmentService.

Rules:
- SourceJob raw data is immutable at the service layer.
- Timeline writes are append-only.
- Opportunity status changes write Timeline events.
- AnalysisService reads SourceJob raw data and creates JobAnalysis versions.
- AnalysisService must not modify SourceJob.

Use mock AI analysis for now.
```

## 4. Manual Source Job Import

```text
Implement manual Source Job import.

The user can paste:
- source id
- URL
- raw job text
- optional company
- optional title
- optional location

On submit:
1. Create SourceJob.
2. Normalize fields.
3. Create or merge Opportunity.
4. Link SourceJob to Opportunity.
5. Write OPPORTUNITY_DISCOVERED Timeline event.
6. Trigger mock AnalysisService.
7. Write AI_ANALYSIS_COMPLETED Timeline event.
8. Set Opportunity to READY.
```

## 5. Opportunity List

```text
Build the Opportunities page as the first app screen.

This is a dense work list, not a hero page.

Required:
- status tabs
- filters for company, location, source, priority
- sort by last activity and discovered date
- compact rows
- visible status and priority
- link to Opportunity Workspace
```

## 6. Opportunity Workspace

```text
Build Opportunity Workspace.

Required sections:
- header with title, company, status, priority
- normalized job info
- latest AI Analysis
- all JobAnalysis versions
- raw SourceJobs
- Timeline
- Attachments
- user notes

All user actions must write Timeline events where appropriate.
Do not allow editing raw SourceJob content.
```

## 7. Search Profiles and Sources

```text
Build Search Profiles and Sources management pages.

Search Profiles define discovery intent:
- keywords
- locations
- industries
- recruitment types
- source scope
- enabled

Sources define where data comes from:
- name
- type
- base url
- login required
- adapter key
- enabled

Do not make Company a discovery input.
```

## 8. Companies

```text
Build Companies page for long-term monitoring.

Company fields:
- name
- website
- career url
- tags
- priority
- status
- monitor config

Company status:
CANDIDATE, MONITORING, PAUSED, ARCHIVED.

Do not store jobs directly on Company.
Jobs are represented by Opportunities linked to Companies.
```

## 9. Tests

```text
Add tests for the non-negotiable architecture rules:

- SourceJob raw fields cannot be updated by services.
- Creating SourceJob calculates content hash.
- Timeline is append-only.
- Opportunity status change writes STATUS_CHANGED Timeline event.
- Re-analysis creates a new JobAnalysis version.
- AI Analysis does not modify SourceJob.
- Attachment creation writes FILE_UPLOADED Timeline event.
- Multiple SourceJobs can map to one Opportunity.
```

## 10. Real AI Analysis

```text
Replace mock analysis with an LLM-backed AnalysisService.

Requirements:
- Read from SourceJob raw data only.
- Return structured JSON only.
- Save a new JobAnalysis version.
- Do not overwrite old JobAnalysis rows.
- Do not modify SourceJob.
- If the model fails, write ANALYSIS_ERROR Timeline event.
```

## 11. Basic Discovery Adapter

```text
Add one basic SourceAdapter after manual import works.

V0 adapter options:
- MockSourceAdapter
- ManualSourceAdapter
- simple OfficialSiteBasicAdapter

Discovery reads enabled SearchProfiles, calls SourceAdapters, creates SourceJobs, normalizes, merges into Opportunities, and writes Timeline events.

Do not start with Boss, LinkedIn, or other high-friction anti-crawler sources.
```

## 12. Basic Monitor

```text
Add Monitor workflow for Companies.

Input:
- Company with MONITORING status
- career url
- monitor config

Process:
1. Fetch source data through SourceAdapter.
2. Create SourceJob for new raw data.
3. Detect new job, changed JD, closed job.
4. Update related Opportunity if needed.
5. Write JOB_UPDATED or JOB_CLOSED Timeline event.
```

