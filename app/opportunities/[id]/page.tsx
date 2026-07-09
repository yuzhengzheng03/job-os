import { notFound } from "next/navigation";
import {
  getDisplayOpportunityTitle,
  getOpportunityStatusLabel,
  getTimelineActorLabel,
  getTimelineEventLabel
} from "@/src/domain/display-labels";
import { opportunityStatuses } from "@/src/domain/domain-values";
import { prisma } from "@/src/lib/prisma";
import { analysisService } from "@/src/services/analysis-service";
import { opportunityService } from "@/src/services/opportunity-service";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { revalidatePath } from "next/cache";
import path from "path";

type OpportunityPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function updateOpportunityStatus(formData: FormData) {
  "use server";

  const opportunityId = String(formData.get("opportunityId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!opportunityId || !Object.values(opportunityStatuses).includes(status as never)) {
    return;
  }

  await opportunityService.changeStatus(opportunityId, status as never);
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/opportunities");
}

async function updateOpportunityNotes(formData: FormData) {
  "use server";

  const opportunityId = String(formData.get("opportunityId") ?? "");
  const userNotes = String(formData.get("userNotes") ?? "").trim();

  if (!opportunityId) {
    return;
  }

  await opportunityService.updateNotes(opportunityId, userNotes);
  revalidatePath(`/opportunities/${opportunityId}`);
}

function parseDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(`${text}T00:00:00`) : null;
}

async function updateApplicationInfo(formData: FormData) {
  "use server";

  const opportunityId = String(formData.get("opportunityId") ?? "");

  if (!opportunityId) {
    return;
  }

  await opportunityService.updateApplicationInfo(opportunityId, {
    deadlineAt: parseDate(formData.get("deadlineAt")),
    appliedAt: String(formData.get("appliedAt") ?? ""),
    applicationChannel: String(formData.get("applicationChannel") ?? ""),
    resumeVersion: String(formData.get("resumeVersion") ?? ""),
    referrer: String(formData.get("referrer") ?? ""),
    applicationAccount: String(formData.get("applicationAccount") ?? ""),
    nextInterviewAt: String(formData.get("nextInterviewAt") ?? ""),
    interviewRound: String(formData.get("interviewRound") ?? ""),
    lastFollowUpAt: String(formData.get("lastFollowUpAt") ?? ""),
    followUpAt: String(formData.get("followUpAt") ?? ""),
    closeReason: String(formData.get("closeReason") ?? ""),
    applicationNotes: String(formData.get("applicationNotes") ?? "")
  });

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/opportunities");
}

async function regenerateAnalysis(formData: FormData) {
  "use server";

  const opportunityId = String(formData.get("opportunityId") ?? "");

  if (!opportunityId) {
    return;
  }

  await analysisService.analyze(opportunityId);
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/opportunities");
}

const allowedMaterialExtensions = new Set([".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp"]);
const allowedMaterialMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

function sanitizeUploadName(filename: string) {
  const trimmed = filename.trim() || "material";
  const extension = path.extname(trimmed).toLowerCase();
  const basename = path.basename(trimmed, extension).replace(/[^\w\u4e00-\u9fa5.-]+/g, "-").slice(0, 64) || "material";
  return `${basename}${extension}`;
}

async function uploadOpportunityMaterial(formData: FormData) {
  "use server";

  const opportunityId = String(formData.get("opportunityId") ?? "");
  const file = formData.get("materialFile");

  if (!opportunityId || !(file instanceof File) || file.size === 0) {
    return;
  }

  const safeName = sanitizeUploadName(file.name);
  const extension = path.extname(safeName).toLowerCase();
  const mimeType = file.type || "application/octet-stream";

  if (!allowedMaterialExtensions.has(extension) || (file.type && !allowedMaterialMimeTypes.has(file.type))) {
    return;
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "opportunity-materials");
  const storedFilename = `${opportunityId}-${randomUUID()}-${safeName}`;
  const diskPath = path.join(uploadDir, storedFilename);
  const storagePath = `/uploads/opportunity-materials/${storedFilename}`;

  await mkdir(uploadDir, { recursive: true });
  await writeFile(diskPath, Buffer.from(await file.arrayBuffer()));

  await prisma.attachment.create({
    data: {
      opportunityId,
      type: "MATERIAL",
      filename: safeName,
      mimeType,
      fileSize: file.size,
      storagePath
    }
  });

  revalidatePath(`/opportunities/${opportunityId}`);
}

