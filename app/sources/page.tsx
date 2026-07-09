import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  if (!process.env.DATABASE_URL) {
    return (
      <>
        <header className="page-header">
          <div className="page-title">
            <h1>招聘渠道</h1>
            <p>管理岗位信息可能出现的渠道。</p>
          </div>
        </header>
        <div className="panel">
          <div className="empty">配置数据库后即可管理招聘渠道。</div>
        </div>
      </>
    );
  }

  const sources = await prisma.source.findMany({ orderBy: { name: "asc" } }).catch(() => []);

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>招聘渠道</h1>
          <p>管理岗位信息可能出现的渠道。</p>
        </div>
        <button className="button secondary" type="button">
          新增渠道
        </button>
      </header>

      <div className="panel">
        {sources.length === 0 ? (
          <div className="empty">还没有招聘渠道。请先初始化演示数据。</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>渠道</th>
                <th>类型</th>
                <th>接入方式</th>
                <th>启用</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>{source.name}</td>
                  <td>{source.type}</td>
                  <td>{source.adapterKey}</td>
                  <td>{source.enabled ? "是" : "否"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
