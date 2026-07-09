import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getDisplayOpportunityTitle, getOpportunityStatusLabel, getSourceDisplayLabel } from "@/src/domain/display-labels";
import { opportunityStatuses, type OpportunityStatusValue } from "@/src/domain/domain-values";
import { prisma } from "@/src/lib/prisma";
import { opportunityService } from "@/src/services/opportunity-service";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type OpportunitiesPageProps = {
  searchParams: Promise<{
    status?: string;
    company?: string;
    location?: string;
    priority?: string;
    deadline?: string;
  }>;
};

type OpportunityFilters = {
  status?: string;
  company?: string;
  location?: string;
  priority?: number;
  deadline?: string;
};

const visibleStatuses = [
  opportunityStatuses.READY,
  opportunityStatuses.WATCHING,
  opportunityStatuses.APPLIED,
  opportunityStatuses.INTERVIEW,
  opportunityStatuses.OFFER,
  opportunityStatuses.CLOSED
];

const nextStatusByStatus: Partial<Record<OpportunityStatusValue, OpportunityStatusValue>> = {
  READY: opportunityStatuses.WATCHING,
  WATCHING: opportunityStatuses.APPLIED,
  APPLIED: opportunityStatuses.INTERVIEW,
  INTERVIEW: opportunityStatuses.OFFER,
  OFFER: opportunityStatuses.CLOSED
};

function isOpportunityStatus(value: string | undefined): value is (typeof opportunityStatuses)[keyof typeof opportunityStatuses] {
  return Boolean(value && Object.values(opportunityStatuses).includes(value as never));
}

function isVisibleStatus(value: string | undefined): value is OpportunityStatusValue {
  return Boolean(value && visibleStatuses.includes(value as never));
}

function buildOpportunityWhere(filters: OpportunityFilters): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = {};

  if (isVisibleStatus(filters.status)) {
    where.status = filters.status;
  } else {
    where.status = {
      in: visibleStatuses
    };
  }

  if (filters.company) {
    where.company = {
      name: {
        contains: filters.company
      }
    };
  }

  if (filters.location) {
    where.location = filters.location;
  }

  if (typeof filters.priority === "number") {
    where.priority = filters.priority;
  }

  if (filters.deadline) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (filters.deadline === "today") {
      const end = new Date(today);
      end.setDate(end.getDate() + 1);
      where.deadlineAt = { gte: today, lt: end };
    }

    if (filters.deadline === "tomorrow") {
      const start = new Date(today);
      const end = new Date(today);
      start.setDate(start.getDate() + 1);
      end.setDate(end.getDate() + 2);
      where.deadlineAt = { gte: start, lt: end };
    }

    if (filters.deadline === "3days") {
      const end = new Date(today);
      end.setDate(end.getDate() + 3);
      where.deadlineAt = { gte: today, lt: end };
    }

    if (filters.deadline === "7days") {
      const end = new Date(today);
      end.setDate(end.getDate() + 7);
      where.deadlineAt = { gte: today, lt: end };
    }
  }

  return where;
}

function hrefWithStatus(status: string | undefined, params: URLSearchParams) {
  const next = new URLSearchParams(params);

  if (status) {
    next.set("status", status);
  } else {
    next.delete("status");
  }

  const query = next.toString();
  return query ? `/opportunities?${query}` : "/opportunities";
}

function resetHrefKeepingStatus(activeStatus?: string) {
  return activeStatus ? `/opportunities?status=${activeStatus}` : "/opportunities";
}

async function getOpportunities(filters: OpportunityFilters) {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  try {
    const where = buildOpportunityWhere(filters);

    return await prisma.opportunity.findMany({
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
        },
        jobAnalyses: {
          orderBy: { version: "desc" },
          take: 1
        },
        timelines: {
          orderBy: { createdAt: "desc" },
          take: 8
        }
      },
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ updatedAt: "desc" }]
    });
  } catch {
    return [];
  }
}

async function getStatusCounts(filters: Omit<OpportunityFilters, "status">) {
  if (!process.env.DATABASE_URL) {
    return new Map<string, number>();
  }

  try {
    const where = buildOpportunityWhere(filters);
    const grouped = await prisma.opportunity.groupBy({
      by: ["status"],
      where: Object.keys(where).length > 0 ? where : undefined,
      _count: {
        _all: true
      }
    });

    return new Map(grouped.map((item) => [item.status, item._count._all]));
  } catch {
    return new Map<string, number>();
  }
}

