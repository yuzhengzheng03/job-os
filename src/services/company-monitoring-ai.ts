import type { SearchProfile } from "@prisma/client";

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
    background: asStringArray(sourceScope.background)
  };
}

function buildLocalCandidates(profile: SearchProfile): CompanyMonitorCandidate[] {
  const strategy = getStrategyProfileText(profile);
  const text = [
    strategy.name,
    ...strategy.keywords,
    ...strategy.industries,
    ...strategy.roles,
    ...strategy.background
  ].join(" ");

  if (text.includes("生物医学") || text.includes("医疗器械") || text.includes("医疗")) {
    return [
      {
        name: "Medtronic 美敦力",
        websiteUrl: "https://www.medtronic.com",
        careerUrl: "https://www.medtronic.com/us-en/about/careers.html",
        tags: uniq(["医疗器械", "生物医学工程", ...strategy.locations]),
        priority: 3,
        reason: "大型医疗器械公司，适合监控产品、临床应用、研发和质量法规方向。"
      },
      {
        name: "Johnson & Johnson MedTech 强生医疗科技",
        websiteUrl: "https://www.jnjmedtech.com",
        careerUrl: "https://www.careers.jnj.com",
        tags: uniq(["医疗器械", "校招", ...strategy.locations]),
        priority: 3,
        reason: "医疗科技业务覆盖广，适合持续跟踪校招和产品相关岗位。"
      },
      {
        name: "Boston Scientific 波士顿科学",
        websiteUrl: "https://www.bostonscientific.com",
        careerUrl: "https://jobs.bostonscientific.com",
        tags: uniq(["医疗器械", "临床应用", ...strategy.locations]),
        priority: 2,
        reason: "介入和医疗设备方向岗位较多，可作为医疗器械岗位监控池。"
      },
      {
        name: "Mindray 迈瑞医疗",
        websiteUrl: "https://www.mindray.com",
        careerUrl: "https://www.mindray.com/cn/about-us/careers",
        tags: uniq(["医疗器械", "国产龙头", ...strategy.locations]),
        priority: 3,
        reason: "国内医疗器械龙头，适合监控产品、研发、临床和市场方向。"
      }
    ];
  }

  if (text.includes("AI") || text.includes("大模型") || text.includes("LLM") || text.includes("Agent")) {
    return [
      {
        name: "字节跳动",
        websiteUrl: "https://www.bytedance.com",
        careerUrl: "https://jobs.bytedance.com",
        tags: uniq(["AI", "产品", ...strategy.locations]),
        priority: 3,
        reason: "AI 产品和平台方向岗位密集，适合做高频监控。"
      },
      {
        name: "阿里巴巴",
        websiteUrl: "https://www.alibaba.com",
        careerUrl: "https://talent.alibaba.com",
        tags: uniq(["AI", "产品", ...strategy.locations]),
        priority: 2,
        reason: "覆盖云、AI、企业服务和平台产品，可监控产品经理相关岗位。"
      },
      {
        name: "百度",
        websiteUrl: "https://www.baidu.com",
        careerUrl: "https://talent.baidu.com",
        tags: uniq(["AI", "大模型", ...strategy.locations]),
        priority: 2,
        reason: "AI 和大模型业务明确，适合关注 AI 产品、算法和平台岗位。"
      }
    ];
  }

  return [
    {
      name: "腾讯",
      websiteUrl: "https://www.tencent.com",
      careerUrl: "https://careers.tencent.com",
      tags: uniq(["产品", ...strategy.locations]),
      priority: 2,
      reason: "综合型互联网公司，适合作为产品经理岗位的基础监控对象。"
    },
    {
      name: "美团",
      websiteUrl: "https://www.meituan.com",
      careerUrl: "https://zhaopin.meituan.com",
      tags: uniq(["产品", "校招", ...strategy.locations]),
      priority: 2,
      reason: "业务场景丰富，产品岗位稳定出现，适合持续监控。"
    }
  ];
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
}> {
  const fallback = buildLocalCandidates(profile);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      candidates: fallback,
      model: "local-company-candidates-v0",
      rawOutput: fallback
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "你是 Job OS 的公司监控助手。",
              "根据用户的监控策略，建议值得加入监控的公司。",
              "输出候选公司，不要直接替用户确认监控。",
              "只返回合法 JSON，不要输出 Markdown。"
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
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
            })
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const rawOutput = await response.json();
    const content = rawOutput?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("OpenAI response did not include text content.");
    }

    const parsed = JSON.parse(content) as { candidates?: unknown[] };
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.map(normalizeCandidate).filter(Boolean) : [];

    return {
      candidates: candidates.length ? (candidates as CompanyMonitorCandidate[]) : fallback,
      model,
      rawOutput
    };
  } catch {
    return {
      candidates: fallback,
      model: "local-company-candidates-v0",
      rawOutput: fallback
    };
  }
}
