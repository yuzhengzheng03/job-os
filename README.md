# Job OS

Job OS is an AI-native personal job search operating system.

It is not a recruiting website, an ATS automation tool, or a generic job board. It helps the user discover, understand, and manage career opportunities.

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

## First Implementation Goal

Build the smallest meaningful Job OS loop:

```text
Manual SourceJob Import
  -> Normalize
  -> Merge/Create Opportunity
  -> AI Analysis
  -> Opportunity Workspace
  -> Timeline
```

## Development

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

Read `ARCHITECTURE_RULES.md` before making domain changes.