async function quickUpdateOpportunityStatus(formData: FormData) {
  "use server";

  const opportunityId = String(formData.get("opportunityId") || "");
  const status = String(formData.get("status") || "");

  if (!opportunityId || !isVisibleStatus(status)) {
    return;
  }

  await opportunityService.changeStatus(opportunityId, status);
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
}

function getAppliedDate(opportunity: Awaited<ReturnType<typeof getOpportunities>>[number]) {
  const applicationInfo = getApplicationInfo(opportunity.applicationInfo);

  if (applicationInfo.appliedAt) {
    return applicationInfo.appliedAt;
  }

  const appliedEvent = opportunity.timelines.find((event) => {
    if (event.eventType === "APPLIED") {
      return true;
    }

    if (event.eventType !== "STATUS_CHANGED" || !event.metadata || typeof event.metadata !== "object" || Array.isArray(event.metadata)) {
      return false;
    }

    return (event.metadata as Record<string, unknown>).to === opportunityStatuses.APPLIED;
  });

  return appliedEvent?.createdAt.toLocaleDateString();
}

function getApplicationInfo(value: unknown) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    appliedAt: typeof data.appliedAt === "string" ? data.appliedAt : "",
    applicationChannel: typeof data.applicationChannel === "string" ? data.applicationChannel : "",
    resumeVersion: typeof data.resumeVersion === "string" ? data.resumeVersion : "",
    followUpAt: typeof data.followUpAt === "string" ? data.followUpAt : "",
    nextInterviewAt: typeof data.nextInterviewAt === "string" ? data.nextInterviewAt : ""
  };
}

