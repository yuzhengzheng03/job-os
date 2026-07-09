import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { generateMonitorStrategyDraft } from "@/src/services/monitor-strategy-ai";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type StrategyMeta = {
  strategyMode?: string;
  background?: string[];
  roles?: string[];
  excludeKeywords?: string[];
  generatedBy?: string;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function getStrategyMeta(value: unknown): StrategyMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const data = value as Record<string, unknown>;
  return {
    strategyMode: typeof data.strategyMode === "string" ? data.strategyMode : undefined,
    background: asStringArray(data.background),
    roles: asStringArray(data.roles),
    excludeKeywords: asStringArray(data.excludeKeywords),
    generatedBy: typeof data.generatedBy === "string" ? data.generatedBy : undefined
  };
}

function getStrategyModeLabel(value?: string) {
  if (value === "DOMAIN_FIRST") {
    return "领域优先";
  }

  if (value === "COMPANY_FIRST") {
    return "公司优先";
  }

  return "岗位优先";
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function createMonitorStrategy(formData: FormData) {
  "use server";

  const description = String(formData.get("description") || "").trim();

  if (!description || !process.env.DATABASE_URL) {
    return;
  }

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    return;
  }

  const { draft, model, rawOutput } = await generateMonitorStrategyDraft(description);

  await prisma.searchProfile.create({
    data: {
      userId: user.id,
      name: draft.name,
      keywords: draft.keywords,
      locations: draft.locations,
      industries: draft.industries,
      educationRequirements: draft.educationRequirements,
      recruitmentTypes: draft.recruitmentTypes,
      sourceScope: {
        strategyMode: draft.strategyMode,
        background: draft.background,
        roles: draft.roles,
        excludeKeywords: draft.excludeKeywords,
        generatedBy: model,
        originalDescription: description,
        rawOutput: toInputJson(rawOutput)
      },
      enabled: true
    }
  });

  revalidatePath("/search-profiles");
}

export default async function SearchProfilesPage() {
  if (!process.env.DATABASE_URL) {
    return (
      <>
        <header className="page-header">
          <div className="page-title">
            <h1>划定求职范围</h1>
            <p>用自然语言告诉 Job OS 你要找什么，AI 会整理成可持续追踪的求职范围。</p>
          </div>
        </header>
        <div className="panel">
          <div className="empty">配置数据库后即可创建求职范围。</div>
        </div>
      </>
    );
  }

  const profiles = await prisma.searchProfile.findMany({ orderBy: { updatedAt: "desc" } }).catch(() => []);

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>划定求职范围</h1>
        </div>
      </header>

      <form action={createMonitorStrategy} className="strategy-composer">
        <label htmlFor="description">求职方向描述</label>
        <textarea
          id="description"
          name="description"
          placeholder="例如：我是生物医学工程硕士，想看上海、北京、苏州的医疗器械产品经理、临床应用和质量法规岗位，优先校招/提前批。"
          rows={5}
          required
        />
        <div className="composer-footer">
          <span>AI 会提取岗位方向、城市、行业、学历、招聘类型和搜索关键词。</span>
          <button className="button" type="submit">
            用 AI 生成策略
          </button>
        </div>
      </form>

      {profiles.length === 0 ? (
        <div className="panel">
          <div className="empty">还没有求职范围。先用上面的描述生成一个范围。</div>
        </div>
      ) : (
        <div className="strategy-grid">
          {profiles.map((profile) => {
            const meta = getStrategyMeta(profile.sourceScope);
            const roles = meta.roles?.length ? meta.roles : asStringArray(profile.keywords);
            const locations = asStringArray(profile.locations);
            const industries = asStringArray(profile.industries);
            const educationRequirements = asStringArray(profile.educationRequirements);
            const recruitmentTypes = asStringArray(profile.recruitmentTypes);
            const keywords = asStringArray(profile.keywords);

            return (
              <article className="strategy-card" key={profile.id}>
                <div className="strategy-card-head">
                  <div>
                    <h2>{profile.name}</h2>
                    <p>{getStrategyModeLabel(meta.strategyMode)} · {profile.enabled ? "正在监控" : "已暂停"}</p>
                  </div>
                  <span className="status">{profile.enabled ? "启用" : "暂停"}</span>
                </div>

                <div className="strategy-fields">
                  <div>
                    <span>岗位方向</span>
                    <strong>{roles.length ? roles.join("、") : "待补充"}</strong>
                  </div>
                  <div>
                    <span>城市地点</span>
                    <strong>{locations.length ? locations.join("、") : "不限"}</strong>
                  </div>
                  <div>
                    <span>行业领域</span>
                    <strong>{industries.length ? industries.join("、") : "不限"}</strong>
                  </div>
                  <div>
                    <span>学历/招聘类型</span>
                    <strong>
                      {[...educationRequirements, ...recruitmentTypes].length ? [...educationRequirements, ...recruitmentTypes].join("、") : "不限"}
                    </strong>
                  </div>
                </div>

                <div className="chips" aria-label="搜索关键词">
                  {keywords.length ? keywords.map((keyword) => <span key={keyword}>{keyword}</span>) : <span>暂无关键词</span>}
                </div>

                {meta.background?.length ? <p className="strategy-note">背景：{meta.background.join("、")}</p> : null}
                {meta.excludeKeywords?.length ? <p className="strategy-note">排除：{meta.excludeKeywords.join("、")}</p> : null}
                {meta.generatedBy ? <p className="strategy-note muted">生成模型：{meta.generatedBy}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
