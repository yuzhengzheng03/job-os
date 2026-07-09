import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { companyStatuses } from "@/src/domain/domain-values";
import { getCompanyStatusLabel } from "@/src/domain/display-labels";
import { normalizeCompanyName } from "@/src/domain/normalize";
import { prisma } from "@/src/lib/prisma";
import { PrioritySelectForm } from "@/app/companies/priority-select-form";
import { TagsInputForm } from "@/app/companies/tags-input-form";
import { generateCompanyMonitorCandidates, type CompanyMonitorCandidate } from "@/src/services/company-monitoring-ai";
import { monitorDiscoveryService } from "@/src/services/monitor-discovery-service";
import { parseCompanyCandidatesFromXlsx } from "@/src/services/xlsx-company-import";

export const dynamic = "force-dynamic";

type CompaniesPageProps = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    priority?: string;
  }>;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function parseBulkCompanies(value: string): CompanyMonitorCandidate[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", careerUrl = "", tagText = "", priorityText = "1"] = line.split("|").map((item) => item.trim());
      const tags = tagText ? tagText.split(/[,，、]/).map((item) => item.trim()).filter(Boolean) : [];

      return {
        name,
        careerUrl,
        tags,
        priority: Number.isFinite(Number(priorityText)) ? Math.max(0, Math.min(3, Number(priorityText))) : 1,
        reason: "通过文本录入添加的候选企业。"
      };
    })
    .filter((item) => item.name && item.careerUrl && item.tags.length > 0);
}

async function upsertCandidateCompany(
  userId: string,
  candidate: CompanyMonitorCandidate,
  meta: Record<string, unknown>
) {
  const normalizedName = normalizeCompanyName(candidate.name);

  await prisma.company.upsert({
    where: {
      userId_normalizedName: {
        userId,
        normalizedName
      }
    },
    update: {
      websiteUrl: candidate.websiteUrl,
      careerUrl: candidate.careerUrl,
      tags: candidate.tags,
      priority: candidate.priority,
      monitorConfig: toInputJson(meta)
    },
    create: {
      userId,
      name: candidate.name,
      normalizedName,
      websiteUrl: candidate.websiteUrl,
      careerUrl: candidate.careerUrl,
      tags: candidate.tags,
      priority: candidate.priority,
      status: companyStatuses.CANDIDATE,
      monitorConfig: toInputJson(meta)
    }
  });
}

async function generateCandidatesFromStrategy(formData: FormData) {
  "use server";

  const strategyId = String(formData.get("strategyId") || "");

  if (!strategyId || !process.env.DATABASE_URL) {
    return;
  }

  const strategy = await prisma.searchProfile.findUnique({ where: { id: strategyId } });

  if (!strategy) {
    return;
  }

  const { candidates, model, rawOutput } = await generateCompanyMonitorCandidates(strategy);

  await Promise.all(
    candidates.map((candidate) =>
      upsertCandidateCompany(strategy.userId, candidate, {
        generatedBy: model,
        strategyId: strategy.id,
        strategyName: strategy.name,
        reason: candidate.reason,
        rawOutput
      })
    )
  );

  revalidatePath("/companies");
}

async function importCandidateCompanies(formData: FormData) {
  "use server";

  const rawCompanies = String(formData.get("companies") || "").trim();

  if (!rawCompanies || !process.env.DATABASE_URL) {
    return;
  }

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    return;
  }

  const candidates = parseBulkCompanies(rawCompanies);

  await Promise.all(
    candidates.map((candidate) =>
      upsertCandidateCompany(user.id, candidate, {
        source: "manual-bulk-import",
        reason: candidate.reason
      })
    )
  );

  revalidatePath("/companies");
}

async function importCompaniesFromExcel(formData: FormData) {
  "use server";

  const file = formData.get("companyWorkbook");

  if (!(file instanceof File) || file.size === 0 || !process.env.DATABASE_URL) {
    return;
  }

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    return;
  }

  const candidates = parseCompanyCandidatesFromXlsx(await file.arrayBuffer());

  await Promise.all(
    candidates.map((candidate) =>
      upsertCandidateCompany(user.id, candidate, {
        source: "excel-company-list",
        filename: file.name,
        reason: candidate.reason
      })
    )
  );

  revalidatePath("/companies");
}

async function updateCompanyStatus(formData: FormData) {
  "use server";

  const companyId = String(formData.get("companyId") || "");
  const status = String(formData.get("status") || "");

  if (!companyId || !Object.values(companyStatuses).includes(status as never)) {
    return;
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { status }
  });

  revalidatePath("/companies");
}

async function updateCompanyRecruitingUrl(formData: FormData) {
  "use server";

  const companyId = String(formData.get("companyId") || "");
  const careerUrl = String(formData.get("careerUrl") || "").trim();

  if (!companyId) {
    return;
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      careerUrl: careerUrl || null
    }
  });

  revalidatePath("/companies");
}

