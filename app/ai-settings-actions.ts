"use server";

import { cookies } from "next/headers";
import {
  aiModelCookieName,
  aiProviderCookieName,
  aiVerifiedCookieName,
  isAIProvider,
  isSupportedAIModel,
  openAIKeyCookieName,
  type AIProvider
} from "@/src/lib/ai-config";
import { requestAIJson } from "@/src/services/ai-json-chat";

export type AISettingsState = {
  status: "idle" | "success" | "error" | "cleared";
  message: string;
};

const cookieOptions = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 180,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production"
};

function explainConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("401") || message.includes("authentication") || message.includes("invalid api key")) {
    return "API Key 无效，请检查是否复制完整。";
  }
  if (message.includes("402") || message.includes("insufficient") || message.includes("balance")) {
    return "账户余额不足或尚未开通 API 计费。";
  }
  if (message.includes("403") || message.includes("permission")) {
    return "当前 API Key 没有使用该模型的权限。";
  }
  if (message.includes("404") || message.includes("model") || message.includes("not found")) {
    return "模型不可用，请重新选择模型。";
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return "请求频率或账户额度受限，请稍后重试。";
  }
  if (message.includes("fetch") || message.includes("network") || message.includes("timeout")) {
    return "无法连接 AI 服务商，请检查网络后重试。";
  }
  return "连接测试失败，请确认 API Key、账户状态和模型权限。";
}

export async function updateAISettings(
  _previousState: AISettingsState,
  formData: FormData
): Promise<AISettingsState> {
  const cookieStore = await cookies();
  const intent = String(formData.get("intent") || "save");

  if (intent === "clear") {
    cookieStore.delete(openAIKeyCookieName);
    cookieStore.delete(aiProviderCookieName);
    cookieStore.delete(aiModelCookieName);
    cookieStore.delete(aiVerifiedCookieName);
    return { status: "cleared", message: "AI 配置已清除。" };
  }

  const providerValue = String(formData.get("aiProvider") || "");
  const provider: AIProvider = isAIProvider(providerValue) ? providerValue : "openai";
  const model = String(formData.get("aiModel") || "").trim();
  const newApiKey = String(formData.get("aiApiKey") || "").trim();
  const savedProviderValue = cookieStore.get(aiProviderCookieName)?.value || "";
  const savedProvider = isAIProvider(savedProviderValue) ? savedProviderValue : "openai";
  const savedApiKey = cookieStore.get(openAIKeyCookieName)?.value?.trim() || "";
  const environmentApiKey = provider === "openai" ? process.env.OPENAI_API_KEY?.trim() || "" : "";

  if (!isSupportedAIModel(provider, model)) {
    return { status: "error", message: "模型名称无效，请从列表中重新选择。" };
  }

  if (!newApiKey && provider !== savedProvider) {
    return { status: "error", message: "切换服务商后需要输入该服务商的新 API Key。" };
  }

  const apiKey = newApiKey || (provider === savedProvider ? savedApiKey : "") || environmentApiKey;
  if (!apiKey) {
    return { status: "error", message: "请先输入 API Key。" };
  }

  try {
    await requestAIJson({
      apiKey,
      model,
      provider,
      system: "Return one valid JSON object only.",
      user: { test: "Reply with {\"ok\":true}." }
    });
  } catch (error) {
    return { status: "error", message: explainConnectionError(error) };
  }

  const verifiedAt = new Date().toISOString();
  cookieStore.set(aiProviderCookieName, provider, cookieOptions);
  cookieStore.set(aiModelCookieName, model, cookieOptions);
  cookieStore.set(aiVerifiedCookieName, JSON.stringify({ provider, model, verifiedAt }), cookieOptions);
  if (newApiKey) {
    cookieStore.set(openAIKeyCookieName, newApiKey, cookieOptions);
  }

  return { status: "success", message: "连接测试成功，配置已保存。" };
}
