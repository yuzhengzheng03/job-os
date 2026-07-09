import { PrismaClient } from "@prisma/client";
import { sourceTypes } from "../src/domain/domain-values";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@job-os.local" },
    update: {},
    create: {
      email: "demo@job-os.local",
      name: "Demo User"
    }
  });

  await prisma.source.upsert({
    where: {
      type_name: {
        type: sourceTypes.OTHER,
        name: "手动录入"
      }
    },
    update: {},
    create: {
      name: "手动录入",
      type: sourceTypes.OTHER,
      adapterKey: "manual",
      searchCapabilities: {
        mode: "paste"
      },
      updateStrategy: {
        trigger: "user"
      }
    }
  });

  const source = await prisma.source.findUniqueOrThrow({
    where: {
      type_name: {
        type: sourceTypes.OTHER,
        name: "手动录入"
      }
    }
  });

  await prisma.searchProfile.upsert({
    where: {
      id: "demo-ai-product-profile"
    },
    update: {},
    create: {
      id: "demo-ai-product-profile",
      userId: user.id,
      name: "AI 产品经理秋招",
      keywords: ["AI产品经理", "Agent", "LLM"],
      locations: ["上海", "北京"],
      industries: ["AI", "医疗AI"],
      recruitmentTypes: ["校招", "提前批"],
      sourceScope: ["手动录入", "企业官网"],
      enabled: true
    }
  });

  const company = await prisma.company.upsert({
    where: {
      userId_normalizedName: {
        userId: user.id,
        normalizedName: "demo-ai-company"
      }
    },
    update: {},
    create: {
      userId: user.id,
      name: "示例 AI 公司",
      normalizedName: "示例-ai-公司",
      websiteUrl: "https://example.com",
      careerUrl: "https://example.com/careers",
      tags: ["AI", "校招"],
      priority: 1
    }
  });

  const sourceJob = await prisma.sourceJob.upsert({
    where: { id: "demo-ai-pm-source-job" },
    update: {},
    create: {
      id: "demo-ai-pm-source-job",
      sourceId: source.id,
      url: "https://example.com/careers/ai-product-manager",
      rawText: [
        "AI 产品经理 - 2026 秋招",
        "工作地点：上海 / 北京",
        "工作职责：负责 AI Agent 产品方向的用户研究、需求分析、方案设计和跨团队推进。",
        "岗位要求：熟悉大模型产品，有良好的数据分析能力、沟通能力和产品判断力。",
        "加分项：有 LLM、Agent、医疗 AI 或开发者工具相关项目经验。"
      ].join("\n"),
      contentHash: "demo-ai-pm-source-job-hash"
    }
  });

  const opportunity = await prisma.opportunity.upsert({
    where: { id: "demo-ai-pm-opportunity" },
    update: {},
    create: {
      id: "demo-ai-pm-opportunity",
      userId: user.id,
      companyId: company.id,
      title: "AI 产品经理 - 2026 秋招",
      normalizedTitle: "ai 产品经理 - 2026 秋招",
      location: "上海 / 北京",
      recruitmentType: "校招",
      status: "READY",
      priority: 2
    }
  });

  await prisma.opportunitySourceJob.upsert({
    where: {
      opportunityId_sourceJobId: {
        opportunityId: opportunity.id,
        sourceJobId: sourceJob.id
      }
    },
    update: {},
    create: {
      opportunityId: opportunity.id,
      sourceJobId: sourceJob.id,
      matchReason: "演示数据：手动录入岗位",
      matchScore: 1
    }
  });

  await prisma.jobAnalysis.upsert({
    where: {
      opportunityId_version: {
        opportunityId: opportunity.id,
        version: 1
      }
    },
    update: {},
    create: {
      opportunityId: opportunity.id,
      sourceJobId: sourceJob.id,
      version: 1,
      model: "mock-analysis-v0",
      promptVersion: "mock-v0",
      summary: "这是一个偏 AI Agent 方向的产品经理校招机会，适合希望做大模型产品、用户研究和跨团队推进的候选人重点评估。",
      responsibilities: ["用户研究", "需求分析", "AI Agent 产品方案设计", "跨团队推进"],
      requirements: ["熟悉大模型产品", "具备数据分析能力", "沟通协作能力强", "有产品判断力"],
      keywords: ["AI 产品经理", "LLM", "Agent", "校招"],
      skills: ["用户研究", "产品设计", "数据分析", "项目推进"],
      fitNotes: "可作为第一批重点关注岗位，用来验证 Job OS 的机会管理流程。",
      risks: ["示例数据，不代表真实招聘信息"],
      rawOutput: {
        summary: "演示岗位解读",
        source: "seed"
      }
    }
  });

  await prisma.timeline.upsert({
    where: { id: "demo-ai-pm-timeline-discovered" },
    update: {},
    create: {
      id: "demo-ai-pm-timeline-discovered",
      opportunityId: opportunity.id,
      actorType: "SYSTEM",
      eventType: "OPPORTUNITY_DISCOVERED",
      title: "发现新的岗位机会",
      metadata: {
        sourceJobId: sourceJob.id
      }
    }
  });

  await prisma.timeline.upsert({
    where: { id: "demo-ai-pm-timeline-analyzed" },
    update: {},
    create: {
      id: "demo-ai-pm-timeline-analyzed",
      opportunityId: opportunity.id,
      actorType: "AI",
      eventType: "AI_ANALYSIS_COMPLETED",
      title: "岗位解读完成",
      metadata: {
        sourceJobId: sourceJob.id,
        version: 1
      }
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
