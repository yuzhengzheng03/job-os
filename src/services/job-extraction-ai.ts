import { getConfiguredAIConfig } from "@/src/lib/ai-config";
import { requestAIJson } from "@/src/services/ai-json-chat";

export type ExtractedJob = {
  title: string;
  location?: string;
  recruitmentType?: string;
  rawText: string;
};

type ExtractJobsInput = {
  companyName: string;
  url: string;
  pageText: string;
  fallbackLocation?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeExtractedJobs(value: unknown, fallbackLocation?: string): ExtractedJob[] {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const normalized: ExtractedJob[] = [];

  for (const item of jobs) {
    const job = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const title = normalizeString(job.title);
    const rawText = normalizeString(job.rawText);

    if (!title || !rawText) {
      continue;
    }

    normalized.push({
      title,
      location: normalizeString(job.location) || fallbackLocation,
      recruitmentType: normalizeString(job.recruitmentType) || undefined,
      rawText
    });
  }

  return normalized.slice(0, 12);
}

export async function extractJobsFromCareerText(input: ExtractJobsInput): Promise<{
  jobs: ExtractedJob[];
  model: string;
  rawOutput: unknown;
  status: "AI" | "NOT_CONFIGURED" | "FAILED";
  error?: string;
}> {
  const aiConfig = await getConfiguredAIConfig();

  if (!aiConfig.apiKey) {
    return {
      jobs: [],
      model: "not-configured",
      rawOutput: null,
      status: "NOT_CONFIGURED",
      error: "请先配置 AI API Key。"
    };
  }

  try {
    const result = await requestAIJson({
      system: [
        "你是 Job OS 的招聘页岗位抽取助手。",
        "你只从用户提供的招聘页文本中抽取真实出现的岗位，不要编造岗位。",
        "不要输出匹配分数，不要输出推荐动作。",
        "如果页面没有明确岗位，返回 jobs: []。",
        "只返回合法 JSON，不要输出 Markdown。"
      ].join("\n"),
      user: {
        task: "从招聘页文本抽取岗位，供用户确认后加入岗位管理看板。",
        companyName: input.companyName,
        url: input.url,
        fallbackLocation: input.fallbackLocation,
        outputSchema: {
          jobs: [
            {
              title: "string，岗位名称",
              location: "string，可选，城市/地点",
              recruitmentType: "string，可选，校招/实习/社招/提前批等",
              rawText: "string，该岗位在页面中的原文片段，保留职责/要求/地点等关键信息"
            }
          ]
        },
        pageText: input.pageText.slice(0, 50000)
      }
    });

    const jobs = normalizeExtractedJobs(result.parsed, input.fallbackLocation);

    return {
      jobs,
      model: result.model,
      rawOutput: result.rawOutput,
      status: "AI"
    };
  } catch (error) {
    return {
      jobs: [],
      model: aiConfig.model,
      rawOutput: null,
      status: "FAILED",
      error: error instanceof Error ? error.message : "AI 招聘页抽取失败。"
    };
  }
}
