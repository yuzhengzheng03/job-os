import { getConfiguredAIConfig } from "@/src/lib/ai-config";
import { requestAIJson } from "@/src/services/ai-json-chat";

export type MonitorStrategyDraft = {
  name: string;
  background: string[];
  roles: string[];
  locations: string[];
  industries: string[];
  educationRequirements: string[];
  recruitmentTypes: string[];
  keywords: string[];
  excludeKeywords: string[];
  strategyMode: "ROLE_FIRST" | "DOMAIN_FIRST" | "COMPANY_FIRST";
};

const commonCities = ["北京", "上海", "深圳", "广州", "杭州", "苏州", "南京", "成都", "武汉", "西安"];
const commonRecruitmentTypes = ["校招", "秋招", "提前批", "实习", "社招"];
const commonEducation = ["本科", "硕士", "博士"];

function uniq(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function pickMatches(text: string, candidates: string[]) {
  return candidates.filter((item) => text.includes(item));
}

function buildLocalStrategyDraft(description: string): MonitorStrategyDraft {
  const roles = uniq([
    ...(description.includes("产品") ? ["产品经理"] : []),
    ...(description.includes("研发") ? ["研发工程师"] : []),
    ...(description.includes("算法") ? ["算法工程师"] : []),
    ...(description.includes("质量") || description.includes("法规") ? ["质量/法规"] : []),
    ...(description.includes("临床") || description.includes("应用") ? ["临床/应用"] : [])
  ]);

  const industries = uniq([
    ...(description.includes("生物医学") ? ["生物医学"] : []),
    ...(description.includes("医疗器械") ? ["医疗器械"] : []),
    ...(description.includes("AI") || description.includes("人工智能") ? ["AI"] : []),
    ...(description.includes("医疗") ? ["医疗健康"] : [])
  ]);

  const locations = pickMatches(description, commonCities);
  const recruitmentTypes = pickMatches(description, commonRecruitmentTypes);
  const educationRequirements = pickMatches(description, commonEducation);
  const strategyMode = industries.length > 0 && roles.length === 0 ? "DOMAIN_FIRST" : roles.length > 0 ? "ROLE_FIRST" : "COMPANY_FIRST";

  return {
    name: description.slice(0, 24) || "新的监控策略",
    background: description.includes("生物医学工程") ? ["生物医学工程"] : [],
    roles: roles.length > 0 ? roles : ["产品经理"],
    locations,
    industries,
    educationRequirements,
    recruitmentTypes,
    keywords: uniq([...roles, ...industries, ...recruitmentTypes]),
    excludeKeywords: [],
    strategyMode
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniq(value.filter((item): item is string => typeof item === "string"));
}

function normalizeStrategyDraft(value: unknown, fallback: MonitorStrategyDraft): MonitorStrategyDraft {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const strategyMode = data.strategyMode === "DOMAIN_FIRST" || data.strategyMode === "COMPANY_FIRST" ? data.strategyMode : "ROLE_FIRST";

  return {
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : fallback.name,
    background: normalizeStringArray(data.background),
    roles: normalizeStringArray(data.roles),
    locations: normalizeStringArray(data.locations),
    industries: normalizeStringArray(data.industries),
    educationRequirements: normalizeStringArray(data.educationRequirements),
    recruitmentTypes: normalizeStringArray(data.recruitmentTypes),
    keywords: normalizeStringArray(data.keywords),
    excludeKeywords: normalizeStringArray(data.excludeKeywords),
    strategyMode
  };
}

export async function generateMonitorStrategyDraft(description: string): Promise<{
  draft: MonitorStrategyDraft;
  model: string;
  rawOutput: unknown;
  status: "AI" | "NOT_CONFIGURED" | "FAILED";
  error?: string;
}> {
  const fallback = buildLocalStrategyDraft(description);
  const aiConfig = await getConfiguredAIConfig();

  if (!aiConfig.apiKey) {
    return {
      draft: fallback,
      model: "not-configured",
      rawOutput: null,
      status: "NOT_CONFIGURED",
      error: "请先配置 AI API Key。"
    };
  }

  try {
    const result = await requestAIJson({
      system: [
        "你是 Job OS 的监控策略助手。",
        "用户会用自然语言描述想找的岗位、城市、行业、学历和公司偏好。",
        "你需要把描述转成结构化监控策略。",
        "不要编造用户没提到的硬性条件；可以补充合理关键词。",
        "只返回合法 JSON，不要输出 Markdown。"
      ].join("\n"),
      user: {
        description,
        outputSchema: {
          name: "string，策略名称",
          background: "string[]，专业/背景/技能",
          roles: "string[]，岗位方向",
          locations: "string[]，城市/地区",
          industries: "string[]，行业/领域",
          educationRequirements: "string[]，学历要求",
          recruitmentTypes: "string[]，招聘类型",
          keywords: "string[]，用于搜索岗位的关键词",
          excludeKeywords: "string[]，排除词",
          strategyMode: "ROLE_FIRST | DOMAIN_FIRST | COMPANY_FIRST"
        }
      }
    });

    return {
      draft: normalizeStrategyDraft(result.parsed, fallback),
      model: result.model,
      rawOutput: result.rawOutput,
      status: "AI"
    };
  } catch (error) {
    return {
      draft: fallback,
      model: aiConfig.model,
      rawOutput: null,
      status: "FAILED",
      error: error instanceof Error ? error.message : "AI 求职策略生成失败。"
    };
  }
}