function getApplicationInfo(value: unknown) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    appliedAt: typeof data.appliedAt === "string" ? data.appliedAt : "",
    applicationChannel: typeof data.applicationChannel === "string" ? data.applicationChannel : "",
    resumeVersion: typeof data.resumeVersion === "string" ? data.resumeVersion : "",
    referrer: typeof data.referrer === "string" ? data.referrer : "",
    applicationAccount: typeof data.applicationAccount === "string" ? data.applicationAccount : "",
    nextInterviewAt: typeof data.nextInterviewAt === "string" ? data.nextInterviewAt : "",
    interviewRound: typeof data.interviewRound === "string" ? data.interviewRound : "",
    lastFollowUpAt: typeof data.lastFollowUpAt === "string" ? data.lastFollowUpAt : "",
    followUpAt: typeof data.followUpAt === "string" ? data.followUpAt : "",
    closeReason: typeof data.closeReason === "string" ? data.closeReason : "",
    applicationNotes: typeof data.applicationNotes === "string" ? data.applicationNotes : ""
  };
}

function formatDateInput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="analysis-block">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function OpportunityPage({ params }: OpportunityPageProps) {
  if (!process.env.DATABASE_URL) {
    notFound();
  }

  const { id } = await params;
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
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
        orderBy: {
          createdAt: "desc"
        }
      },
      jobAnalyses: {
        orderBy: {
          version: "desc"
        }
      },
      timelines: {
        orderBy: {
          createdAt: "desc"
        }
      },
      attachments: {
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!opportunity) {
    notFound();
  }

  const latestAnalysis = opportunity.jobAnalyses[0];
  const latestSourceJob = opportunity.opportunitySourceJobs[0]?.sourceJob;
  const applicationInfo = getApplicationInfo(opportunity.applicationInfo);
  const responsibilities = asStringList(latestAnalysis?.responsibilities);
  const requirements = asStringList(latestAnalysis?.requirements);
  const keywords = asStringList(latestAnalysis?.keywords);
  const skills = asStringList(latestAnalysis?.skills);
  const risks = asStringList(latestAnalysis?.risks);

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>{getDisplayOpportunityTitle(opportunity.title)}</h1>
          <p>
            {opportunity.company?.name ?? "未确认公司"} · {opportunity.location ?? "未确认城市"}
          </p>
        </div>
        <div className="toolbar">
          <span className="status">{getOpportunityStatusLabel(opportunity.status)}</span>
        </div>
      </header>

      <div className="grid">
        <div>
          <section className="section">
            <h2>AI 解读</h2>
            <div className="section-body">
              {latestAnalysis ? (
                <>
                  <div className="analysis-summary">
                    <span>岗位定位</span>
                    <p>{latestAnalysis.summary}</p>
                  </div>
                  {latestAnalysis.fitNotes ? (
                    <div className="analysis-block">
                      <h3>JD 画像</h3>
                      <p>{latestAnalysis.fitNotes}</p>
                    </div>
                  ) : null}
                  <AnalysisList title="工作内容拆解" items={responsibilities} />
                  <AnalysisList title="硬性要求" items={requirements} />
                  <AnalysisList title="简历需要呈现的证据" items={skills} />
                  <AnalysisList title="关键词" items={keywords} />
                  <AnalysisList title="需要确认的信息" items={risks} />
                  <p className="muted">第 {latestAnalysis.version} 版解读 · 模型：{latestAnalysis.model}</p>
                </>
              ) : (
                <p className="muted">还没有 AI 解读。确认岗位后会自动生成，也可以在这里手动生成。</p>
              )}
              <form action={regenerateAnalysis} className="inline-action">
                <input name="opportunityId" type="hidden" value={opportunity.id} />
                <button className="button secondary" type="submit">
                  生成/刷新解读
                </button>
              </form>
            </div>
          </section>

          <section className="section">
            <h2>JD 原文 / 截图</h2>
            <div className="section-body">
              {latestSourceJob ? (
                <>
                  <p className="muted">{latestSourceJob.source.name}</p>
                  <pre>{latestSourceJob.rawText.slice(0, 1800)}</pre>
                </>
              ) : (
                <p className="muted">还没有录入岗位原文。</p>
              )}
            </div>
          </section>
        </div>

        <aside>
          <section className="section">
            <h2>推进操作</h2>
            <div className="section-body">
              <form action={updateOpportunityStatus} className="stack-form">
                <input name="opportunityId" type="hidden" value={opportunity.id} />
                <label>
                  <span>当前进展</span>
                  <select name="status" defaultValue={opportunity.status}>
                    {Object.values(opportunityStatuses).map((status) => (
                      <option key={status} value={status}>
                        {getOpportunityStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button" type="submit">
                  保存进展
                </button>
              </form>
            </div>
          </section>

          <section className="section">
            <h2>求职备注</h2>
            <div className="section-body">
              <form action={updateOpportunityNotes} className="stack-form">
                <input name="opportunityId" type="hidden" value={opportunity.id} />
                <label>
                  <span>我的判断和准备要点</span>
                  <textarea
                    name="userNotes"
                    defaultValue={opportunity.userNotes ?? ""}
                    placeholder="例如：岗位方向匹配，先改一版 AI 产品项目经历，再决定是否投递。"
                    rows={5}
                  />
                </label>
                <button className="button secondary" type="submit">
                  保存备注
                </button>
              </form>
            </div>
          </section>

          <section className="section">
            <h2>投递管理</h2>
            <div className="section-body">
              <form action={updateApplicationInfo} className="stack-form">
                <input name="opportunityId" type="hidden" value={opportunity.id} />
                <label>
                  <span>投递时间</span>
                  <input name="appliedAt" type="date" defaultValue={applicationInfo.appliedAt} />
                </label>
                <label>
                  <span>投递渠道</span>
                  <input name="applicationChannel" placeholder="官网 / 内推 / 牛客 / 邮件" defaultValue={applicationInfo.applicationChannel} />
                </label>
                <label>
                  <span>简历版本</span>
                  <input name="resumeVersion" placeholder="例如：BME 产品经理 v2" defaultValue={applicationInfo.resumeVersion} />
                </label>
                <label>
                  <span>内推人/联系人</span>
                  <input name="referrer" placeholder="姓名、微信或邮箱" defaultValue={applicationInfo.referrer} />
                </label>
                <label>
                  <span>投递账号/邮箱</span>
                  <input name="applicationAccount" placeholder="使用哪个账号投递" defaultValue={applicationInfo.applicationAccount} />
                </label>
                <label>
                  <span>下一场面试时间</span>
                  <input name="nextInterviewAt" type="datetime-local" defaultValue={applicationInfo.nextInterviewAt} />
                </label>
                <label>
                  <span>面试/笔试/测评进展</span>
                  <input name="interviewRound" placeholder="笔试待完成 / 测评已提交 / 一面 / 二面 / HR 面 / 终面" defaultValue={applicationInfo.interviewRound} />
                </label>
                <label>
                  <span>最近跟进时间</span>
                  <input name="lastFollowUpAt" type="date" defaultValue={applicationInfo.lastFollowUpAt} />
                </label>
                <label>
                  <span>跟进提醒时间</span>
                  <input name="followUpAt" type="date" defaultValue={applicationInfo.followUpAt} />
                </label>
                <label>
                  <span>截止时间</span>
                  <input name="deadlineAt" type="date" defaultValue={formatDateInput(opportunity.deadlineAt)} />
                </label>
                <label>
                  <span>结束原因</span>
                  <input name="closeReason" placeholder="已截止 / 无 HC / 已拒 / 主动放弃" defaultValue={applicationInfo.closeReason} />
                </label>
                <label>
                  <span>投递备注</span>
                  <textarea name="applicationNotes" rows={4} placeholder="记录投递材料、沟通情况或注意事项" defaultValue={applicationInfo.applicationNotes} />
                </label>
                <button className="button secondary" type="submit">
                  保存投递信息
                </button>
              </form>
            </div>
          </section>

          <section className="section">
            <h2>推进记录</h2>
            <div className="section-body">
              {opportunity.timelines.length === 0 ? (
                <p className="muted">还没有推进记录。</p>
              ) : (
                opportunity.timelines.map((event) => (
                  <p key={event.id}>
                    <strong>{event.title}</strong>
                    <br />
                    <span className="muted">
                      {getTimelineEventLabel(event.eventType)} · {getTimelineActorLabel(event.actorType)} · {event.createdAt.toLocaleString()}
                    </span>
                    {event.body ? (
                      <>
                        <br />
                        <span>{event.body}</span>
                      </>
                    ) : null}
                  </p>
                ))
              )}
            </div>
          </section>

          <section className="section">
            <h2>求职材料</h2>
            <div className="section-body">
              <form action={uploadOpportunityMaterial} className="stack-form material-upload-form">
                <input name="opportunityId" type="hidden" value={opportunity.id} />
                <label>
                  <span>上传材料</span>
                  <input name="materialFile" type="file" accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp" required />
                </label>
                <button className="button secondary" type="submit">
                  上传
                </button>
              </form>
              {opportunity.attachments.length === 0 ? (
                <p className="muted">支持上传 PDF、Word 文档或图片格式。</p>
              ) : (
                <div className="attachment-list">
                  {opportunity.attachments.map((attachment) => (
                    <a href={attachment.storagePath} key={attachment.id} rel="noreferrer" target="_blank">
                      <strong>{attachment.filename}</strong>
                      <span>{Math.max(1, Math.round(attachment.fileSize / 1024))} KB</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
