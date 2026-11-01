import { getJob } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 产出页直出
 * ------------------------------------------------------------
 * GET /api/preview/{jobId}?locale=en          → 浏览器直接打开（可分享 / 可刷新）
 * GET /api/preview/{jobId}?locale=en&dl=1     → 下载成 .html 文件
 *
 * 之前前端用 window.open('') + document.write 注入，地址栏只能显示 about:blank，
 * 内容不在服务器上，既没法刷新也没法当文件交出去。这里改成真实 URL。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const locale = url.searchParams.get('locale');
  const download = url.searchParams.get('dl') === '1';

  const job = getJob(id);
  if (!job) {
    return new Response('<h1>404</h1><p>该任务不存在或已过期（保留 6 小时）。</p>', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const pages = job.pages ?? [];
  const page = (locale && pages.find((p) => p.locale === locale)) || pages[0];
  if (!page) {
    return new Response('<h1>404</h1><p>该任务还没有产出页面。</p>', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // slug 在 S8 已拼过语种后缀，避免出现 xxx-de-de.html
  const baseSlug = (page.slug || 'landing-page').replace(new RegExp(`-${page.locale}$`), '');
  const filename = `${baseSlug}-${page.locale}.html`;
  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    // 页面是自包含单文件，允许在浏览器里直接预览
    'X-Content-Type-Options': 'nosniff',
  };
  if (download) {
    headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  }

  return new Response(page.html, { headers });
}