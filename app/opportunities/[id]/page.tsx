import type { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import path from "path";
import {
  getDisplayOpportunityTitle,
  getOpportunityStatusLabel,
  getSourceDisplayLabel,
  getTimelineEventLabel
} from "@/src/domain/display-labels";
import { opportunityStatuses } from "@/src/domain/domain-values";
import { prisma } from "@/src/lib/prisma";
import { analysisService } from "@/src/services/analysis-service";

export const dynamic = "force-dynamic";

type OpportunityPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type JsonObject = Record<string, unknown>;

const allowedMaterialExtensions = new Set([".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp"]);
const allowedMaterialMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

function asJsonObject(value: Prisma.JsonValue | null | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN");
}

function formatDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString("zh-CN")} ${date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit"
  })}`;
}

function sanitizeUploadName(filename: string) {
  const trimmed = filename.trim() || "material";
  const extension = path.extname(trimmed).toLowerCase();
  const basename = path.basename(trimmed, extension).replace(/[^\w\u4e00-\u9fa5.-]+/g, "-").slice(0, 64) || "material";
  return `${basename}${extension}`;
}

function getApplicationInfo(value: Prisma.JsonValue | null | undefined) {
  const data = asJsonObject(value);

  return {
    applicationAccount: typeof data.applicationAccount === "string" ? data.applicationAccount : "",
    applicationChannel: typeof data.applicationChannel === "string" ? data.applicationChannel : "",
    applicationNotes: typeof data.applicationNotes === "string" ? data.applicationNotes : "",
    appliedAt: typeof data.appliedAt === "string" ? data.appliedAt : "",
    closeReason: typeof data.closeReason === "string" ? data.closeReason : "",
    contactEmail: typeof data.contactEmail === "string" ? data.contactEmail : "",
    contactName: typeof data.contactName === "string" ? data.contactName : "",
    contactPhone: typeof data.contactPhone === "string" ? data.contactPhone : "",
    currentStage: typeof data.currentStage === "string" ? data.currentStage : "",
    followUpAt: typeof data.followUpAt === "string" ? data.followUpAt : "",
    internalReferrer: typeof data.internalReferrer === "string" ? data.internalReferrer : "",
    interviewRound: typeof data.interviewRound === "string" ? data.interviewRound : "",
    lastFollowUpAt: typeof data.lastFollowUpAt === "string" ? data.lastFollowUpAt : "",
    nextInterviewAt: typeof data.nextInterviewAt === "string" ? data.nextInterviewAt : "",
    referrer: typeof data.referrer === "string" ? data.referrer : "",
    resumeVersion: typeof data.resumeVersion === "string" ? data.resumeVersion : ""
  };
}

function renderAnalysisText({
  fitNotes,
  keywords,
  requirements,
  responsibilities,
  risks,
  skills,
  summary
}: {
  fitNotes?: string | null;
  keywords: string[];
  requirements: string[];
  responsibilities: string[];
  risks: string[];
  skills: string[];
  summary: string;
}) {
  const sections = [
    ["岗位定位", summary],
    ["核心工作内容", responsibilities.map((item, index) => `${index + 1}. ${item}`).join("\n")],
    ["硬性要求", requirements.map((item, index) => `${index + 1}. ${item}`).join("\n")],
    ["简历/作品集应呈现的能力", skills.map((item, index) => `${index + 1}. ${item}`).join("\n")],
    ["关键词", keywords.join("、")],
    ["补充判断", fitNotes ?? ""],
    ["待确认风险", risks.map((item, index) => `${index + 1}. ${item}`).join("\n")]
  ];

  return sections
    .filter(([, content]) => content.trim().length > 0)
    .map(([label, content]) => `【${label}】\n${content}`)
    .join("\n\n");
}

async function getOpportunity(id: string) {
  if (!process.env.DATABASE_URL) return null;

  return prisma.opportunity.findUnique({
    include: {
      attachments: {
        orderBy: { createdAt: "desc" }
      },
      company: true,
      jobAnalyses: {
        orderBy: { version: "desc" },
        take: 1
      },
      opportunitySourceJobs: {
        include: {
          sourceJob: {
            include: {
              source: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      },
      timelines: {
        orderBy: { createdAt: "asc" }
      }
    },
    where: { id }
  });
}

async function regenerateAnalysis(formData: FormData) {
  "use server";

  const opportunityId = getText(formData, "opportunityId");
  const openAIApiKey = getText(formData, "openaiApiKey");
  if (!opportunityId) return;

  await analysisService.analyze(opportunityId, { openAIApiKey });
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/opportunities");
}

async function saveCoreOpportunity(formData: FormData) {
  "use server";

  const opportunityId = getText(formData, "opportunityId");
  const sourceJobId = getText(formData, "sourceJobId");
  const title = getText(formData, "title");
  const companyName = getText(formData, "companyName");
  const location = getText(formData, "location");
  const recruitmentType = getText(formData, "recruitmentType");
  const rawText = getText(formData, "rawText");
  const url = getText(formData, "url");

  if (!opportunityId || !title) return;

  const current = await prisma.opportunity.findUniqueOrThrow({
    where: { id: opportunityId }
  });

  let companyId = current.companyId;
  if (companyName) {
    const normalizedName = companyName.toLowerCase().replace(/\s+/g, "-");
    const company = await prisma.company.upsert({
      create: {
        name: companyName,
        normalizedName,
        userId: current.userId
      },
      update: { name: companyName },
      where: {
        userId_normalizedName: {
          normalizedName,
          userId: current.userId
        }
      }
    });
    companyId = company.id;
  }

  await prisma.opportunity.update({
    data: {
      companyId,
      location: location || null,
      normalizedTitle: title.toLowerCase(),
      recruitmentType: recruitmentType || null,
      title
    },
    where: { id: opportunityId }
  });

  if (sourceJobId) {
    await prisma.sourceJob.update({
      data: {
        contentHash: `${sourceJobId}-${rawText.length}-${Date.now()}`,
        rawText,
        url: url || "https://example.com"
      },
      where: { id: sourceJobId }
    });
  }

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
}

async function saveApplicationInfo(formData: FormData) {
  "use server";

  const opportunityId = getText(formData, "opportunityId");
  const status = getText(formData, "status");
  const priority = Number(formData.get("priority") ?? 0);

  if (!opportunityId) return;

  const applicationInfo = {
    applicationAccount: getText(formData, "applicationAccount"),
    applicationChannel: getText(formData, "applicationChannel"),
    applicationNotes: getText(formData, "applicationNotes"),
    appliedAt: getText(formData, "appliedAt"),
    contactEmail: getText(formData, "contactEmail"),
    contactName: getText(formData, "contactName"),
    contactPhone: getText(formData, "contactPhone"),
    currentStage: getText(formData, "currentStage"),
    followUpAt: getText(formData, "followUpAt"),
    interviewRound: getText(formData, "interviewRound"),
    nextInterviewAt: getText(formData, "nextInterviewAt"),
    referrer: getText(formData, "referrer"),
    resumeVersion: getText(formData, "resumeVersion")
  };

  await prisma.opportunity.update({
    data: {
      applicationInfo: Object.fromEntries(Object.entries(applicationInfo).filter(([, value]) => value.length > 0)) as Prisma.InputJsonObject,
      deadlineAt: parseDate(formData.get("deadlineAt")),
      priority: Number.isFinite(priority) ? priority : undefined,
      status: Object.values(opportunityStatuses).includes(status as never) ? status : undefined,
      userNotes: getText(formData, "userNotes")
    },
    where: { id: opportunityId }
  });

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
}

async function uploadOpportunityMaterial(formData: FormData) {
  "use server";

  const opportunityId = getText(formData, "opportunityId");
  const file = formData.get("materialFile");

  if (!opportunityId || !(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) return;

  const safeName = sanitizeUploadName(file.name);
  const extension = path.extname(safeName).toLowerCase();
  const mimeType = file.type || "application/octet-stream";

  if (!allowedMaterialExtensions.has(extension) || (file.type && !allowedMaterialMimeTypes.has(file.type))) return;

  const uploadDir = path.join(process.cwd(), "public", "uploads", "opportunity-materials");
  const storedFilename = `${opportunityId}-${randomUUID()}-${safeName}`;
  const diskPath = path.join(uploadDir, storedFilename);
  const storagePath = `/uploads/opportunity-materials/${storedFilename}`;

  await mkdir(uploadDir, { recursive: true });
  await writeFile(diskPath, Buffer.from(await file.arrayBuffer()));

  await prisma.attachment.create({
    data: {
      fileSize: file.size,
      filename: safeName,
      mimeType,
      opportunityId,
      storagePath,
      type: "MATERIAL"
    }
  });

  revalidatePath(`/opportunities/${opportunityId}`);
}

async function deleteOpportunityMaterial(formData: FormData) {
  "use server";

  const attachmentId = getText(formData, "attachmentId");
  if (!attachmentId) return;

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId }
  });

  if (!attachment) return;

  await prisma.attachment.delete({
    where: { id: attachmentId }
  });

  if (attachment.storagePath.startsWith("/uploads/")) {
    await unlink(path.join(process.cwd(), "public", attachment.storagePath)).catch(() => undefined);
  }

  revalidatePath(`/opportunities/${attachment.opportunityId}`);
}

function getMaterialType(filename: string, mimeType: string) {
  const extension = path.extname(filename).replace(".", "").toUpperCase();
  if (extension) return extension;
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word")) return "DOC";
  if (mimeType.includes("image")) return "图片";
  return "文件";
}

function getPendingTimelineLabels(status: string) {
  if (status === opportunityStatuses.CLOSED || status === opportunityStatuses.OFFER) return [];
  if (status === opportunityStatuses.INTERVIEW) return ["下一轮面试", "结果确认"];
  if (status === opportunityStatuses.APPLIED) return ["筛选反馈", "面试安排"];
  return ["投递已提交", "面试安排"];
}

export default async function OpportunityPage({ params }: OpportunityPageProps) {
  const { id } = await params;
  const opportunity = await getOpportunity(id);

  if (!opportunity) {
    notFound();
  }

  const sourceJob = opportunity.opportunitySourceJobs[0]?.sourceJob;
  const analysis = opportunity.jobAnalyses[0];
  const analysisHeading = analysis?.model && !analysis.model.startsWith("mock-") ? "AI 岗位解读" : "本地岗位解读";
  const applicationInfo = getApplicationInfo(opportunity.applicationInfo);
  const sourceLabel = getSourceDisplayLabel(sourceJob?.source.type, sourceJob?.source.name);
  const responsibilities = asStringArray(analysis?.responsibilities);
  const requirements = asStringArray(analysis?.requirements);
  const skills = asStringArray(analysis?.skills);
  const keywords = asStringArray(analysis?.keywords);
  const risks = asStringArray(analysis?.risks);
  const analysisText = renderAnalysisText({
    fitNotes: analysis?.fitNotes,
    keywords,
    requirements,
    responsibilities,
    risks,
    skills,
    summary: analysis?.summary ?? "暂未生成岗位解读。"
  });
  const title = getDisplayOpportunityTitle(opportunity.title);
  const companyName = opportunity.company?.name ?? "未确认公司";
  const priorityLabel = `P${opportunity.priority} 优先`;

  return (
    <div className="detail-workspace">
      <header className="detail-hero">
        <div className="detail-hero-icon" aria-hidden="true">
          <span />
        </div>
        <div className="detail-hero-main">
          <h1>{title}</h1>
          <div className="detail-hero-meta">
            <span>{companyName}</span>
            <span>{opportunity.location ?? "未确认城市"}</span>
            <span>{opportunity.recruitmentType ?? "招聘类型未确认"}</span>
            <span>{sourceLabel}</span>
            <span className="detail-pill danger">{priorityLabel}</span>
          </div>
        </div>
        <Link className="detail-back-link" href="/opportunities">
          返回看板
        </Link>
      </header>

      <div className="detail-layout">
        <div className="detail-left">
          <section className="detail-panel">
            <div className="detail-panel-head">
              <h2>JD 原文</h2>
              <button className="button secondary" form="core-opportunity-form" type="submit">
                保存岗位信息
              </button>
            </div>
            <form action={saveCoreOpportunity} className="inline-edit-form" id="core-opportunity-form">
              <input name="opportunityId" type="hidden" value={opportunity.id} />
              <input name="sourceJobId" type="hidden" value={sourceJob?.id ?? ""} />
              <div className="inline-field-grid">
                <label>
                  <span>岗位名称</span>
                  <input name="title" required defaultValue={opportunity.title} />
                </label>
                <label>
                  <span>公司</span>
                  <input name="companyName" defaultValue={companyName === "未确认公司" ? "" : companyName} />
                </label>
                <label>
                  <span>城市</span>
                  <input name="location" defaultValue={opportunity.location ?? ""} />
                </label>
                <label>
                  <span>招聘类型</span>
                  <input name="recruitmentType" defaultValue={opportunity.recruitmentType ?? ""} />
                </label>
                <label className="full">
                  <span>岗位链接</span>
                  <input name="url" type="url" defaultValue={sourceJob?.url ?? ""} />
                </label>
              </div>
              <label className="full detail-textarea-field">
                <span>JD 原文</span>
                <textarea className="jd-content jd-edit-inline" name="rawText" defaultValue={sourceJob?.rawText ?? ""} />
              </label>
            </form>
          </section>

          <section className="detail-panel ai-analysis-panel">
            <div className="detail-panel-head">
              <h2>{analysisHeading}</h2>
              <form action={regenerateAnalysis} className="ai-regenerate-form">
                <input name="opportunityId" type="hidden" value={opportunity.id} />
                <button className="button secondary" type="submit">
                  重新生成解读
                </button>
              </form>
            </div>
            <textarea className="ai-analysis-textarea" readOnly value={analysisText} />
            <div className="analysis-foot">
              <span>模型：{analysis?.model ?? "尚未生成"}</span>
              <span>最近版本：v{analysis?.version ?? 0}</span>
            </div>
          </section>
        </div>

        <aside className="detail-right">
          <section className="detail-panel application-panel">
            <div className="detail-panel-head">
              <h2>我的求职</h2>
              <button className="button secondary" form="application-info-form" type="submit">
                保存求职信息
              </button>
            </div>
            <form action={saveApplicationInfo} className="inline-edit-form compact-edit-form" id="application-info-form">
              <input name="opportunityId" type="hidden" value={opportunity.id} />
              <div className="info-grid editable-info-grid">
                <label>
                  <span>当前状态</span>
                  <select name="status" defaultValue={opportunity.status}>
                    {Object.values(opportunityStatuses).map((status) => (
                      <option key={status} value={status}>
                        {getOpportunityStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>优先级</span>
                  <select name="priority" defaultValue={opportunity.priority}>
                    {[0, 1, 2, 3].map((item) => (
                      <option key={item} value={item}>
                        P{item} 优先
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>投递渠道</span>
                  <input name="applicationChannel" defaultValue={applicationInfo.applicationChannel || sourceLabel} />
                </label>
                <label>
                  <span>关键事项</span>
                  <input name="interviewRound" defaultValue={applicationInfo.interviewRound || applicationInfo.nextInterviewAt} placeholder="二面 / 笔试待完成" />
                </label>
                <label>
                  <span>投递时间</span>
                  <input name="appliedAt" type="date" defaultValue={applicationInfo.appliedAt} />
                </label>
                <label>
                  <span>简历投递截止</span>
                  <input name="deadlineAt" type="date" defaultValue={formatDateInput(opportunity.deadlineAt)} />
                </label>
                <label>
                  <span>联系人</span>
                  <input name="contactName" defaultValue={applicationInfo.contactName} placeholder="HR 张女士" />
                </label>
                <label>
                  <span>联系邮箱</span>
                  <input name="contactEmail" defaultValue={applicationInfo.contactEmail || applicationInfo.applicationAccount} placeholder="name@example.com" />
                </label>
                <label>
                  <span>内推人</span>
                  <input name="referrer" defaultValue={applicationInfo.referrer || applicationInfo.internalReferrer} placeholder="李同学" />
                </label>
              </div>
              <label className="detail-note">
                <span>备注</span>
                <textarea name="userNotes" placeholder="在这里输入备注信息...（可记录面试反馈、重要信息、下一步计划等）" defaultValue={opportunity.userNotes ?? ""} maxLength={500} />
                <small>{(opportunity.userNotes ?? "").length}/500</small>
              </label>
              <input name="applicationAccount" type="hidden" value={applicationInfo.applicationAccount} />
              <input name="applicationNotes" type="hidden" value={applicationInfo.applicationNotes} />
              <input name="contactPhone" type="hidden" value={applicationInfo.contactPhone} />
              <input name="currentStage" type="hidden" value={applicationInfo.currentStage} />
              <input name="followUpAt" type="hidden" value={applicationInfo.followUpAt} />
              <input name="nextInterviewAt" type="hidden" value={applicationInfo.nextInterviewAt} />
              <input name="resumeVersion" type="hidden" value={applicationInfo.resumeVersion} />
            </form>
          </section>

          <section className="detail-panel timeline-panel">
            <h2>流程记录</h2>
            <ol className="timeline-list">
              {opportunity.timelines.map((item) => (
                <li className="done" key={item.id}>
                  <span />
                  <div>
                    <strong>{item.title || getTimelineEventLabel(item.eventType)}</strong>
                    <small>{formatDateTime(item.createdAt)}</small>
                  </div>
                  <em>已完成</em>
                </li>
              ))}
              {getPendingTimelineLabels(opportunity.status).map((item) => (
                <li className="pending" key={item}>
                  <span />
                  <div>
                    <strong>{item}</strong>
                    <small>待定</small>
                  </div>
                  <em>待进行</em>
                </li>
              ))}
            </ol>
          </section>

          <section className="detail-panel">
            <h2>求职材料</h2>
            <p className="detail-helper">支持格式：PDF、DOC/DOCX、JPG/PNG，单个文件不超过 20MB</p>
            {opportunity.attachments.length === 0 ? (
              <div className="material-empty">还没有上传求职材料。</div>
            ) : (
              <table className="material-table">
                <thead>
                  <tr>
                    <th>文件名称</th>
                    <th>类型</th>
                    <th>大小</th>
                    <th>上传时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunity.attachments.map((item) => (
                    <tr key={item.id}>
                      <td>{item.filename}</td>
                      <td>{getMaterialType(item.filename, item.mimeType)}</td>
                      <td>{`${(item.fileSize / 1024 / 1024).toFixed(2)} MB`}</td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>
                        <a href={item.storagePath} rel="noreferrer" target="_blank">
                          查看
                        </a>
                        <form action={deleteOpportunityMaterial}>
                          <input name="attachmentId" type="hidden" value={item.id} />
                          <button aria-label={`删除 ${item.filename}`} type="submit">
                            删除
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form action={uploadOpportunityMaterial} className="material-upload-inline">
              <input name="opportunityId" type="hidden" value={opportunity.id} />
              <input name="materialFile" type="file" accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp" required />
              <button className="button upload-button" type="submit">
                上传材料
              </button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
