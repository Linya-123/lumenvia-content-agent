import { listJobs, getJob } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 历史运行记录
 * ------------------------------------------------------------
 * GET /api/jobs            → 列表（按时间倒序，不含 HTML，保证响应轻量）
 * GET /api/jobs?id=xxx     → 单条详情（含产出页，用于"查看旧内容"）
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (id) {
    const job = getJob(id);
    if (!job) {
      return Response.json({ ok: false, error: '记录不存在或已过期（内存保留 6 小时）' }, { status: 404 });
    }
    return Response.json({ ok: true, job });
  }

  return Response.json({ ok: true, jobs: listJobs() });
}