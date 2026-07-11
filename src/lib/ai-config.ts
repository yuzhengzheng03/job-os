import { cookies } from "next/headers";

export const openAIKeyCookieName = "job_os_openai_api_key";
export const aiProviderCookieName = "job_os_ai_provider";
export const aiModelCookieName = "job_os_ai_model";

export type AIProvider = "openai" | "claude" | "deepseek";

const providerDefaults: Record<AIProvider, { baseUrl: string; model: string }> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini"
  },
  claude: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-latest"
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat"
  }
};

export function isAIProvider(value: string): value is AIProvider {
  return value === "openai" || value === "claude" || value === "deepseek";
}

export function getProviderDefaults(provider: AIProvider) {
  return providerDefaults[provider];
}

export async function getConfiguredAIConfig(options: { apiKey?: string; model?: string; provider?: AIProvider; baseUrl?: string } = {}) {
  const cookieStore = await cookies();
  const cookieProvider = cookieStore.get(aiProviderCookieName)?.value ?? "";
  const provider = options.provider || (isAIProvider(cookieProvider) ? cookieProvider : "openai");
  const defaults = getProviderDefaults(provider);

  return {
    provider,
    apiKey: options.apiKey?.trim() || cookieStore.get(openAIKeyCookieName)?.value?.trim() || process.env.OPENAI_API_KEY || "",
    model: options.model?.trim() || cookieStore.get(aiModelCookieName)?.value?.trim() || process.env.OPENAI_MODEL || defaults.model,
    baseUrl: options.baseUrl?.trim() || process.env.OPENAI_BASE_URL || defaults.baseUrl
  };
}

export async function getConfiguredOpenAIApiKey() {
  return (await getConfiguredAIConfig()).apiKey;
}
