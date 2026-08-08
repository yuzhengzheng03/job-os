import { cookies } from "next/headers";
import {
  getProviderDefaults,
  isAIProvider,
  normalizeAIModel,
  type AIProvider
} from "@/src/lib/ai-provider-options";

export {
  getProviderDefaults,
  isAIProvider,
  isSupportedAIModel,
  normalizeAIModel,
  providerModels,
  type AIProvider
} from "@/src/lib/ai-provider-options";

export const openAIKeyCookieName = "job_os_openai_api_key";
export const aiProviderCookieName = "job_os_ai_provider";
export const aiModelCookieName = "job_os_ai_model";
export const aiVerifiedCookieName = "job_os_ai_verified";

export type AIVerification = {
  provider: AIProvider;
  model: string;
  verifiedAt: string;
};

export function parseAIVerification(value?: string): AIVerification | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<AIVerification>;
    if (
      !parsed.provider ||
      !isAIProvider(parsed.provider) ||
      !parsed.model ||
      !parsed.verifiedAt ||
      Number.isNaN(Date.parse(parsed.verifiedAt))
    ) {
      return null;
    }
    return { provider: parsed.provider, model: parsed.model, verifiedAt: parsed.verifiedAt };
  } catch {
    return null;
  }
}

export async function getConfiguredAIConfig(options: { apiKey?: string; model?: string; provider?: AIProvider; baseUrl?: string } = {}) {
  const cookieStore = await cookies();
  const cookieProvider = cookieStore.get(aiProviderCookieName)?.value ?? "";
  const provider = options.provider || (isAIProvider(cookieProvider) ? cookieProvider : "openai");
  const defaults = getProviderDefaults(provider);
  const environmentApiKey = provider === "openai" ? process.env.OPENAI_API_KEY : undefined;
  const environmentModel = provider === "openai" ? process.env.OPENAI_MODEL : undefined;
  const environmentBaseUrl = provider === "openai" ? process.env.OPENAI_BASE_URL : undefined;

  return {
    provider,
    apiKey: options.apiKey?.trim() || cookieStore.get(openAIKeyCookieName)?.value?.trim() || environmentApiKey || "",
    model: normalizeAIModel(
      provider,
      options.model?.trim() || cookieStore.get(aiModelCookieName)?.value?.trim() || environmentModel || defaults.model
    ),
    baseUrl: options.baseUrl?.trim() || environmentBaseUrl || defaults.baseUrl
  };
}

export async function getConfiguredOpenAIApiKey() {
  return (await getConfiguredAIConfig()).apiKey;
}
