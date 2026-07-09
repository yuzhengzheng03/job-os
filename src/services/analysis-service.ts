import { opportunityStatuses, timelineActorTypes, timelineEventTypes } from "@/src/domain/domain-values";
import { prisma } from "@/src/lib/prisma";
import { analyzeJobWithOpenAI, hasOpenAIConfig, type JobAnalysisResult } from "@/src/services/openai-job-analysis";
import { timelineService } from "@/src/services/timeline-service";

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function buildMockAnalysis(rawText: string): JobAnalysisResult {
  const rawLines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const responsibilities = rawLines.filter((line) => /负责|职责|工作内容|参与|推进|设计|研究/.test(line)).slice(0, 5);
  const requirements = rawLines.filter((line) => /要求|能力|经验|学历|本科|硕士|优先|熟悉/.test(line)).slice(0, 5);

  return {
    summary: rawLines.slice(0, 2).join(" ") || "已根据岗位原文生成初步 JD 解读。",
    responsibilities: responsibilities.length > 0 ? responsibilities : rawLines.slice(0, 3),
    requirements,
    keywords: ["岗位原文", "招聘要求", "求职材料"],
    skills: ["把 JD 中出现的职责改写成简历项目证据", "准备与岗位关键词对应的经历说明"],
    fitNotes: "当前使用本地兜底解读。配置 OPENAI_API_KEY 后，可以基于 JD 原文生成更完整的岗位画像、能力证据和风险提示。",
    risks: rawText.length < 120 ? ["当前 JD 原文较短，岗位职责、要求或投递条件可能不完整。"] : []
  };
}

function inferRecruitmentType(text: string) {
  if (/秋招|校园招聘|校招|应届/.test(text)) {
    return "秋招";
  }

  if (/实习|Intern|internship/i.test(text)) {
    return "实习";
  }

  if (/社招|社会招聘|全职|经验/.test(text)) {
    return "社招";
  }

  return undefined;
}

export class AnalysisService {
  async analyze(opportunityId: string) {
    const opportunity = await prisma.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
      include: {
        opportunitySourceJobs: {
          include: {
            sourceJob: true
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    });

    const sourceJob = opportunity.opportunitySourceJobs[0]?.sourceJob;
    if (!sourceJob) {
      await timelineService.append({
        opportunityId,
        actorType: timelineActorTypes.SYSTEM,
        eventType: timelineEventTypes.DATA_ERROR,
        title: "暂时无法分析",
        body: "这个机会还没有可分析的岗位信息。"
      });
      return null;
    }

    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { status: opportunityStatuses.ANALYZING }
    });

    await timelineService.append({
      opportunityId,
      actorType: timelineActorTypes.AI,
      eventType: timelineEventTypes.AI_ANALYSIS_STARTED,
      title: "开始解读岗位",
      metadata: { sourceJobId: sourceJob.id }
    });

    const latest = await prisma.jobAnalysis.findFirst({
      where: { opportunityId },
      orderBy: { version: "desc" },
      select: { version: true }
    });

    const version = (latest?.version ?? 0) + 1;
    let model = "mock-analysis-v0";
    let promptVersion = "mock-v0";
    let rawOutput: unknown = buildMockAnalysis(sourceJob.rawText);
    let analysisData: JobAnalysisResult = buildMockAnalysis(sourceJob.rawText);

    if (hasOpenAIConfig()) {
      try {
        const openAIResult = await analyzeJobWithOpenAI({
          title: opportunity.title,
          companyName: undefined,
          location: opportunity.location ?? undefined,
          url: sourceJob.url,
          rawText: sourceJob.rawText
        });

        model = openAIResult.model;
        promptVersion = "job-jd-interpretation-openai-v2";
        rawOutput = openAIResult.rawOutput;
        analysisData = openAIResult.analysis;
      } catch (error) {
        await timelineService.append({
          opportunityId,
          actorType: timelineActorTypes.AI,
          eventType: timelineEventTypes.ANALYSIS_ERROR,
          title: "真实 AI 解读失败，已使用本地解读",
          body: error instanceof Error ? error.message : "未知错误",
          metadata: { sourceJobId: sourceJob.id }
        });
      }
    }

    const analysis = await prisma.jobAnalysis.create({
      data: {
        opportunityId,
        sourceJobId: sourceJob.id,
        version,
        model,
        promptVersion,
        summary: analysisData.summary || "已根据岗位原文生成初步解读。",
        responsibilities: analysisData.responsibilities,
        requirements: analysisData.requirements,
        keywords: analysisData.keywords,
        skills: analysisData.skills,
        fitNotes: analysisData.fitNotes,
        risks: analysisData.risks,
        rawOutput: toJsonValue(rawOutput)
      }
    });

    const inferredRecruitmentType = opportunity.recruitmentType ? undefined : inferRecruitmentType(`${opportunity.title}\n${sourceJob.rawText}`);

    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        status: opportunityStatuses.READY,
        ...(inferredRecruitmentType ? { recruitmentType: inferredRecruitmentType } : {})
      }
    });

    await timelineService.append({
      opportunityId,
      actorType: timelineActorTypes.AI,
      eventType: timelineEventTypes.AI_ANALYSIS_COMPLETED,
      title: "岗位解读完成",
      metadata: {
        sourceJobId: sourceJob.id,
        analysisId: analysis.id,
        version
      }
    });

    return analysis;
  }
}

export const analysisService = new AnalysisService();
