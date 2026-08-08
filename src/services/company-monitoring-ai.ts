import type { SearchProfile } from "@prisma/client";
import { getConfiguredAIConfig } from "@/src/lib/ai-config";
import { requestAIJson } from "@/src/services/ai-json-chat";

export type CompanyMonitorCandidate = {
  name: string;
  websiteUrl?: string;
  careerUrl?: string;
  tags: string[];
  priority: number;
  reason: string;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function getStrategyProfileText(profile: SearchProfile) {
  const sourceScope = profile.sourceScope && typeof profile.sourceScope === "object" && !Array.isArray(profile.sourceScope)
    ? (profile.sourceScope as Record<string, unknown>)
    : {};

  return {
    name: profile.name,
    keywords: asStringArray(profile.keywords),
    locations: asStringArray(profile.locations),
    industries: asStringArray(profile.industries),
    educationRequirements: asStringArray(profile.educationRequirements),
    recruitmentTypes: asStringArray(profile.recruitmentTypes),
    roles: asStringArray(sourceScope.roles),
    background: asStringArray(sourceScope.background),
    excludeKeywords: asStringArray(sourceScope.excludeKeywords),
    strategyMode: typeof sourceScope.strategyMode === "string" ? sourceScope.strategyMode : undefined,
    originalDescription: typeof sourceScope.originalDescription === "string" ? sourceScope.originalDescription : undefined
  };
}

function normalizeCandidate(value: unknown): CompanyMonitorCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const data = value as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";

  if (!name) {
    return null;
  }

  return {
    name,
    websiteUrl: typeof data.websiteUrl === "string" ? data.websiteUrl.trim() : undefined,
    careerUrl: typeof data.careerUrl === "string" ? data.careerUrl.trim() : undefined,
    tags: uniq(asStringArray(data.tags)),
    priority: typeof data.priority === "number" ? Math.max(0, Math.min(3, Math.round(data.priority))) : 1,
    reason: typeof data.reason === "string" ? data.reason.trim() : "按当前监控策略建议加入候选公司。"
  };
}

export async function generateCompanyMonitorCandidates(profile: SearchProfile): Promise<{
  candidates: CompanyMonitorCandidate[];
  model: string;
  rawOutput: unknown;
  status: "AI" | "NOT_CONFIGURED" | "FAILED";
  error?: string;
}> {
  const aiConfig = await getConfiguredAIConfig();

  if (!aiConfig.apiKey) {
    return {
      candidates: [],
      model: "not-configured",
      rawOutput: null,
      status: "NOT_CONFIGURED",
      error: "请先在左下角的 AI 能力配置中保存 API Key。"
    };
  }

  try {
    const result = await requestAIJson({
      system: [
        "你是 Job OS 的公司监控助手。",
        "根据用户的完整监控策略，建议 8 到 12 家值得加入监控的公司。",
        "候选公司必须同时考虑岗位方向、行业背景、招聘类型和城市，不要只命中其中一个关键词。",
        "优先给出与用户专业背景和目标岗位有直接交集的公司，并兼顾外企、国内企业和不同规模公司。",
        "reason 必须分别说明行业相关性、岗位相关性和招聘类型相关性。",
        "不知道准确官网或招聘入口时留空，不要编造 URL，也不要声称公司当前正在招聘。",
        "输出候选公司，不要直接替用户确认监控。",
        "只返回合法 JSON，不要输出 Markdown。"
      ].join("\n"),
      user: {
        strategy: getStrategyProfileText(profile),
        outputSchema: {
          candidates: [
            {
              name: "string，公司名称",
              websiteUrl: "string，可选，公司官网",
              careerUrl: "string，可选，招聘入口",
              tags: "string[]，领域/城市/方向标签",
              priority: "number，0-3，3 最高",
              reason: "string，为什么建议监控"
            }
          ]
        }
      }
    });

    const parsed = result.parsed as { candidates?: unknown[] };
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.map(normalizeCandidate).filter(Boolean) : [];

    if (!candidates.length) {
      return {
        candidates: [],
        model: result.model,
        rawOutput: result.rawOutput,
        status: "FAILED",
        error: "AI 没有返回有效的候选公司，请补充城市、岗位方向或行业偏好后重试。"
      };
    }

    return {
      candidates: candidates as CompanyMonitorCandidate[],
      model: result.model,
      rawOutput: result.rawOutput,
      status: "AI"
    };
  } catch (error) {
    return {
      candidates: [],
      model: aiConfig.model,
      rawOutput: null,
      status: "FAILED",
      error: error instanceof Error ? error.message : "AI 候选公司生成失败。"
    };
  }
}
