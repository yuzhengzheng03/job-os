export type AIProvider = "openai" | "claude" | "deepseek";

export const providerModels: Record<AIProvider, readonly { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-5-mini", label: "GPT-5 mini" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" }
  ],
  claude: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" }
  ],
  deepseek: [
    { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" }
  ]
};

const providerDefaults: Record<AIProvider, { baseUrl: string; model: string }> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: providerModels.openai[0].value
  },
  claude: {
    baseUrl: "https://api.anthropic.com/v1",
    model: providerModels.claude[0].value
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    model: providerModels.deepseek[0].value
  }
};

export function isAIProvider(value: string): value is AIProvider {
  return value === "openai" || value === "claude" || value === "deepseek";
}

export function getProviderDefaults(provider: AIProvider) {
  return providerDefaults[provider];
}

export function normalizeAIModel(provider: AIProvider, value?: string) {
  const normalized = (value || "")
    .trim()
    .replace(/[‐‑‒–—−]/g, "-")
    .toLowerCase();
  const match = providerModels[provider].find((model) => model.value === normalized);
  return match?.value || providerDefaults[provider].model;
}

export function isSupportedAIModel(provider: AIProvider, value: string) {
  return providerModels[provider].some((model) => model.value === value);
}
