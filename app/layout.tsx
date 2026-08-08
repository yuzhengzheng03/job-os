import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AISettings } from "@/app/ai-settings";
import { NavLinks } from "@/app/nav-links";
import {
  aiModelCookieName,
  aiProviderCookieName,
  aiVerifiedCookieName,
  getProviderDefaults,
  isAIProvider,
  normalizeAIModel,
  openAIKeyCookieName,
  parseAIVerification
} from "@/src/lib/ai-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job OS",
  description: "个人求职机会管理工作台"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const cookieProvider = cookieStore.get(aiProviderCookieName)?.value ?? "";
  const activeProvider = isAIProvider(cookieProvider) ? cookieProvider : "openai";
  const activeModel = normalizeAIModel(
    activeProvider,
    cookieStore.get(aiModelCookieName)?.value ||
      (activeProvider === "openai" ? process.env.OPENAI_MODEL : undefined) ||
      getProviderDefaults(activeProvider).model
  );
  const hasOpenAIKey = Boolean(
    cookieStore.get(openAIKeyCookieName)?.value || (activeProvider === "openai" && process.env.OPENAI_API_KEY)
  );
  const verification = parseAIVerification(cookieStore.get(aiVerifiedCookieName)?.value);
  const verifiedAt = verification?.provider === activeProvider && verification.model === activeModel
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(verification.verifiedAt))
    : null;

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
            <AISettings
              hasKey={hasOpenAIKey}
              initialModel={activeModel}
              initialProvider={activeProvider}
              verifiedAt={verifiedAt}
            />
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
