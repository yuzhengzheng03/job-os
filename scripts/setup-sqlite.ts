import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const dbPath = join(process.cwd(), "prisma", "dev.db");
const journalPath = `${dbPath}-journal`;

for (const path of [dbPath, journalPath]) {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

const prisma = new PrismaClient();

async function execute(sql: string) {
  await prisma.$executeRawUnsafe(sql);
}

async function main() {
  await execute("PRAGMA foreign_keys = ON;");

  await execute(`
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE "SearchProfile" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "keywords" JSONB NOT NULL,
      "locations" JSONB NOT NULL,
      "industries" JSONB,
      "educationRequirements" JSONB,
      "recruitmentTypes" JSONB,
      "sourceScope" JSONB,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "SearchProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await execute(`
    CREATE TABLE "Source" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'OTHER',
      "baseUrl" TEXT,
      "loginRequired" BOOLEAN NOT NULL DEFAULT false,
      "searchCapabilities" JSONB,
      "updateStrategy" JSONB,
      "antiCrawlNotes" TEXT,
      "adapterKey" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await execute(`
    CREATE TABLE "SourceJob" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sourceId" TEXT NOT NULL,
      "externalId" TEXT,
      "url" TEXT NOT NULL,
      "rawHtml" TEXT,
      "rawMarkdown" TEXT,
      "rawText" TEXT NOT NULL,
      "screenshotPath" TEXT,
      "publishedAt" DATETIME,
      "sourceUpdatedAt" DATETIME,
      "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "contentHash" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SourceJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);

  await execute(`
    CREATE TABLE "Company" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "normalizedName" TEXT NOT NULL,
      "websiteUrl" TEXT,
      "careerUrl" TEXT,
      "recruitingUrls" JSONB,
      "tags" JSONB,
      "priority" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
      "monitorConfig" JSONB,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await execute(`
    CREATE TABLE "Opportunity" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "companyId" TEXT,
      "title" TEXT NOT NULL,
      "normalizedTitle" TEXT NOT NULL,
      "location" TEXT,
      "recruitmentType" TEXT,
      "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
      "priority" INTEGER NOT NULL DEFAULT 0,
      "userNotes" TEXT,
      "applicationInfo" JSONB,
      "deadlineAt" DATETIME,
      "firstDiscoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Opportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);

  await execute(`
    CREATE TABLE "OpportunitySourceJob" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "opportunityId" TEXT NOT NULL,
      "sourceJobId" TEXT NOT NULL,
      "matchReason" TEXT,
      "matchScore" REAL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OpportunitySourceJob_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "OpportunitySourceJob_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "SourceJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);

  await execute(`
    CREATE TABLE "JobAnalysis" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "opportunityId" TEXT NOT NULL,
      "sourceJobId" TEXT NOT NULL,
      "version" INTEGER NOT NULL,
      "model" TEXT NOT NULL,
      "promptVersion" TEXT NOT NULL,
      "summary" TEXT NOT NULL,
      "responsibilities" JSONB NOT NULL,
      "requirements" JSONB NOT NULL,
      "keywords" JSONB NOT NULL,
      "skills" JSONB NOT NULL,
      "fitNotes" TEXT,
      "risks" JSONB,
      "rawOutput" JSONB NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "JobAnalysis_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "JobAnalysis_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "SourceJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);

  await execute(`
    CREATE TABLE "Timeline" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "opportunityId" TEXT NOT NULL,
      "actorType" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT,
      "metadata" JSONB,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Timeline_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await execute(`
    CREATE TABLE "Attachment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "opportunityId" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'OTHER',
      "filename" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "storagePath" TEXT NOT NULL,
      "description" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Attachment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await execute('CREATE INDEX "SearchProfile_userId_enabled_idx" ON "SearchProfile" ("userId", "enabled");');
  await execute('CREATE UNIQUE INDEX "Source_type_name_key" ON "Source" ("type", "name");');
  await execute('CREATE INDEX "Source_enabled_type_idx" ON "Source" ("enabled", "type");');
  await execute('CREATE INDEX "SourceJob_sourceId_contentHash_idx" ON "SourceJob" ("sourceId", "contentHash");');
  await execute('CREATE INDEX "SourceJob_url_idx" ON "SourceJob" ("url");');
  await execute('CREATE UNIQUE INDEX "Company_userId_normalizedName_key" ON "Company" ("userId", "normalizedName");');
  await execute('CREATE INDEX "Company_userId_status_priority_idx" ON "Company" ("userId", "status", "priority");');
  await execute('CREATE INDEX "Opportunity_userId_status_priority_idx" ON "Opportunity" ("userId", "status", "priority");');
  await execute('CREATE INDEX "Opportunity_companyId_idx" ON "Opportunity" ("companyId");');
  await execute('CREATE UNIQUE INDEX "OpportunitySourceJob_opportunityId_sourceJobId_key" ON "OpportunitySourceJob" ("opportunityId", "sourceJobId");');
  await execute('CREATE INDEX "OpportunitySourceJob_sourceJobId_idx" ON "OpportunitySourceJob" ("sourceJobId");');
  await execute('CREATE UNIQUE INDEX "JobAnalysis_opportunityId_version_key" ON "JobAnalysis" ("opportunityId", "version");');
  await execute('CREATE INDEX "JobAnalysis_sourceJobId_idx" ON "JobAnalysis" ("sourceJobId");');
  await execute('CREATE INDEX "Timeline_opportunityId_createdAt_idx" ON "Timeline" ("opportunityId", "createdAt");');
  await execute('CREATE INDEX "Attachment_opportunityId_type_idx" ON "Attachment" ("opportunityId", "type");');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
