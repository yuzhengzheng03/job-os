import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { NavLinks } from "@/app/nav-links";
import { aiModelCookieName, aiProviderCookieName, getProviderDefaults, isAIProvider, openAIKeyCookieName } from "@/src/lib/ai-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job OS",
  description: "个人求职机会管理工作台"
};

async function saveAIConfig(formData: FormData) {
  "use server";

  const apiKey = String(formData.get("openaiApiKey") || "").trim();
  const providerValue = String(formData.get("aiProvider") || "openai");
  const model = String(formData.get("aiModel") || "").trim();
  const provider = isAIProvider(providerValue) ? providerValue : "openai";
  const intent = String(formData.get("intent") || "save");
  const cookieStore = await cookies();

  if (intent === "clear") {
    cookieStore.delete(openAIKeyCookieName);
    cookieStore.delete(aiProviderCookieName);
    cookieStore.delete(aiModelCookieName);
    return;
  }

  const savedProviderValue = cookieStore.get(aiProviderCookieName)?.value ?? "";
  const savedProvider = isAIProvider(savedProviderValue) ? savedProviderValue : "openai";

  // A blank password field means “keep the saved key”, not “clear it”.
  // Switching providers still requires a new key so an OpenAI key is never
  // accidentally sent to another provider.
  if (!apiKey && provider !== savedProvider) {
    return;
  }

  cookieStore.set(aiProviderCookieName, provider, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 180,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  if (model) {
    cookieStore.set(aiModelCookieName, model, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 180,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
  } else {
    cookieStore.delete(aiModelCookieName);
  }

  if (apiKey) {
    cookieStore.set(openAIKeyCookieName, apiKey, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 180,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const cookieProvider = cookieStore.get(aiProviderCookieName)?.value ?? "";
  const activeProvider = isAIProvider(cookieProvider) ? cookieProvider : "openai";
  const activeModel =
    cookieStore.get(aiModelCookieName)?.value ||
    (activeProvider === "openai" ? process.env.OPENAI_MODEL : undefined) ||
    getProviderDefaults(activeProvider).model;
  const hasOpenAIKey = Boolean(
    cookieStore.get(openAIKeyCookieName)?.value || (activeProvider === "openai" && process.env.OPENAI_API_KEY)
  );

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link className="brand" href="/opportunities">
              <strong>Job OS</strong>
              <span>个人求职机会管理</span>
            </Link>
            <NavLinks />
            <details className="user-settings">
              <summary aria-label="打开用户设置">
                <span className="avatar">N</span>
                <span>
                  <strong>Nico</strong>
                  <small>{hasOpenAIKey ? "AI 已配置" : "配置 AI"}</small>
                </span>
              </summary>
              <form action={saveAIConfig} className="ai-config-popover">
                <h2>AI 能力配置</h2>
                <p>选择服务商并保存 API Key 后，策略生成、候选企业生成、招聘页检查和岗位解读会默认使用它。</p>
                <label>
                  <span>AI 服务商</span>
                  <select name="aiProvider" defaultValue={activeProvider}>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                    <option value="deepseek">DeepSeek</option>
                  </select>
                </label>
                <label>
                  <span>API Key</span>
                  <input name="openaiApiKey" type="password" placeholder={hasOpenAIKey ? "已配置，输入新 key 可替换" : "sk- / sk-ant- / deepseek key"} autoComplete="off" />
                </label>
                <label>
                  <span>模型</span>
                  <input name="aiModel" defaultValue={activeModel} placeholder="默认模型，可按服务商修改" autoComplete="off" />
                </label>
                <div className="ai-config-actions">
                  <button className="button" type="submit">
                    保存配置
                  </button>
                  <button className="button secondary" type="submit" name="intent" value="clear">
                    清除
                  </button>
                </div>
              </form>
            </details>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
