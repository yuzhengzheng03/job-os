import { requestAIJson } from "@/src/services/ai-json-chat";
import type { AIProvider } from "@/src/lib/ai-config";

export type JobAnalysisResult = {
  summary: string;
  responsibilities: string[];
  requirements: string[];
  keywords: string[];
  skills: string[];
  fitNotes?: string;
  risks?: string[];
};

type AnalyzeJobInput = {
  title: string;
  companyName?: string;
  location?: string;
  url: string;
  rawText: string;
};

type AnalyzeJobOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: AIProvider;
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function normalizeAnalysis(value: unknown): JobAnalysisResult {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    responsibilities: normalizeStringArray(data.responsibilities),
    requirements: normalizeStringArray(data.requirements),
    keywords: normalizeStringArray(data.keywords),
    skills: normalizeStringArray(data.skills),
    fitNotes: typeof data.fitNotes === "string" ? data.fitNotes : undefined,
    risks: normalizeStringArray(data.risks)
  };
}

export function hasOpenAIConfig(apiKey?: string) {
  return Boolean(apiKey?.trim() || process.env.OPENAI_API_KEY);
}

export async function analyzeJobWithOpenAI(input: AnalyzeJobInput, options: AnalyzeJobOptions = {}): Promise<{
  analysis: JobAnalysisResult;
  model: string;
  rawOutput: unknown;
}> {
  const result = await requestAIJson({
    ...options,
    system: [
      "你是 Job OS 的 JD 解读助手，服务对象是正在管理求职机会的求职者。",
      "你只能基于用户提供的岗位原文分析，不要编造事实。",
      "不要给匹配分，不要输出匹配原因，不要替用户决定是否投递。",
      "不要输出下一步动作清单，只解释 JD 中已经出现的信息和求职者需要理解的含义。",
      "如果信息缺失，返回空字符串或空数组。",
      "请只返回合法 JSON，不要输出 Markdown。"
    ].join("\n"),
    user: {
      task: "解读这份 JD 原文，帮助求职者快速理解岗位内容、硬性要求和需要在简历中呈现的能力。",
      outputSchema: {
        summary: "string，用求职者视角概括这份 JD 的岗位定位，不超过 80 字",
        responsibilities: "string[]，从 JD 原文拆出的主要工作内容，不要扩写不存在的职责",
        requirements: "string[]，从 JD 原文拆出的硬性要求、经验要求、学历要求或背景要求",
        keywords: "string[]，JD 中值得标记的岗位关键词、业务关键词或技术关键词",
        skills: "string[]，求职者在简历/作品集中应当呈现的能力证据，只基于 JD 推导",
        fitNotes: "string，说明这份 JD 背后的岗位画像、工作重心和可能看重的候选人特征，不要说匹配度",
        risks: "string[]，JD 中不清楚、需要确认或可能影响投递判断的信息"
      },
      job: {
        title: input.title,
        companyName: input.companyName,
        location: input.location,
        url: input.url,
        rawText: input.rawText
      }
    }
  });

  return {
    analysis: normalizeAnalysis(result.parsed),
    model: result.model,
    rawOutput: result.rawOutput
  };
}
