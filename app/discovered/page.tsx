import { revalidatePath } from "next/cache";
import { getDisplayOpportunityTitle, getSourceDisplayLabel } from "@/src/domain/display-labels";
import { opportunityStatuses } from "@/src/domain/domain-values";
import { prisma } from "@/src/lib/prisma";
import { analysisService } from "@/src/services/analysis-service";
import { opportunityService } from "@/src/services/opportunity-service";

export const dynamic = "force-dynamic";

function getListPreview(rawText: string) {
  const withoutStructuredHeader = rawText
    .replace(/(?:^|\s)(公司|地点|工作地点|岗位来源|发布时间|抽取模型|招聘类型|JD 原文)[：:]\s*[^：:]+?(?=\s+(?:公司|地点|工作地点|岗位来源|发布时间|抽取模型|招聘类型|JD 原文|工作职责|职位描述|岗位职责|岗位要求|任职要求|加分项)[：:]|$)/g, " ")
    .replace(/^[\s\S]*?(?=(?:工作职责|职位描述|岗位职责|职位要求|岗位要求|任职要求|加分项)[：:])/, "")
    .replace(/20\d{2}\s*(秋招|春招|校招|社招|实习|提前批|补录)|\b(秋招|春招|校招|社招|实习|提前批|补录)\b/g, "")
    .replace(/\s+/g, "\n");

  return withoutStructuredHeader
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(公司|地点|工作地点|岗位来源|发布时间|抽取模型|招聘类型|JD 原文)[：:]/.test(line))
    .filter((line) => !/20\d{2}\s*(秋招|春招|校招|社招|实习|提前批|补录)|\b(秋招|春招|校招|社招|实习|提前批|补录)\b/.test(line))
    .join(" ")
    .slice(0, 140);
}

function getStructuredField(rawText: string, names: string[]) {
  const compactText = rawText.replace(/\s+/g, " ").trim();
  const fieldNames = [
    "公司",
    "地点",
    "工作地点",
    "岗位来源",
    "发布时间",
    "抽取模型",
    "招聘类型",
    "JD 原文",
    "工作职责",
    "职位描述",
    "岗位职责",
    "职位要求",
    "岗位要求",
    "任职要求",
    "加分项"
  ];

  for (const name of names) {
    const lookahead = fieldNames.filter((item) => item !== name).join("|");
    const compactMatch = compactText.match(new RegExp(`${name}[：:]\\s*(.+?)(?=\\s+(?:${lookahead})[：:]|$)`));
    if (compactMatch?.[1]) {
      return compactMatch[1].trim();
    }
  }

  const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const name of names) {
    for (const line of lines) {
      const match = line.match(new RegExp(`^${name}[：:]\\s*(.+)$`));
      if (match?.[1]) return match[1].trim();
    }
  }
  return undefined;
}

function getLocationItems(location: string) {
  const items = location
    .split(/[,，、/；;｜|]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : [location || "-"];
}

function formatDate(value?: Date | string | null) {
  if (!value) {
    return "-";
  }

  if (value instanceof Date) {
    return dateParts(value);
  }

  const trimmed = value.trim();
  const standardMatch = trimmed.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (standardMatch) {
    return [standardMatch[1], standardMatch[2].padStart(2, "0"), standardMatch[3].padStart(2, "0")].join("-");
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : dateParts(parsed);
}

function dateParts(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function confirmOpportunity(formData: FormData) {
  "use server";

  const opportunityId = String(formData.get("opportunityId") || "");

  if (!opportunityId) {
    return;
  }

  await analysisService.analyze(opportunityId);
  revalidatePath("/discovered");
  revalidatePath("/opportunities");
}

async function confirmAllOpportunities() {
  "use server";

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    return;
  }

  const opportunities = await prisma.opportunity.findMany({
    where: {
      userId: user.id,
      status: opportunityStatuses.DISCOVERED
    },
    select: { id: true }
  });

  for (const opportunity of opportunities) {
    await analysisService.analyze(opportunity.id);
  }

  revalidatePath("/discovered");
  revalidatePath("/opportunities");
}

async function ignoreOpportunity(formData: FormData) {
  "use server";

  const opportunityId = String(formData.get("opportunityId") || "");

  if (!opportunityId) {
    return;
  }

  await opportunityService.changeStatus(opportunityId, opportunityStatuses.CLOSED);
  revalidatePath("/discovered");
  revalidatePath("/opportunities");
}

async function getDiscoveredData() {
  if (!process.env.DATABASE_URL) {
    return { opportunities: [], monitoringCompanyCount: 0 };
  }

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    return { opportunities: [], monitoringCompanyCount: 0 };
  }

  const [opportunities, monitoringCompanyCount] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        userId: user.id,
        status: opportunityStatuses.DISCOVERED
      },
      include: {
        company: true,
        opportunitySourceJobs: {
          include: {
            sourceJob: {
              include: {
                source: true
              }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { firstDiscoveredAt: "desc" }
    }),
    prisma.company.count({
      where: {
        userId: user.id,
        status: "MONITORING"
      }
    })
  ]);

  return { opportunities, monitoringCompanyCount };
}

