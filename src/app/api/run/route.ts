import {
  stage1Rules, stage2Topic, stage3Outline, stage4Generate,
  stage5Lint, stage6Semantic, stage7Readiness, firstViolationsPerLocale,
} from '@/lib/pipeline';
import { getBrandConfig, getProductFacts } from '@/lib/brand';
import { normalizeEvidenceDocs, evidencePublicSummary, type EvidenceInput } from '@/lib/evidence';
import { readLimitedRequestJson, validateRunRequest } from '@/lib/request-validation';
import { auditGeneratedPages } from '@/lib/claim-audit';
import { detectTaskIntent, extractAuditCopy } from '@/lib/task-router';
import { lintPage } from '@/lib/lint';
import { createJob, logStage, finishJob, getJob } from '@/lib/store';
import { exampleById } from '@/lib/examples';
import { parseMarketCsv } from '@/lib/market-data';
import type { JobSpec, Market, StageEvent } from '@/lib/types';
import { createUsageLedger, runWithUsageLedger, usageSnapshot } from '@/lib/llm-metrics';
import { auditRenderedMetrics, traceRenderedMetrics } from '@/lib/fact-guard';
import { buildProductProfile, missingProductInfo, type SubmittedFact } from '@/lib/product-profile-v9';
import { inspectFinalPage } from '@/lib/claim-engine-v9';
import {extractProductTopic, localizedProductName} from '@/lib/task-intake-v92';

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
  evidenceDocs?: EvidenceInput[];
  marketCsv?: string;
  productFacts?: SubmittedFact[];
};

/**
 * POST /api/run
 * 以 SSE 推进 9 个阶段。产出 HTML 随 done 事件直接返回，
 * 前端用 iframe srcdoc 渲染 —— 不依赖任何持久化存储。
 */