async function syncMonitorJobs() {
  "use server";

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    return;
  }

  const results = await monitorDiscoveryService.syncRealCareerPages(user.id);

  if (results.length === 0) {
    await monitorDiscoveryService.syncDemoJobs(user.id);
  }

  revalidatePath("/companies");
  revalidatePath("/discovered");
  revalidatePath("/opportunities");
}

function getMonitorReason(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "-";
  }

  const data = value as Record<string, unknown>;
  return typeof data.reason === "string" ? data.reason : "-";
}

function getMonitorConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getRecruitingEntryStatus(company: { careerUrl: string | null; websiteUrl: string | null; monitorConfig: Prisma.JsonValue }) {
  if (!company.careerUrl && !company.websiteUrl) {
    return "未配置";
  }

  const config = getMonitorConfig(company.monitorConfig);
  if (config.recruitingEntryStatus === "ACCESSIBLE") {
    return "正常访问";
  }

  if (config.recruitingEntryStatus === "FAILED") {
    return "无法访问";
  }

  return "未配置";
}

function getLastCheckedAt(value: unknown) {
  const config = getMonitorConfig(value);
  return typeof config.lastCheckedAt === "string" ? new Date(config.lastCheckedAt).toLocaleString() : "-";
}

function isCompanyStatus(value?: string) {
  return Boolean(value && Object.values(companyStatuses).includes(value as never));
}

function buildCompanyWhere(filters: { status?: string; q?: string; priority?: number }): Prisma.CompanyWhereInput {
  const where: Prisma.CompanyWhereInput = {};

  if (isCompanyStatus(filters.status)) {
    where.status = filters.status;
  }

  if (filters.q) {
    where.name = {
      contains: filters.q
    };
  }

  if (typeof filters.priority === "number") {
    where.priority = filters.priority;
  }

  return where;
}

