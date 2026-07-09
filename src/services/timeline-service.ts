import type { Prisma } from "@prisma/client";
import type { TimelineActorTypeValue, TimelineEventTypeValue } from "@/src/domain/domain-values";
import { prisma } from "@/src/lib/prisma";

export type AppendTimelineInput = {
  opportunityId: string;
  actorType: TimelineActorTypeValue;
  eventType: TimelineEventTypeValue;
  title: string;
  body?: string;
  metadata?: Prisma.InputJsonValue;
};

export class TimelineService {
  async append(input: AppendTimelineInput) {
    return prisma.timeline.create({
      data: {
        opportunityId: input.opportunityId,
        actorType: input.actorType,
        eventType: input.eventType,
        title: input.title,
        body: input.body,
        metadata: input.metadata
      }
    });
  }
}

export const timelineService = new TimelineService();
