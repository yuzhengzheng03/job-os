import { opportunityStatuses, timelineActorTypes, timelineEventTypes } from "@/src/domain/domain-values";
import { normalizeCompanyName, normalizeTitle } from "@/src/domain/normalize";
import { prisma } from "@/src/lib/prisma";
import { timelineService } from "@/src/services/timeline-service";

export type MergeSourceJobInput = {
  userId: string;
  sourceJobId: string;
  companyName?: string;
  title: string;
  location?: string;
  recruitmentType?: string;
};

export class OpportunityMergeService {
  async mergeOrCreate(input: MergeSourceJobInput) {
    const normalizedTitle = normalizeTitle(input.title);
    const normalizedCompany = input.companyName ? normalizeCompanyName(input.companyName) : undefined;

    const company = normalizedCompany
      ? await prisma.company.upsert({
          where: {
            userId_normalizedName: {
              userId: input.userId,
              normalizedName: normalizedCompany
            }
          },
          update: {},
          create: {
            userId: input.userId,
            name: input.companyName ?? normalizedCompany,
            normalizedName: normalizedCompany
          }
        })
      : null;

    const existing = await prisma.opportunity.findFirst({
      where: {
        userId: input.userId,
        normalizedTitle,
        companyId: company?.id,
        location: input.location ?? null
      }
    });

    if (existing) {
      const shouldPatchExisting = !existing.recruitmentType && Boolean(input.recruitmentType);

      if (shouldPatchExisting) {
        await prisma.opportunity.update({
          where: { id: existing.id },
          data: {
            recruitmentType: input.recruitmentType
          }
        });
      }

      await prisma.opportunitySourceJob.upsert({
        where: {
          opportunityId_sourceJobId: {
            opportunityId: existing.id,
            sourceJobId: input.sourceJobId
          }
        },
        update: {},
        create: {
          opportunityId: existing.id,
          sourceJobId: input.sourceJobId,
          matchReason: "Rule match: company, title, location",
          matchScore: 0.8
        }
      });

      return existing;
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        userId: input.userId,
        companyId: company?.id,
        title: input.title,
        normalizedTitle,
        location: input.location,
        recruitmentType: input.recruitmentType,
        status: opportunityStatuses.DISCOVERED,
        opportunitySourceJobs: {
          create: {
            sourceJobId: input.sourceJobId,
            matchReason: "New opportunity from source record",
            matchScore: 1
          }
        }
      }
    });

    await timelineService.append({
      opportunityId: opportunity.id,
      actorType: timelineActorTypes.SYSTEM,
      eventType: timelineEventTypes.OPPORTUNITY_DISCOVERED,
      title: "发现新的岗位机会",
      metadata: {
        sourceJobId: input.sourceJobId
      }
    });

    return opportunity;
  }
}

export const opportunityMergeService = new OpportunityMergeService();
