import { inferTitle } from "@/src/domain/normalize";
import { analysisService } from "@/src/services/analysis-service";
import { opportunityMergeService } from "@/src/services/opportunity-merge-service";
import { sourceJobService } from "@/src/services/source-job-service";

export type ManualImportInput = {
  userId: string;
  sourceId: string;
  url: string;
  rawText: string;
  companyName?: string;
  title?: string;
  location?: string;
};

export class ManualImportService {
  async import(input: ManualImportInput) {
    const sourceJob = await sourceJobService.create({
      sourceId: input.sourceId,
      url: input.url,
      rawText: input.rawText
    });

    const opportunity = await opportunityMergeService.mergeOrCreate({
      userId: input.userId,
      sourceJobId: sourceJob.id,
      companyName: input.companyName,
      title: input.title ?? inferTitle(input.rawText),
      location: input.location
    });

    const analysis = await analysisService.analyze(opportunity.id);

    return {
      sourceJob,
      opportunity,
      analysis
    };
  }
}

export const manualImportService = new ManualImportService();

