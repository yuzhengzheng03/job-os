import { getConfiguredAIConfig, type AIProvider } from "@/src/lib/ai-config";

type AIJsonChatOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: AIProvider;
  system: string;
  user: unknown;
};

function parseJsonContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

async function requestOpenAICompatibleJson(config: Awaited<ReturnType<typeof getConfiguredAIConfig>>, system: string, user: unknown) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
      ]
    }),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${await response.text()}`);
  }

  const rawOutput = await response.json();
  const content = rawOutput?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("AI response did not include text content.");
  }

  return { parsed: parseJsonContent(content), rawOutput };
}

async function requestClaudeJson(config: Awaited<ReturnType<typeof getConfiguredAIConfig>>, system: string, user: unknown) {
  const response = await fetch(`${config.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": config.apiKey
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2000,
      system,
      messages: [
        {
          role: "user",
          content: JSON.stringify(user)
        }
      ]
    }),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${await response.text()}`);
  }

  const rawOutput = await response.json();
  const textBlocks = Array.isArray(rawOutput?.content) ? rawOutput.content : [];
  const content = textBlocks
    .map((item: unknown) => item && typeof item === "object" && "text" in item ? String((item as { text?: unknown }).text ?? "") : "")
    .join("")
    .trim();

  if (!content) {
    throw new Error("AI response did not include text content.");
  }

  return { parsed: parseJsonContent(content), rawOutput };
}

export async function requestAIJson(options: AIJsonChatOptions): Promise<{ parsed: unknown; rawOutput: unknown; model: string; provider: AIProvider }> {
  const config = await getConfiguredAIConfig(options);

  if (!config.apiKey) {
    throw new Error("AI API Key is not configured.");
  }

  const result = config.provider === "claude"
    ? await requestClaudeJson(config, options.system, options.user)
    : await requestOpenAICompatibleJson(config, options.system, options.user);

  return {
    ...result,
    model: config.model,
    provider: config.provider
  };
}
