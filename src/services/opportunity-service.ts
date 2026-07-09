import type { Prisma } from "@prisma/client";
import type { OpportunityStatusValue } from "@/src/domain/domain-values";
import { timelineActorTypes, timelineEventTypes } from "@/src/domain/domain-values";
import { getOpportunityStatusLabel } from "@/src/domain/display-labels";
import { prisma } from "@/src/lib/prisma";
import { timelineService } from "@/src/services/timeline-service";

export type ApplicationInfoInput = {
  deadlineAt?: Date | null;
  appliedAt?: string;
  applicationChannel?: string;
  resumeVersion?: string;
  referrer?: string;
  applicationAccount?: string;
  nextInterviewAt?: string;
  interviewRound?: string;
  lastFollowUpAt?: string;
  followUpAt?: string;
  closeReason?: string;
  applicationNotes?: string;
};

function cleanApplicationInfo(input: ApplicationInfoInput): Prisma.InputJsonObject {
  const entries = Object.entries(input).filter(([key, value]) => key !== "deadlineAt" && typeof value === "string" && value.trim().length > 0);
  return Object.fromEntries(entries.map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])) as Prisma.InputJsonObject;
}

export class OpportunityService {
  async changeStatus(opportunityId: string, status: OpportunityStatusValue, actorType = timelineActorTypes.USER) {
    const current = await prisma.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
      select: { status: true }
    });

    const opportunity = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { status }
    });

    await timelineService.append({
      opportunityId,
      actorType,
      eventType: timelineEventTypes.STATUS_CHANGED,
      title: "求职状态已更新",
      body: `${getOpportunityStatusLabel(current.status)} → ${getOpportunityStatusLabel(status)}`,
      metadata: {
        from: current.status,
        to: status
      }
    });

    return opportunity;
  }

  async updateNotes(opportunityId: string, userNotes: string) {
    const opportunity = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { userNotes }
    });

    await timelineService.append({
      opportunityId,
      actorType: timelineActorTypes.USER,
      eventType: timelineEventTypes.NOTE_CREATED,
      title: "更新了求职备注",
      body: userNotes
    });

    return opportunity;
  }

  async updateApplicationInfo(opportunityId: string, input: ApplicationInfoInput) {
    const applicationInfo = cleanApplicationInfo(input);
    const opportunity = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        applicationInfo,
        deadlineAt: input.deadlineAt
      }
    });

    await timelineService.append({
      opportunityId,
      actorType: timelineActorTypes.USER,
      eventType: timelineEventTypes.NOTE_CREATED,
      title: "更新了投递信息",
      metadata: {
        fields: Object.keys(applicationInfo),
        deadlineAt: input.deadlineAt?.toISOString() ?? null
      }
    });

    return opportunity;
  }
}

export const opportunityService = new OpportunityService();