async function getFilterOptions() {
  if (!process.env.DATABASE_URL) {
    return {
      locations: [],
      priorities: []
    };
  }

  try {
    const opportunities = await prisma.opportunity.findMany({
      select: { location: true, priority: true }
    });

    return {
      locations: Array.from(new Set(opportunities.map((item) => item.location).filter(Boolean))).sort(),
      priorities: Array.from(new Set(opportunities.map((item) => item.priority))).sort((a, b) => b - a)
    };
  } catch {
    return {
      locations: [],
      priorities: []
    };
  }
}

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
  const { status, company, location, priority, deadline } = await searchParams;
  const activeStatus = isVisibleStatus(status) ? status : undefined;
  const activeCompany = String(company ?? "").trim();
  const activePriority = priority && !Number.isNaN(Number(priority)) ? Number(priority) : undefined;
  const activeDeadline = ["today", "tomorrow", "3days", "7days"].includes(deadline ?? "") ? deadline : undefined;
  const filterParams = new URLSearchParams();

  if (activeCompany) filterParams.set("company", activeCompany);
  if (location) filterParams.set("location", location);
  if (typeof activePriority === "number") filterParams.set("priority", String(activePriority));
  if (activeDeadline) filterParams.set("deadline", activeDeadline);

  const activeFilters: OpportunityFilters = {
    status: activeStatus,
    company: activeCompany,
    location,
    priority: activePriority,
    deadline: activeDeadline
  };
  const countFilters: Omit<OpportunityFilters, "status"> = {
    company: activeCompany,
    location,
    priority: activePriority,
    deadline: activeDeadline
  };

  const [opportunities, statusCounts, filterOptions] = await Promise.all([
    getOpportunities(activeFilters),
    getStatusCounts(countFilters),
    getFilterOptions()
  ]);
  const totalCount = Array.from(statusCounts.values()).reduce((sum, count) => sum + count, 0);
  const hasExtraFilters = Boolean(activeCompany || location || typeof activePriority === "number" || activeDeadline);
  const groupedOpportunities = new Map(visibleStatuses.map((item) => [item, opportunities.filter((opportunity) => opportunity.status === item)]));

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>岗位管理看板</h1>
        </div>
        <div className="toolbar">
          <Link className="button" href="/opportunities/new">
            录入新岗位
          </Link>
        </div>
      </header>

      <div className="tabs" aria-label="求职状态">
        <Link className={`tab ${!activeStatus ? "active" : ""}`} href={hrefWithStatus(undefined, filterParams)}>
          全部 <span>{totalCount}</span>
        </Link>
        {visibleStatuses.map((item) => (
          <Link className={`tab ${activeStatus === item ? "active" : ""}`} href={hrefWithStatus(item, filterParams)} key={item}>
            {getOpportunityStatusLabel(item)} <span>{statusCounts.get(item) ?? 0}</span>
          </Link>
        ))}
      </div>

      <form action="/opportunities" className="filter-form">
        {activeStatus ? <input name="status" type="hidden" value={activeStatus} /> : null}
        <label>
          <span>公司</span>
          <input name="company" placeholder="搜索公司" defaultValue={activeCompany} />
        </label>
        <label>
          <span>城市</span>
          <select name="location" defaultValue={location ?? ""}>
            <option value="">全部城市</option>
            {filterOptions.locations.map((item) => (
              <option key={item} value={item ?? ""}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>截止日期</span>
          <select name="deadline" defaultValue={activeDeadline ?? ""}>
            <option value="">全部</option>
            <option value="today">今日截止</option>
            <option value="tomorrow">明日截止</option>
            <option value="3days">三日内</option>
            <option value="7days">7 天内</option>
          </select>
        </label>
        <label>
          <span>优先级</span>
          <select name="priority" defaultValue={typeof activePriority === "number" ? String(activePriority) : ""}>
            <option value="">全部</option>
            {filterOptions.priorities.map((item) => (
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
          {hasExtraFilters ? (
            <Link className="button secondary" href={resetHrefKeepingStatus(activeStatus)}>
              清除
            </Link>
          ) : null}
        </div>
      </form>

      <div className="board-shell">
        {opportunities.length === 0 ? (
          <div className="empty">
            {activeStatus
              ? `当前筛选下没有「${getOpportunityStatusLabel(activeStatus)}」的岗位机会。`
              : hasExtraFilters
                ? "当前筛选下没有岗位机会。"
                : "还没有进入看板的岗位。可以先从待确认岗位池加入，或手动录入一个岗位。"}
          </div>
        ) : (
          <div className="opportunity-board">
            {visibleStatuses.map((boardStatus) => {
              const items = groupedOpportunities.get(boardStatus) ?? [];

              if (activeStatus && activeStatus !== boardStatus) {
                return null;
              }

              return (
                <section className="board-column" key={boardStatus}>
                  <div className="board-column-head">
                    <h2>{getOpportunityStatusLabel(boardStatus)}</h2>
                    <span>{statusCounts.get(boardStatus) ?? 0}</span>
                  </div>

                  {items.length === 0 ? (
                    <div className="board-empty">暂无岗位</div>
                  ) : (
                    <div className="board-cards">
                      {items.map((opportunity) => {
                        const sourceJob = opportunity.opportunitySourceJobs[0]?.sourceJob;
                        const appliedDate = getAppliedDate(opportunity);
                        const applicationInfo = getApplicationInfo(opportunity.applicationInfo);

                        return (
                          <article className="opportunity-card" key={opportunity.id}>
                            <div className="card-title-row">
                              <Link href={`/opportunities/${opportunity.id}`}>
                                <strong>{getDisplayOpportunityTitle(opportunity.title)}</strong>
                              </Link>
                              <span className="priority">P{opportunity.priority}</span>
                            </div>

                            <p className="card-meta">
                              {opportunity.company?.name ?? "未确认公司"} · {opportunity.location ?? "未确认城市"}
                            </p>

                            <div className="card-facts">
                              <span>来源：{getSourceDisplayLabel(sourceJob?.source.type, sourceJob?.source.name)}</span>
                              <span>更新：{opportunity.updatedAt.toLocaleDateString()}</span>
                              <span>投递：{appliedDate || "-"}</span>
                              <span>渠道：{applicationInfo.applicationChannel || "-"}</span>
                              <span>简历：{applicationInfo.resumeVersion || "-"}</span>
                              <span>跟进：{applicationInfo.followUpAt || "-"}</span>
                              <span>面试：{applicationInfo.nextInterviewAt || "-"}</span>
                              <span>截止：{opportunity.deadlineAt?.toLocaleDateString() ?? "-"}</span>
                            </div>

                            <div className="card-actions">
                              <Link className="button secondary" href={`/opportunities/${opportunity.id}`}>
                                查看详情
                              </Link>
                              {sourceJob?.url ? (
                                <a className="button secondary" href={sourceJob.url} rel="noreferrer" target="_blank">
                                  岗位链接
                                </a>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
