import { sourceTypes } from "@/src/domain/domain-values";
import { prisma } from "@/src/lib/prisma";
import { extractJobsFromCareerText } from "@/src/services/job-extraction-ai";
import { opportunityMergeService } from "@/src/services/opportunity-merge-service";
import { sourceJobService } from "@/src/services/source-job-service";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function inferRole(tags: unknown) {
  const tagText = asStringArray(tags).join(" ");

  if (/临床|应用/.test(tagText)) {
    return "临床应用专员";
  }

  if (/质量|法规/.test(tagText)) {
    return "质量法规专员";
  }

  if (/研发|工程/.test(tagText)) {
    return "研发工程师";
  }

  return "产品经理";
}

function inferLocation(tags: unknown) {
  const cities = ["北京", "上海", "深圳", "广州", "杭州", "苏州", "南京", "成都", "武汉", "西安"];
  return cities.find((city) => asStringArray(tags).some((tag) => tag.includes(city))) ?? "上海";
}

async function getMonitorSource() {
  return prisma.source.upsert({
    where: {
      type_name: {
        type: sourceTypes.OTHER,
        name: "公司监控发现"
      }
    },
    update: {},
    create: {
      name: "公司监控发现",
      type: sourceTypes.OTHER,
      adapterKey: "company-monitor",
      searchCapabilities: {
        mode: "company-watch"
      },
      updateStrategy: {
        trigger: "manual-sync"
      }
    }
  });
}

async function getRealCareerSource() {
  return prisma.source.upsert({
    where: {
      type_name: {
        type: sourceTypes.OFFICIAL_SITE,
        name: "招聘页抓取"
      }
    },
    update: {},
    create: {
      name: "招聘页抓取",
      type: sourceTypes.OFFICIAL_SITE,
      adapterKey: "career-page",
      searchCapabilities: {
        mode: "career-page-fetch"
      },
      updateStrategy: {
        trigger: "manual-sync"
      }
    }
  });
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h1|h2|h3|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asConfigObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function updateCompanyCheckState(companyId: string, monitorConfig: unknown, status: "ACCESSIBLE" | "FAILED", checkedAt: Date, error?: string) {
  await prisma.company.update({
    where: { id: companyId },
    data: {
      monitorConfig: {
        ...asConfigObject(monitorConfig),
        recruitingEntryStatus: status,
        lastCheckedAt: checkedAt.toISOString(),
        lastCheckError: error ?? null
      }
    }
  });
}

export class MonitorDiscoveryService {
  async syncRealCareerPages(userId: string) {
    const source = await getRealCareerSource();
    const companies = await prisma.company.findMany({
      where: {
        userId,
        status: "MONITORING",
        OR: [{ careerUrl: { not: null } }, { websiteUrl: { not: null } }]
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 10
    });
    const results = [];

    for (const company of companies) {
      const url = company.careerUrl ?? company.websiteUrl;

      if (!url) {
        continue;
      }

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Job OS career monitor"
          },
          signal: AbortSignal.timeout(12000)
        });

        if (!response.ok) {
          await updateCompanyCheckState(company.id, company.monitorConfig, "FAILED", new Date(), `HTTP ${response.status}`);
          continue;
        }

        await updateCompanyCheckState(company.id, company.monitorConfig, "ACCESSIBLE", new Date());

        const contentType = response.headers.get("content-type") ?? "";
        const rawHtml = await response.text();
        const rawText = contentType.includes("html") ? htmlToText(rawHtml) : rawHtml;
        const extraction = await extractJobsFromCareerText({
          companyName: company.name,
          url,
          pageText: rawText,
          fallbackLocation: inferLocation(company.tags)
        });

        for (const job of extraction.jobs.slice(0, 5)) {
          const sourceJob = await sourceJobService.create({
            sourceId: source.id,
            url,
            rawHtml: contentType.includes("html") ? rawHtml.slice(0, 120000) : undefined,
            rawText: [
              job.title,
              `公司：${company.name}`,
              `地点：${job.location ?? inferLocation(company.tags)}`,
              job.recruitmentType ? `招聘类型：${job.recruitmentType}` : "",
              `岗位来源：招聘页抽取`,
              `抽取模型：${extraction.model}`,
              "",
              job.rawText
            ].filter(Boolean).join("\n"),
            externalId: `career-page:${company.id}:${job.title}`,
            sourceUpdatedAt: new Date()
          });

          const opportunity = await opportunityMergeService.mergeOrCreate({
            userId,
            sourceJobId: sourceJob.id,
            companyName: company.name,
            title: job.title,
            location: job.location ?? inferLocation(company.tags),
            recruitmentType: job.recruitmentType
          });

          results.push({ sourceJob, opportunity });
        }
      } catch (error) {
        await updateCompanyCheckState(company.id, company.monitorConfig, "FAILED", new Date(), error instanceof Error ? error.message : "未知错误");
        continue;
      }
    }

    return results;
  }

  async syncDemoJobs(userId: string) {
    const source = await getMonitorSource();
    const companies = await prisma.company.findMany({
      where: {
        userId,
        status: "MONITORING"
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 5
    });

    const today = new Date().toISOString().slice(0, 10);
    const results = [];

    for (const company of companies) {
      const role = inferRole(company.tags);
      const location = inferLocation(company.tags);
      const title = `${role} - 2026 秋招`;
      const url = `${company.careerUrl ?? company.websiteUrl ?? "https://example.com/careers"}#job-os-${company.id}-${today}`;
      const rawText = [
        title,
        `公司：${company.name}`,
        `工作地点：${location}`,
        "岗位来源：公司监控发现",
        `发布时间：${today}`,
        `JD 原文：负责${role}相关的信息收集、需求分析、跨团队协作和项目推进。`,
        "岗位要求：具备良好的沟通能力、结构化分析能力和学习能力；相关专业或项目经历优先。",
        "说明：这是当前监控流程生成的演示发现记录，真实抓取接入后会替换为招聘官网原文或截图。"
      ].join("\n");

      const sourceJob = await sourceJobService.create({
        sourceId: source.id,
        url,
        rawText,
        externalId: `company-monitor:${company.id}:${today}:${title}`,
        publishedAt: new Date()
      });

      const opportunity = await opportunityMergeService.mergeOrCreate({
        userId,
        sourceJobId: sourceJob.id,
        companyName: company.name,
        title,
        location,
        recruitmentType: "秋招"
      });

      results.push({ sourceJob, opportunity });
    }

    return results;
  }
}

export const monitorDiscoveryService = new MonitorDiscoveryService();
