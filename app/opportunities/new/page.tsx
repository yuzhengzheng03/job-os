import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { manualImportService } from "@/src/services/manual-import-service";

export const dynamic = "force-dynamic";

async function getImportDefaults() {
  if (!process.env.DATABASE_URL) {
    return { user: null, sources: [] };
  }

  try {
    const [user, sources] = await Promise.all([
      prisma.user.findFirst({ orderBy: { createdAt: "asc" } }),
      prisma.source.findMany({ orderBy: { name: "asc" } })
    ]);

    return { user, sources };
  } catch {
    return { user: null, sources: [] };
  }
}

async function importOpportunity(formData: FormData) {
  "use server";

  const userId = String(formData.get("userId") ?? "");
  const sourceId = String(formData.get("sourceId") ?? "");
  const url = String(formData.get("url") ?? "");
  const rawText = String(formData.get("rawText") ?? "");
  const companyName = String(formData.get("companyName") ?? "");
  const title = String(formData.get("title") ?? "");
  const location = String(formData.get("location") ?? "");

  const result = await manualImportService.import({
    userId,
    sourceId,
    url,
    rawText,
    companyName: companyName || undefined,
    title: title || undefined,
    location: location || undefined
  });

  redirect(`/opportunities/${result.opportunity.id}`);
}

export default async function NewOpportunityPage() {
  const { user, sources } = await getImportDefaults();

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>录入新岗位</h1>
          <p>粘贴岗位链接和 JD 原文，Job OS 会保存机会、生成岗位解读，并进入详情页。</p>
        </div>
        <div className="toolbar">
          <Link className="button secondary" href="/opportunities">
            返回工作台
          </Link>
        </div>
      </header>

      <section className="section">
        <h2>岗位信息</h2>
        <div className="section-body">
          {!user || sources.length === 0 ? (
            <p className="muted">请先初始化演示数据，再录入岗位。</p>
          ) : (
            <form action={importOpportunity} className="form-grid">
              <input name="userId" type="hidden" value={user.id} />

              <label>
                <span>信息来源</span>
                <select name="sourceId" required defaultValue={sources[0]?.id}>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>岗位链接</span>
                <input name="url" placeholder="https://..." required type="url" />
              </label>

              <label>
                <span>公司</span>
                <input name="companyName" placeholder="例如：腾讯" />
              </label>

              <label>
                <span>岗位名称</span>
                <input name="title" placeholder="例如：AI 产品经理" />
              </label>

              <label>
                <span>城市</span>
                <input name="location" placeholder="例如：上海" />
              </label>

              <label className="full">
                <span>岗位原文</span>
                <textarea name="rawText" placeholder="粘贴 JD、招聘正文或岗位描述" required rows={12} />
              </label>

              <div className="form-actions full">
                <button className="button" type="submit">
                  保存并生成解读
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

