import { sha256 } from "@/src/domain/hash";
import { prisma } from "@/src/lib/prisma";

export type CreateSourceJobInput = {
  sourceId: string;
  url: string;
  rawText: string;
  rawHtml?: string;
  rawMarkdown?: string;
  screenshotPath?: string;
  externalId?: string;
  publishedAt?: Date;
  sourceUpdatedAt?: Date;
};

export class SourceJobService {
  async create(input: CreateSourceJobInput) {
    const contentHash = sha256([input.url, input.rawText, input.rawMarkdown ?? ""].join("\n---\n"));

    return prisma.sourceJob.create({
      data: {
        sourceId: input.sourceId,
        url: input.url,
        rawText: input.rawText,
        rawHtml: input.rawHtml,
        rawMarkdown: input.rawMarkdown,
        screenshotPath: input.screenshotPath,
        externalId: input.externalId,
        publishedAt: input.publishedAt,
        sourceUpdatedAt: input.sourceUpdatedAt,
        contentHash
      }
    });
  }
}

export const sourceJobService = new SourceJobService();