export async function POST(req: Request) {
  let body: Body;
  let evidenceDocs: ReturnType<typeof normalizeEvidenceDocs>;
  let marketRows: ReturnType<typeof parseMarketCsv> | undefined;
  try {
    body = validateRunRequest(await readLimitedRequestJson(req)) as Body;
    evidenceDocs = normalizeEvidenceDocs(body.evidenceDocs);
    if (body.marketCsv) marketRows = parseMarketCsv(body.marketCsv);
  } catch (e) {
    return Response.json({ error: (e as Error).message || '任务或证据格式错误' }, { status: 400 });
  }
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

  const rawPrompt=body.prompt??'';
  const defaultTopic=body.topic==='outdoor solar security lighting';
  const clearlyLighting=/太阳能灯|感应灯|照明|路灯|灯具|\blight(?:ing)?\b|\blamp\b|beleuchtung|luminaria/iu.test(rawPrompt);
  const promptNonLighting=rawPrompt.length>8 && !clearlyLighting && !body.exampleId;
  const manualNonLightingTopic=!defaultTopic && !/solar|太阳能|照明|灯具|lighting/iu.test(body.topic);
  const genericFromPrompt=body.category==='outdoor-lighting' && (promptNonLighting || manualNonLightingTopic);
  const resolvedCategory=genericFromPrompt?'general-product':body.category;
  // The user may only type in the chat while the demo topic field is untouched.
  // A chat request is not a product name. Never echo a full instruction into the public title.
  const extractedName=extractProductTopic(rawPrompt);
  const resolvedTopic=defaultTopic && promptNonLighting
    ? (extractedName||'Product')
    :defaultTopic && body.category!=='outdoor-lighting'
      ? (extractedName||body.category)
      :body.topic;
  const spec: JobSpec = {
    market: body.market,
    locales: body.locales?.length ? body.locales : ['en'],
    category: resolvedCategory,
    topic: resolvedTopic,
    intent: body.intent ?? '',
    brandName: brand.name,
    domain: brand.domain,
    // site 表示"当前渲染语种"，写死 'en' 会让德语/西语页拿到英文 title 与 meta
    site: (body.locales?.[0] ?? 'en'),
    slug: resolvedCategory==='outdoor-lighting'?'outdoor-solar-security-lighting':(localizedProductName(resolvedTopic,'en').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'product'),
    title: '',
    metaDesc: '',
    userRequest: body.prompt ?? '',
  };

  const job = createJob({
    prompt: body.instruction?.trim() || body.prompt,
    market: spec.market, locales: spec.locales,
    category: spec.category, topic: spec.topic,
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const llmUsage = createUsageLedger();
      return runWithUsageLedger(llmUsage, async () => {
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
        // Only explicitly selected samples may use snapshots; normal prompts are genuine runs.
        const hit = body.exampleId ? exampleById(body.exampleId) : null;
        const fromExample = !!hit;
        // Explicit demo snapshots are isolated; ordinary tasks only use current user facts.
        const profileV9 = fromExample ? null : buildProductProfile(
          parent?.profileV9 && revision ? (parent.prompt ?? '') : (body.prompt ?? ''),
          parent?.profileV9 && revision
            ? parent.profileV9.filter(f=>f.sourceType==='user_entry').map(f=>({field:f.field,value:f.value}))
            : (body.productFacts ?? []),
        );
        const missingV9 = profileV9 ? missingProductInfo(profileV9,spec.category) : [];

        /* ---------- S0 需求澄清 ---------- */
        stage(0, 'running', '已确认');
        send({
          kind: 'message',
          content: hit
            ? `命中示例提示词「**${hit.label}**」，本次使用**预置快照**：不调用模型、不消耗额度。快照仅供演示，不能代表本次真实模型生成结果。`
            : `任务单已锁定：目标市场 **${spec.market}**，语种 ${spec.locales.join(' / ')}，品类 ${spec.category}。开始执行。`,
        });
        stage(0, 'ok', hit ? '示例命中' : '已确认', 1, { ...spec, example: hit?.id ?? null,
          factsMode:fromExample?'fictional_demo':'user_input', factCount:profileV9?.length ?? 0 });
        await sleep(180);

        /* ---------- S1 规则加载 ---------- */
        stage(1, 'running', '检索中');
        const r1 = await stage1Rules(spec.market, spec.category);
        stage(1, 'ok', r1.summary, 1, r1.detail);
        if (r1.citations?.length) send({ kind: 'citation', citations: r1.citations });
        send({
          kind: 'message',
          content: `S1：**${r1.summary}**。通用风险检查继续执行；没有品类专属资料时，不宣称覆盖该行业全部法规。`,
        });
        await sleep(180);

        // Task router: focused requests should not generate a whole marketing page.
        const taskIntent = detectTaskIntent(body.prompt ?? '', !!revision);
        if (taskIntent === 'audit_copy') {
          const copyToCheck = extractAuditCopy(body.prompt ?? '');
          if (!copyToCheck) {
            send({ kind:'message', content:'请在“审核：”后粘贴要审核的具体文案，例如：审核：This product is CE certified。' });
            finishJob(job.id, {status:'failed'});
            return;
          }
          const html = `<p>${copyToCheck.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`;
          const locale = spec.locales[0] ?? 'en';
          const lintIssues = lintPage({locale, market:spec.market, bodyText:copyToCheck, html});
          const claimReport = auditGeneratedPages([{locale,html}],evidenceDocs);
          stage(5, lintIssues.length || claimReport.issues.length ? 'failed' : 'ok',
            `规则风险 ${lintIssues.length} 项，声明复核 ${claimReport.issues.length} 项`,1,
            {lintIssues,claimIssues:claimReport.issues});
          send({kind:'audit',report:{...claimReport,submittedDocs:evidencePublicSummary(evidenceDocs)}});
          const summaries = [...lintIssues.map(x=>`${x.ruleId}: ${x.message}`),
            ...claimReport.issues.map(x=>`${x.ruleId}: ${x.reason}`)];
          send({kind:'message',content:summaries.length
            ? `文案审查报告（自动筛查，非法律意见）：
${summaries.map((x,i)=>`${i+1}. ${x}`).join('\n')}`
            : '未在当前规则集合中发现风险表述，但不代表已通过独立法律和产品事实核验。'});
          finishJob(job.id,{status:'done'});
          send({kind:'done',jobId:job.id,mode:'rule-audit',pages:[]});
          return;
        }
        if (taskIntent === 'analyze_market') {
          const analysis = await stage2Topic(spec,marketRows,(profileV9??[]).map(f=>({label:f.field,value:f.value})));
          stage(2,'ok',analysis.summary,1,analysis.detail);
          send({kind:'message',content:`选题分析（${analysis.decision.source==='uploaded_csv' ? '本次CSV' : '动态内容建议'}）：${analysis.decision.topic}。
${analysis.decision.reason}`});
          finishJob(job.id,{status:'done',topicDecision:analysis.decision});
          send({kind:'done',jobId:job.id,mode:'market-analysis',pages:[]});
          return;
        }

        /* ---------- S2 选题定档 ---------- */
        stage(2, 'running', '判断中');
        const r2 = await stage2Topic(spec, marketRows,(profileV9??[]).map(f=>({label:f.field,value:f.value})));
        stage(2, 'ok', r2.summary, 1, r2.detail);
        send({
          kind: 'message',
          content: `S2 ${r2.summary}：**${r2.decision.topic}**。\n理由：${r2.decision.reason}`,
        });
        await sleep(180);

        /* ---------- S3 结构规划（模型） ---------- */
        stage(3, 'running', fromExample ? '读取示例' : '规划中');
        const loadedRules = ((r1.detail as { rules?: Array<{ ruleId?: string; title?: string }> })?.rules ?? [])
          .map((x) => ({ ruleId: x.ruleId, title: x.title ?? '' }));
        const r3 = await stage3Outline(spec, loadedRules, hit?.outline, r2.decision,profileV9?.length??0);
        stage(3, 'ok', r3.summary, 1, r3.detail);
        if (r3.citations?.length) send({ kind: 'citation', citations: r3.citations });
        await sleep(150);

        /* ---------- S4 生成（模型） ---------- */
        stage(4, 'running', fromExample ? '读取示例' : '生成中');
        const facts = fromExample ? getProductFacts(spec.locales[0], brand)
          : (profileV9 ?? []).map(f=>({label:f.field,value:f.value,sourceId:f.sourceId}));
        // 不在这里预设 title：多语种页面各有各的标题，交给 S4 按 locale 逐页计算
        const title = '';
        const metaDesc = '';
        const cachedCopy: Record<string, import('@/lib/examples').LocaleCopy> = {};
        for (const [loc, cp] of Object.entries(hit?.localesCopy ?? {})) cachedCopy[loc] = cp;

        const r4 = await stage4Generate({ ...spec, title, metaDesc }, facts, {
          modules: r3.outline.modules,
          design: r3.outline.design,
          cachedCopy,
          revision,
          evidenceDocs,
          factsByLocale: Object.fromEntries(spec.locales.map((locale) => [locale, fromExample
            ? getProductFacts(locale, brand) : facts])),
          ...(profileV9 ? {profileV9} : {}),
          focusAreas:r2.decision.focusAreas,
        });
        stage(4, 'ok', r4.summary, 1, { sources: r4.sources, factGuard: r4.factGuard,
          claimsReviewed:r4.claimsV9.length, missingFields:missingV9.length, publicFaqEditorial:r4.editorialV91.length });
        // 模型生成的标题才是真标题，回填给 S8 组装
        const firstHtml = r4.pages[0]?.html ?? '';
        const genTitle = /<title>([^<]+)<\/title>/i.exec(firstHtml)?.[1] ?? title;
        await sleep(150);

        send({ kind: 'message', content: evidenceDocs.length
          ? `本次附带 ${evidenceDocs.length} 份文本资料。注意：资料只作为人工复核线索，系统不会仅凭上传自动认定认证有效。`
          : '本次未提供产品佐证文件；已提供的用户资料尚未独立核实。' });

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
          r5.violations.length ? `仍有 ${r5.violations.length} 项违规` : r5.retried.length ? '修复后通过' : '一次通过',
          r5.retried.length ? 2 : 1, { remaining: r5.violations },
        );
        await sleep(150);

        // 关键质量门：仍然存在违规时，不得把该页面标记为成功产出。
        if (r5.violations.length > 0) {
          finishJob(job.id, { status: 'failed' });
          send({
            kind: 'error',
            message: `质量校验仍有 ${r5.violations.length} 项未解决。已阻止将本次内容作为合格成品交付；请人工核查后重试。`,
            violations: r5.violations,
          });
          return;
        }

        // Last-mile source-fact gate: audit rendered visible text, not only LLM JSON.
        // Unrecognized measurable values must not silently ship as approved product specs.
        const residualMetrics = r5.pages.flatMap(p => (profileV9
          ? inspectFinalPage(p.html, profileV9, p.locale)
          : auditRenderedMetrics(p.html, getProductFacts(p.locale, brand)))
          .map(value => ({ locale:p.locale, value })));
        if (residualMetrics.length) {
          stage(5, 'failed', `仍有 ${residualMetrics.length} 项无资料支撑的具体参数`, 3, {residualMetrics});
          finishJob(job.id, { status:'failed' });
          send({kind:'error', message:'产品参数证据门未通过，已阻止交付为合格网页。请人工核查。',residualMetrics});
          return;
        }
        const evidenceAudit = auditGeneratedPages(r5.pages, evidenceDocs);
        send({
          kind: 'audit',
          report: {
            ...evidenceAudit,
            submittedDocs: evidencePublicSummary(evidenceDocs),
          },
        });
        if (evidenceAudit.issues.length) {
          stage(5, 'failed', `仍有 ${evidenceAudit.issues.length} 项声明缺少核验`, 3, evidenceAudit);
          finishJob(job.id, { status: 'failed' });
          send({
            kind: 'error',
            message: `证据筛查发现 ${evidenceAudit.issues.length} 项风险声明，文件未经过独立核验；请检查声明后重试。`,
          });
          return;
        }

        /* ---------- S6 语义质检 ---------- */
        stage(6, 'running', fromExample ? '读取示例' : '评分中');
        const ruleIds = ((r1.detail as { rules?: Array<{ ruleId?: string }> })?.rules ?? [])
          .map((x) => x.ruleId ?? '').filter(Boolean);
        const r6 = hit?.judge
          ? { summary: `${hit.judge.score} 分`, score: hit.judge.score, issues: hit.judge.issues, judge: 'cache:example' }
          : await stage6Semantic(spec, r5.pages[0], ruleIds);
        stage(6, r6.score===null?'failed':'ok', r6.summary, 1, { issues: r6.issues, score:r6.score, judge: r6.judge, scoringType:r6.judge==='stub-heuristic'?'offline':r6.score===null?'unavailable':'llm' });
        await sleep(150);

        /* ---------- S7 引用就绪度 ---------- */
        stage(7, 'running', '打分中');
        const sku = facts.find((f) => f.label === 'sku')?.value ?? '';
        const r7 = await stage7Readiness(r5.pages, brand.name, sku);
        stage(7, 'ok', r7.readiness.pass ? r7.summary : `${r7.summary} · 需人工审核`, 1, r7.readiness);
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
            metaDesc: /<meta\s+name="description"\s+content="([^"]*)"/i.exec(p.html)?.[1] ?? '',
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
          ...(profileV9 ? {profileV9,claimsV9:r4.claimsV9,missingV9,editorialV91:r4.editorialV91} : {}),
        });

        const reviewStatus = {
          publicationReady: false,
          label: '生成完成，待人工核验，不可直接商用发布',
          reasons: [
            profileV9 ? '本次产品信息来自用户输入，尚未独立核验' : '产品是虚构演示数据，原始参数尚无独立检验证据',
            ...(!r7.readiness.pass ? ['引用就绪度未达到全部门槛'] : []),
            ...(r4.factGuard.length ? [`已暂缓 ${r4.factGuard.length} 处缺少资料支撑的数字声明`] : []),
            ...(profileV9 ? [`${r4.claimsV9.filter(x=>x.action==='safe_rewrite').length} 条声明已安全改写`,
              `${r4.claimsV9.filter(x=>x.action==='withheld').length} 条高风险FAQ声明已移出消费者页面`,
              `${missingV9.length} 项建议补充的产品资料`,
              `${r4.editorialV91.filter(x=>x.action==='excluded_from_public_page').length} 条资料不足的FAQ已从消费者页面移至后台记录`] : []),
          ],
          factGuard: r4.factGuard,
          factTrace: profileV9 ? [] : r5.pages.flatMap(p => traceRenderedMetrics(
            p.html, getProductFacts(p.locale, brand),
          ).map(trace => ({ locale:p.locale, ...trace }))),
          profile: profileV9 ?? [],
          claims: r4.claimsV9,
          missingInfo: missingV9,
          editorial: r4.editorialV91,
        };
        send({
          kind: 'message',
          content: `完成。共产出 **${pages.length} 个语种**落地页${r5.retried.length ? `，${r5.retried.join('/')} 曾被打回后修复` : '，一次通过'}。\n\n产出摘要：\n- 引用就绪度：事实密度 ${r7.readiness.factDensity} / 结构化标注（非证据核验） ${r7.readiness.citationCoverage} / 实体一致性 ${r7.readiness.entityConsistency} / 可抓取性 ${r7.readiness.crawlability}\n- 语义质检：${r6.score===null?'模型质检不可用':`${r6.score} / 100（${r6.judge==='stub-heuristic'?'离线规则':'模型'}）`}\n- 确定性校验：${r5.violations.length ? `${r5.violations.length} 项待处理` : '全部通过'}\n- 发布状态：需人工核验（生成完成不代表具备商用发布资格）\n- 数字声明暂缓：${r4.factGuard.length} 处`,
        });

        // 产出 HTML 随响应返回，前端直接渲染，无需再请求
        send({
          kind: 'done',
          jobId: job.id,
          mode: hit ? 'example' : r4.sources.some((s) => s.source === 'llm') ? 'live' : 'template',
          exampleId: hit?.id ?? null,
          outlineSource: r3.outline.source,
          copySources: r4.sources,
          pages: pages.map((p) => ({
            locale: p.locale, slug: p.slug, title: p.title,
            metaDesc: p.metaDesc, html: p.html,
          })),
          readiness: r7.readiness,
          semanticScore: r6.score,
          reviewStatus,
          tokenUsage: usageSnapshot(llmUsage),
        });
      } catch (e) {
        console.error('[run] 失败', e);
        finishJob(job.id, { status: 'failed' });
        send({ kind: 'error', message: (e as Error).message || '执行失败', tokenUsage: usageSnapshot(llmUsage) });
      } finally {
        closed = true;
        try { ctrl.close(); } catch { /* already closed */ }
      }
      });
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