export default async function DiscoveredPage() {
  const { opportunities, monitoringCompanyCount } = await getDiscoveredData();

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>待确认岗位池</h1>
        </div>
        <div className="toolbar">
          <form action={confirmAllOpportunities}>
            <button className="button" type="submit" disabled={opportunities.length === 0}>
              全部加入看板
            </button>
          </form>
        </div>
      </header>

      <div className="monitor-summary">
        <div>
          <span>待确认岗位池</span>
          <strong>{opportunities.length}</strong>
        </div>
        <div>
          <span>追踪企业</span>
          <strong>{monitoringCompanyCount}</strong>
        </div>
      </div>

      <div className="panel">
        {opportunities.length === 0 ? (
          <div className="empty">
            {monitoringCompanyCount === 0 ? "先在企业招聘追踪页确认至少一家企业，并配置招聘入口。" : "暂时没有待确认岗位。可以到企业招聘追踪页检查招聘动态。"}
          </div>
        ) : (
          <table className="table discovered-table">
            <thead>
              <tr>
                <th>岗位</th>
                <th>公司</th>
                <th>城市</th>
                <th>来源</th>
                <th>职位发布时间</th>
                <th>JD 摘要</th>
                <th>发现时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opportunity) => {
                const sourceJob = opportunity.opportunitySourceJobs[0]?.sourceJob;
                const rawText = sourceJob?.rawText ?? "";
                const preview = getListPreview(rawText);
                const companyName = getStructuredField(rawText, ["公司"]) ?? opportunity.company?.name ?? "未确认";
                const location = getStructuredField(rawText, ["工作地点", "地点"]) ?? opportunity.location ?? "-";
                const publishedText = getStructuredField(rawText, ["发布时间"]);
                const publishedAt = formatDate(publishedText ?? sourceJob?.publishedAt ?? sourceJob?.sourceUpdatedAt);

                return (
                  <tr key={opportunity.id}>
                    <td>
                      <strong>{getDisplayOpportunityTitle(opportunity.title)}</strong>
                    </td>
                    <td className="company-cell">{companyName}</td>
                    <td className="city-cell">
                      {getLocationItems(location).map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </td>
                    <td className="source-cell">{getSourceDisplayLabel(sourceJob?.source.type, sourceJob?.source.name)}</td>
                    <td className="date-cell">{publishedAt}</td>
                    <td className="jd-preview">
                      <span className="jd-preview-text">{preview ? `${preview}${rawText.length > preview.length ? "..." : ""}` : "-"}</span>
                    </td>
                    <td className="date-cell">{formatDate(opportunity.firstDiscoveredAt)}</td>
                    <td>
                      <div className="row-actions">
                        {sourceJob?.url ? (
                          <a className="button secondary" href={sourceJob.url} rel="noreferrer" target="_blank">
                            岗位链接
                          </a>
                        ) : null}
                        <form action={confirmOpportunity}>
                          <input name="opportunityId" type="hidden" value={opportunity.id} />
                          <button className="button secondary" type="submit">
                            加入看板
                          </button>
                        </form>
                        <form action={ignoreOpportunity}>
                          <input name="opportunityId" type="hidden" value={opportunity.id} />
                          <button className="button secondary" type="submit">
                            忽略
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
