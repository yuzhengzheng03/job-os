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

function localExtractJobs(input: ExtractJobsInput): ExtractedJob[] {
  const keywords = /(岗位|职位|招聘|校招|实习|产品|经理|工程师|算法|研发|质量|法规|临床|应用|管培|暑期|秋招|intern|engineer|manager|associate|scientist|specialist)/i;
  const lines = input.pageText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 4 && line.length <= 140);
  const matched = lines.filter((line) => keywords.test(line) && !line.includes("隐私") && !line.includes("Cookie"));
  const uniqueTitles = Array.from(new Set(matched)).slice(0, 8);

  return uniqueTitles.map((title) => {
    const start = Math.max(0, lines.indexOf(title) - 2);
    const block = lines.slice(start, start + 8).join("\n");

    return {
      title,
      location: input.fallbackLocation,
      rawText: [`${title}`, `公司：${input.companyName}`, "岗位来源：招聘页抽取", block].join("\n")
    };
  });
}

export async function extractJobsFromCareerText(input: ExtractJobsInput): Promise<{
  jobs: ExtractedJob[];
  model: string;
  rawOutput: unknown;
}> {
  const fallback = localExtractJobs(input);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      jobs: fallback,
      model: "local-career-extraction-v0",
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
              "你是 Job OS 的招聘页岗位抽取助手。",
              "你只从用户提供的招聘页文本中抽取真实出现的岗位，不要编造岗位。",
              "不要输出匹配分数，不要输出推荐动作。",
              "如果页面没有明确岗位，返回 jobs: []。",
              "只返回合法 JSON，不要输出 Markdown。"
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
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

    const parsed = JSON.parse(content);
    const jobs = normalizeExtractedJobs(parsed, input.fallbackLocation);

    return {
      jobs: jobs.length ? jobs : fallback,
      model,
      rawOutput
    };
  } catch {
    return {
      jobs: fallback,
      model: "local-career-extraction-v0",
      rawOutput: fallback
    };
  }
}