export default async function CompaniesPage({ searchParams }: CompaniesPageProps) {
  if (!process.env.DATABASE_URL) {
    return (
      <>
        <header className="page-header">
          <div className="page-title">
            <h1>企业招聘追踪</h1>
            <p>维护需要长期追踪的企业、招聘入口和优先级。</p>
          </div>
        </header>
        <div className="panel">
          <div className="empty">配置数据库后即可管理企业招聘追踪。</div>
        </div>
      </>
    );
  }

  const { status, q, priority } = await searchParams;
  const activeStatus = isCompanyStatus(status) ? status : undefined;
  const activeQuery = String(q ?? "").trim();
  const activePriority = priority && !Number.isNaN(Number(priority)) ? Number(priority) : undefined;
  const companyWhere = buildCompanyWhere({
    status: activeStatus,
    q: activeQuery,
    priority: activePriority
  });

  const [companies, allCompanies, strategies] = await Promise.all([
    prisma.company.findMany({
      where: Object.keys(companyWhere).length > 0 ? companyWhere : undefined,
      orderBy: [{ status: "asc" }, { priority: "desc" }, { updatedAt: "desc" }]
    }).catch(() => []),
    prisma.company.findMany({ select: { status: true, priority: true } }).catch(() => []),
    prisma.searchProfile.findMany({ where: { enabled: true }, orderBy: { updatedAt: "desc" } }).catch(() => [])
  ]);

  const candidateCount = allCompanies.filter((company) => company.status === companyStatuses.CANDIDATE).length;
  const monitoringCount = allCompanies.filter((company) => company.status === companyStatuses.MONITORING).length;
  const priorityOptions = Array.from(new Set(allCompanies.map((company) => company.priority))).sort((a, b) => b - a);
  const hasCompanyFilters = Boolean(activeStatus || activeQuery || typeof activePriority === "number");

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>企业招聘追踪</h1>
        </div>
        <div className="toolbar">
          <form action={syncMonitorJobs}>
            <button className="button" type="submit" disabled={monitoringCount === 0}>
              AI 检查招聘页
            </button>
          </form>
        </div>
      </header>

      <div className="monitor-summary">
        <div>
          <span>候选企业</span>
          <strong>{candidateCount}</strong>
        </div>
        <div>
          <span>追踪中</span>
          <strong>{monitoringCount}</strong>
        </div>
        <div>
          <span>求职范围</span>
          <strong>{strategies.length}</strong>
        </div>
      </div>

      <div className="config-grid company-config-grid">
        <details className="config-panel add-company-panel unified-add-company-panel">
          <summary className="panel-head">
            <div>
              <h2>添加候选公司</h2>
            </div>
            <span className="summary-indicator">展开</span>
          </summary>
          <div className="drawer-content segmented-workspace">
            <input className="segment-radio" defaultChecked id="add-company-ai" name="add-company-mode" type="radio" />
            <input className="segment-radio" id="add-company-sheet" name="add-company-mode" type="radio" />
            <input className="segment-radio" id="add-company-text" name="add-company-mode" type="radio" />

            <div className="segmented-control" aria-label="添加候选公司方式">
              <label htmlFor="add-company-ai">AI 生成</label>
              <label htmlFor="add-company-sheet">表格导入</label>
              <label htmlFor="add-company-text">文本录入</label>
            </div>

            <form action={generateCandidatesFromStrategy} className="import-method segment-panel segment-panel-ai">
              <h3>按求职范围生成候选企业</h3>
              <div className="segment-form-grid">
                <label>
                  <span>选择求职范围</span>
                  <select name="strategyId" required>
                    <option value="">选择一个求职范围</option>
                    {strategies.map((strategy) => (
                      <option key={strategy.id} value={strategy.id}>
                        {strategy.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="method-note">AI 会根据岗位方向、城市、行业和关键词建议值得追踪的企业，生成后进入候选区。</div>
              </div>
              <button className="button full-action" type="submit" disabled={strategies.length === 0}>
                AI 生成候选
              </button>
            </form>

            <form action={importCompaniesFromExcel} className="import-method segment-panel segment-panel-sheet">
              <h3>上传企业清单</h3>
              <div className="segment-form-grid">
                <label>
                  <span>上传 .xlsx 文件</span>
                  <input name="companyWorkbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
                </label>
                <div className="method-note">必填列：公司、招聘入口、标签；可选列：城市、方向、关键词、优先级、备注。</div>
              </div>
              <button className="button secondary" type="submit">
                导入企业清单
              </button>
            </form>

            <form action={importCandidateCompanies} className="import-method segment-panel segment-panel-text">
              <h3>批量文本录入</h3>
              <label>
                <span>每行一个企业：公司 | 招聘入口 | 标签 | 优先级</span>
                <textarea
                  name="companies"
                  placeholder="迈瑞医疗 | https://www.mindray.com/cn/about-us/careers | 医疗器械,产品 | 3"
                  rows={4}
                  required
                />
              </label>
              <button className="button secondary" type="submit">
                添加到候选区
              </button>
            </form>
          </div>
        </details>
      </div>

      <div className="panel">
        <form action="/companies" className="filter-form">
          <label>
            <span>公司名称</span>
            <input name="q" placeholder="搜索公司" defaultValue={activeQuery} />
          </label>
          <label>
            <span>状态</span>
            <select name="status" defaultValue={activeStatus ?? ""}>
              <option value="">全部状态</option>
              {Object.values(companyStatuses).map((item) => (
                <option key={item} value={item}>
                  {getCompanyStatusLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>优先级</span>
            <select name="priority" defaultValue={typeof activePriority === "number" ? String(activePriority) : ""}>
              <option value="">全部</option>
              {priorityOptions.map((item) => (
                <option key={item} value={item}>
                  P{item}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button className="button secondary" type="submit">
              应用筛选
            </button>
            {hasCompanyFilters ? (
              <a className="button secondary" href="/companies">
                清除
              </a>
            ) : null}
          </div>
        </form>

        {companies.length === 0 ? (
          <div className="empty">还没有监控公司。先从策略生成候选，或批量导入公司。</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>公司</th>
                <th>状态</th>
                <th>优先级</th>
                <th>入口状态</th>
                <th>最近检查时间</th>
                <th>招聘入口</th>
                <th>标签</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="monitor-company-name">
                    <strong>{company.name}</strong>
                  </td>
                  <td>
                    <span className="status">{getCompanyStatusLabel(company.status)}</span>
                  </td>
                  <td>
                    <PrioritySelectForm companyId={company.id} priority={company.priority} />
                  </td>
                  <td>{getRecruitingEntryStatus(company)}</td>
                  <td>{getLastCheckedAt(company.monitorConfig)}</td>
                  <td>
                    <form action={updateCompanyRecruitingUrl} className="inline-url-form">
                      <input name="companyId" type="hidden" value={company.id} />
                      <input name="careerUrl" placeholder="https://..." type="url" defaultValue={company.careerUrl ?? company.websiteUrl ?? ""} />
                      <button className="button secondary" type="submit">
                        保存
                      </button>
                    </form>
                  </td>
                  <td>
                    <TagsInputForm companyId={company.id} tags={asStringArray(company.tags)} />
                  </td>
                  <td>
                    {company.status === companyStatuses.CANDIDATE ? (
                      <form action={updateCompanyStatus}>
                        <input name="companyId" type="hidden" value={company.id} />
                        <input name="status" type="hidden" value={companyStatuses.MONITORING} />
                        <button className="button secondary" type="submit">
                          加入追踪
                        </button>
                      </form>
                    ) : company.status === companyStatuses.MONITORING ? (
                      <form action={updateCompanyStatus}>
                        <input name="companyId" type="hidden" value={company.id} />
                        <input name="status" type="hidden" value={companyStatuses.PAUSED} />
                        <button className="button secondary" type="submit">
                          移出追踪
                        </button>
                      </form>
                    ) : (
                      <form action={updateCompanyStatus}>
                        <input name="companyId" type="hidden" value={company.id} />
                        <input name="status" type="hidden" value={companyStatuses.MONITORING} />
                        <button className="button secondary" type="submit">
                          加入追踪
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
