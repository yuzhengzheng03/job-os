import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { generateMonitorStrategyDraft } from "@/src/services/monitor-strategy-ai";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type SearchProfilesPageProps = {
  searchParams: Promise<{
    saved?: string;
    generation?: string;
    model?: string;
  }>;
};

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

function splitList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/[,，、/；;｜|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitEducationAndRecruitment(value: FormDataEntryValue | null) {
  const values = splitList(value);
  const recruitmentTypes = values.filter((item) => /校招|社招|实习|秋招|春招|提前批|全职/.test(item));
  const educationRequirements = values.filter((item) => !recruitmentTypes.includes(item));

  return { educationRequirements, recruitmentTypes };
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

  const { draft, model, rawOutput, status } = await generateMonitorStrategyDraft(description);

  if (status === "NOT_CONFIGURED") {
    redirect("/search-profiles?generation=not-configured");
  }

  if (status === "FAILED") {
    redirect("/search-profiles?generation=failed");
  }

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
  redirect(`/search-profiles?generation=success&model=${encodeURIComponent(model)}`);
}

async function updateMonitorStrategy(formData: FormData) {
  "use server";

  const profileId = String(formData.get("profileId") || "").trim();
  const name = String(formData.get("name") || "").trim();

  if (!profileId || !name || !process.env.DATABASE_URL) {
    return;
  }

  const current = await prisma.searchProfile.findUnique({ where: { id: profileId } });
  if (!current) {
    return;
  }

  const meta = getStrategyMeta(current.sourceScope);
  const roles = splitList(formData.get("roles"));
  const locations = splitList(formData.get("locations"));
  const industries = splitList(formData.get("industries"));
  const keywords = splitList(formData.get("keywords"));
  const background = splitList(formData.get("background"));
  const { educationRequirements, recruitmentTypes } = splitEducationAndRecruitment(formData.get("educationAndRecruitment"));

  await prisma.searchProfile.update({
    where: { id: profileId },
    data: {
      name,
      keywords,
      locations,
      industries,
      educationRequirements,
      recruitmentTypes,
      sourceScope: {
        ...meta,
        roles,
        background
      }
    }
  });

  revalidatePath("/search-profiles");
  revalidatePath("/companies");
  redirect("/search-profiles?saved=1");
}

async function removeMonitorStrategy(formData: FormData) {
  "use server";

  const profileId = String(formData.get("profileId") || "").trim();

  if (!profileId || !process.env.DATABASE_URL) {
    return;
  }

  await prisma.searchProfile.delete({ where: { id: profileId } }).catch(() => undefined);
  revalidatePath("/search-profiles");
  revalidatePath("/companies");
}

export default async function SearchProfilesPage({ searchParams }: SearchProfilesPageProps) {
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
  const { saved, generation, model } = await searchParams;

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>划定求职范围</h1>
        </div>
      </header>

      {saved === "1" ? <div className="status-banner success">求职范围已保存。</div> : null}
      {generation === "not-configured" ? (
        <div className="status-banner">尚未配置 AI。请先在左下角保存 API Key，再生成求职策略。</div>
      ) : null}
      {generation === "failed" ? (
        <div className="status-banner">AI 求职策略生成失败，本次没有创建本地规则冒充 AI 结果。</div>
      ) : null}
      {generation === "success" ? (
        <div className="status-banner success">已使用 {model || "AI"} 生成求职策略。</div>
      ) : null}

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
              <form action={updateMonitorStrategy} className="strategy-card strategy-edit-card" key={profile.id}>
                <input name="profileId" type="hidden" value={profile.id} />
                <div className="strategy-card-head">
                  <div>
                    <label className="strategy-title-field">
                      <span>求职范围名称</span>
                      <input name="name" defaultValue={profile.name} />
                    </label>
                    <p>{getStrategyModeLabel(meta.strategyMode)} · 正在监控</p>
                  </div>
                  <div className="strategy-actions">
                    <button className="button secondary" type="submit">
                      保存修改
                    </button>
                    <button className="button ghost-danger" formAction={removeMonitorStrategy} type="submit">
                      移除
                    </button>
                  </div>
                </div>

                <div className="strategy-fields">
                  <label>
                    <span>岗位方向</span>
                    <input name="roles" defaultValue={roles.join("、")} placeholder="例如：产品经理、临床应用" />
                  </label>
                  <label>
                    <span>城市地点</span>
                    <input name="locations" defaultValue={locations.join("、")} placeholder="例如：上海、北京" />
                  </label>
                  <label>
                    <span>行业领域</span>
                    <input name="industries" defaultValue={industries.join("、")} placeholder="例如：医疗器械、生物医学" />
                  </label>
                  <label>
                    <span>学历/招聘类型</span>
                    <input
                      name="educationAndRecruitment"
                      defaultValue={[...educationRequirements, ...recruitmentTypes].join("、")}
                      placeholder="例如：硕士、校招、提前批"
                    />
                  </label>
                </div>

                <label className="strategy-wide-field">
                  <span>搜索关键词</span>
                  <input name="keywords" defaultValue={keywords.join("、")} placeholder="例如：产品经理、医疗 AI、Agent" />
                </label>

                <label className="strategy-wide-field">
                  <span>背景/补充条件</span>
                  <input name="background" defaultValue={meta.background?.join("、") ?? ""} placeholder="例如：生物医学工程、科研经历" />
                </label>

                {meta.excludeKeywords?.length ? <p className="strategy-note">排除：{meta.excludeKeywords.join("、")}</p> : null}
                {meta.generatedBy ? <p className="strategy-note muted">生成模型：{meta.generatedBy}</p> : null}
              </form>
            );
          })}
        </div>
      )}
    </>
  );
}
