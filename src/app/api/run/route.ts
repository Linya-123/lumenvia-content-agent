import {
  stage1Rules, stage2Topic, stage3Outline, stage4Generate,
  stage5Lint, stage6Semantic, stage7Readiness, firstViolationsPerLocale,
} from '@/lib/pipeline';
import { getBrandConfig, getProductFacts } from '@/lib/brand';
import { createJob, logStage, finishJob, getJob } from '@/lib/store';
import { matchExample, exampleById } from '@/lib/examples';
import type { JobSpec, Market, StageEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  market: Market;
  locales: string[];
  category: string;
  topic: string;
  intent?: string;
  /** 用户原始输入：用于匹配三条示例提示词 */
  prompt?: string;
  /** 也可以直接指定示例 id（前端点击示例时传） */
  exampleId?: string;
  /**
   * 续写修订：父记录 id。给了它就在原会话里"接着改"，
   * 而不是从头重跑 —— 上一版文案会作为 baseline 发给模型。
   */
  parentId?: string;
  /** 修订指令：用户在已有页面上提的修改要求 */
  instruction?: string;
};

/**
 * POST /api/run
 * 以 SSE 推进 9 个阶段。产出 HTML 随 done 事件直接返回，
 * 前端用 iframe srcdoc 渲染 —— 不依赖任何持久化存储。
 */
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const brand = getBrandConfig();
  // 续写模式：取父记录的结构化文案作为上一版
  const parent = body.parentId ? getJob(body.parentId) : null;
  const revision =
    parent && body.instruction?.trim()
      ? {
          instruction: body.instruction.trim(),
          previousByLocale: (parent.copyByLocale ?? {}) as Record<string, import('@/lib/examples').LocaleCopy>,
        }
      : undefined;

  const spec: JobSpec = {
    market: body.market,
    locales: body.locales?.length ? body.locales : ['en'],
    category: body.category ?? 'outdoor-lighting',
    topic: body.topic ?? 'outdoor solar security lighting',
    intent: body.intent ?? '',
    brandName: brand.name,
    domain: brand.domain,
    // site 表示"当前渲染语种"，写死 'en' 会让德语/西语页拿到英文 title 与 meta
    site: (body.locales?.[0] ?? 'en'),
    slug: 'outdoor-solar-security-lighting',
    title: '',
    metaDesc: '',
  };

  const job = createJob({
    prompt: body.instruction?.trim() || body.prompt,
    market: spec.market, locales: spec.locales,
    category: spec.category, topic: spec.topic,
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      let closed = false;
      const send = (e: StageEvent | Record<string, unknown>) => {
        if (closed) return;
        try {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch { closed = true; }
      };
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const stage = (
        n: number, status: 'running' | 'ok' | 'retried' | 'failed',
        summary: string, attempt = 1, detail?: unknown,
      ) => {
        send({ kind: 'stage', stage: n, status, summary, detail });
        logStage(job.id, n, status, summary, attempt, detail);
      };

      try {
        /* ---------- 示例命中判定 ---------- */
        const hit = body.exampleId ? exampleById(body.exampleId) : matchExample(body.prompt);
        const fromExample = !!hit;

        /* ---------- S0 需求澄清 ---------- */
        stage(0, 'running', '已确认');
        send({
          kind: 'message',
          content: hit
            ? `命中示例提示词「**${hit.label}**」，本次走**预置快照**：不调用模型、不消耗额度，结果与真实运行一致。`
            : `任务单已锁定：目标市场 **${spec.market}**，语种 ${spec.locales.join(' / ')}，品类 ${spec.category}。开始执行。`,
        });
        stage(0, 'ok', hit ? '示例命中' : '已确认', 1, { ...spec, example: hit?.id ?? null });
        await sleep(180);

        /* ---------- S1 规则加载 ---------- */
        stage(1, 'running', '检索中');
        const r1 = await stage1Rules(spec.market, spec.category);
        stage(1, 'ok', r1.summary, 1, r1.detail);
        if (r1.citations?.length) send({ kind: 'citation', citations: r1.citations });
        send({
          kind: 'message',
          content: `已加载 **${r1.summary}**。这些约束在生成前注入，而不是写完再改。`,
        });
        await sleep(180);

        /* ---------- S2 选题定档 ---------- */
        stage(2, 'running', '判断中');
        const r2 = await stage2Topic(spec.market, spec.category);
        stage(2, 'ok', r2.summary, 1, r2.detail);
        send({
          kind: 'message',
          content: `选题判断：**${r2.decision.topic}**，优先级 ${r2.decision.priority}。\n理由：${r2.decision.reason}`,
        });
        await sleep(180);

        /* ---------- S3 结构规划（模型） ---------- */
        stage(3, 'running', fromExample ? '读取示例' : '规划中');
        const loadedRules = ((r1.detail as { rules?: Array<{ ruleId?: string; title?: string }> })?.rules ?? [])
          .map((x) => ({ ruleId: x.ruleId, title: x.title ?? '' }));
        const r3 = await stage3Outline(spec, loadedRules, hit?.outline);
        stage(3, 'ok', r3.summary, 1, r3.detail);
        if (r3.citations?.length) send({ kind: 'citation', citations: r3.citations });
        await sleep(150);

        /* ---------- S4 生成（模型） ---------- */
        stage(4, 'running', fromExample ? '读取示例' : '生成中');
        const facts = getProductFacts(spec.locales[0], brand);
        // 不在这里预设 title：多语种页面各有各的标题，交给 S4 按 locale 逐页计算
        const title = '';
        const metaDesc = '';
        const cachedCopy: Record<string, import('@/lib/examples').LocaleCopy> = {};
        for (const [loc, cp] of Object.entries(hit?.localesCopy ?? {})) cachedCopy[loc] = cp;

        const r4 = await stage4Generate({ ...spec, title, metaDesc }, facts, {
          modules: r3.outline.modules,
          cachedCopy,
          revision,
        });
        stage(4, 'ok', r4.summary, 1, { sources: r4.sources });
        // 模型生成的标题才是真标题，回填给 S8 组装
        const firstHtml = r4.pages[0]?.html ?? '';
        const genTitle = /<title>([^<]+)<\/title>/i.exec(firstHtml)?.[1] ?? title;
        await sleep(150);

        /* ---------- S5 确定性校验 ---------- */
        stage(5, 'running', '校验中');
        const preViolations = firstViolationsPerLocale(r4.pages, spec.market);
        const r5 = await stage5Lint(r4.pages, spec.market);

        if (preViolations.length) {
          stage(5, 'retried', `${r5.retried.join('/')} 未通过`, 1, { violations: preViolations });
          const f = preViolations[0];
          send({
            kind: 'message',
            content: `**质检拦截**：${f.locale} 语种未通过。\n「${f.matched}」属${f.type}，命中规则 \`${f.ruleId}\`（${f.location}）。已打回重写。`,
          });
          await sleep(500);
        }
        stage(
          5, r5.violations.length ? 'failed' : 'ok',
          r5.violations.length ? `仍有 ${r5.violations.length} 项缺失` : '重试后通过',
          2, { remaining: r5.violations },
        );
        await sleep(150);

        /* ---------- S6 语义质检 ---------- */
        stage(6, 'running', fromExample ? '读取示例' : '评分中');
        const ruleIds = ((r1.detail as { rules?: Array<{ ruleId?: string }> })?.rules ?? [])
          .map((x) => x.ruleId ?? '').filter(Boolean);
        const r6 = hit?.judge
          ? { summary: `${hit.judge.score} 分`, score: hit.judge.score, issues: hit.judge.issues, judge: 'cache:example' }
          : await stage6Semantic(spec, r5.pages[0], ruleIds);
        stage(6, 'ok', r6.summary, 1, { issues: r6.issues, judge: r6.judge });
        await sleep(150);

        /* ---------- S7 引用就绪度 ---------- */
        stage(7, 'running', '打分中');
        const sku = facts.find((f) => f.label === 'sku')?.value ?? '';
        const r7 = await stage7Readiness(r5.pages, brand.name, sku);
        stage(7, 'ok', r7.summary, 1, r7.readiness);
        await sleep(150);

        /* ---------- S8 组装 ---------- */
        stage(8, 'running', '组装中');
        const pages = r5.pages.map((p) => {
          // 每页 title 从自己的 HTML 里取（各语种已渲染成对应语言），取不到才回落到模板
          const own = /<title>([^<]+)<\/title>/i.exec(p.html)?.[1]?.trim();
          return {
            locale: p.locale,
            slug: `${spec.slug}-${p.locale}`,
            title: own || `${buildTitle({ ...spec, site: p.locale }).replace(/ \| .*$/, '')} | ${brand.name}`,
            metaDesc: buildMeta(p.locale),
            html: p.html,
            readiness: r7.readiness,
          };
        });
        stage(8, 'ok', `${pages.length} 个页面`, 1, { locales: pages.map((p) => p.locale) });

        finishJob(job.id, {
          status: 'done',
          topicDecision: r2.decision,
          readiness: r7.readiness,
          semanticScore: r6.score,
          pages,
          // 存下结构化文案：下次「继续调整」时作为上一版 baseline
          copyByLocale: r4.copyByLocale,
        });

        send({
          kind: 'message',
          content: `完成。共产出 **${pages.length} 个语种**落地页${r5.retried.length ? `，${r5.retried.join('/')} 曾被打回后修复` : '，一次通过'}。\n\n产出摘要：\n- 引用就绪度：事实密度 ${r7.readiness.factDensity} / 来源标注 ${r7.readiness.citationCoverage} / 实体一致性 ${r7.readiness.entityConsistency} / 可抓取性 ${r7.readiness.crawlability}\n- 语义质检：${r6.score} / 100\n- 确定性校验：${r5.violations.length ? `${r5.violations.length} 项待处理` : '全部通过'}`,
        });

        // 产出 HTML 随响应返回，前端直接渲染，无需再请求
        send({
          kind: 'done',
          jobId: job.id,
          mode: hit ? 'example' : 'live',
          exampleId: hit?.id ?? null,
          outlineSource: r3.outline.source,
          copySources: r4.sources,
          pages: pages.map((p) => ({
            locale: p.locale, slug: p.slug, title: p.title,
            metaDesc: p.metaDesc, html: p.html,
          })),
          readiness: r7.readiness,
          semanticScore: r6.score,
        });
      } catch (e) {
        console.error('[run] 失败', e);
        finishJob(job.id, { status: 'failed' });
        send({ kind: 'error', message: (e as Error).message || '执行失败' });
      } finally {
        closed = true;
        try { ctrl.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function buildTitle(spec: JobSpec): string {
  const map: Record<string, string> = {
    en: 'Solar Security Lighting for Yard & Driveway',
    de: 'Solar-Sicherheitsleuchte für Einfahrt & Hof',
    es: 'Luz solar de seguridad para entradas y patios',
  };
  return `${map[spec.site] ?? map.en} | ${spec.brandName}`;
}

function buildMeta(locale: string): string {
  const map: Record<string, string> = {
    en: 'IP65 solar-powered security lighting for driveways, pathways and yards. No wiring required. Rated for outdoor installation year-round.',
    de: 'Solarbetriebene Sicherheitsleuchte mit Bewegungsmelder, IP65 für ganzjährige Außenmontage. Ohne Verkabelung.',
    es: 'Luz solar de seguridad con detector de movimiento, IP65 para instalación exterior todo el año. Sin cableado.',
  };
  return map[locale] ?? map.en;
}