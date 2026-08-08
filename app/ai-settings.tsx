"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateAISettings, type AISettingsState } from "@/app/ai-settings-actions";
import { getProviderDefaults, providerModels, type AIProvider } from "@/src/lib/ai-provider-options";

const providerLabels: Record<AIProvider, string> = {
  openai: "OpenAI",
  claude: "Claude",
  deepseek: "DeepSeek"
};

const initialState: AISettingsState = { status: "idle", message: "" };

type AISettingsProps = {
  hasKey: boolean;
  initialModel: string;
  initialProvider: AIProvider;
  verifiedAt: string | null;
};

export function AISettings({ hasKey, initialModel, initialProvider, verifiedAt }: AISettingsProps) {
  const router = useRouter();
  const [provider, setProvider] = useState<AIProvider>(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [state, formAction, pending] = useActionState(updateAISettings, initialState);

  useEffect(() => {
    if (state.status === "success" || state.status === "cleared") {
      router.refresh();
    }
  }, [router, state]);

  useEffect(() => {
    setProvider(initialProvider);
    setModel(initialModel);
  }, [initialModel, initialProvider]);

  const summaryStatus = verifiedAt
    ? `${providerLabels[initialProvider]} · 已连接`
    : hasKey
      ? "AI 待验证"
      : "配置 AI";

  function changeProvider(value: string) {
    const nextProvider = value as AIProvider;
    setProvider(nextProvider);
    setModel(getProviderDefaults(nextProvider).model);
  }

  return (
    <details className="user-settings">
      <summary aria-label="打开用户设置">
        <span className="avatar">N</span>
        <span>
          <strong>Nico</strong>
          <small>{summaryStatus}</small>
        </span>
      </summary>
      <form action={formAction} className="ai-config-popover">
        <div className="ai-config-heading">
          <h2>AI 能力配置</h2>
          {verifiedAt ? <span className="ai-connection-badge">连接正常</span> : null}
        </div>
        <p>保存前会实际测试连接。配置用于策略生成、企业生成、招聘页检查和岗位解读。</p>
        <label>
          <span>AI 服务商</span>
          <select name="aiProvider" value={provider} onChange={(event) => changeProvider(event.target.value)}>
            {Object.entries(providerLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>API Key</span>
          <input
            key={provider}
            name="aiApiKey"
            type="password"
            placeholder={hasKey && provider === initialProvider ? "已保存，留空可继续使用" : "输入该服务商的 API Key"}
            autoComplete="off"
          />
        </label>
        <label>
          <span>模型</span>
          <select name="aiModel" value={model} onChange={(event) => setModel(event.target.value)}>
            {providerModels[provider].map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {verifiedAt ? (
          <p className="ai-verified-meta">
            当前：{providerLabels[initialProvider]} · {initialModel}<br />
            上次验证：{verifiedAt}
          </p>
        ) : null}
        {state.message ? (
          <p className={`ai-config-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
            {state.message}
          </p>
        ) : null}
        <div className="ai-config-actions">
          <button className="button" type="submit" name="intent" value="save" disabled={pending}>
            {pending ? "正在测试…" : "测试连接并保存"}
          </button>
          <button className="button secondary" type="submit" name="intent" value="clear" disabled={pending}>
            清除
          </button>
        </div>
      </form>
    </details>
  );
}
