'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import './globals.css';
import {extractProductTopic,resolveTaskLocales,resolveLocaleSelection,type OutputLanguagePreference} from '@/lib/task-intake-v92';

type StageState = 'idle' | 'running' | 'ok' | 'retried' | 'failed';
type EvidenceKind = 'product_manual' | 'test_report' | 'declaration' | 'other';
type EvidenceInput = { id: string; name: string; kind: EvidenceKind; text: string };
type V9Review = {
  profile: Array<{id:string;field:string;value:string;sourceId:string;verification:string}>;
  claims: Array<{id:string;locale:string;fieldPath:string;original:string;final:string;action:string;reason:string;factIds:string[];sourceIds:string[]}>;
  missingInfo: Array<{field:string;label:string;priority:string}>;
  publicationReady:boolean;label:string;reasons:string[];
  editorial?: Array<{locale:string;section:string;action:string;question:string;reason:string}>;
};
type EvidenceAudit = {
  issues: Array<{ locale: string; ruleId: string; matched: string; reason: string; candidateEvidenceIds: string[] }>;
  unreviewedCount: number;
  note: string;
};

type Msg = {
  role: 'agent' | 'user';
  text: string;
  citations?: Citation[];
  choices?: { label: string; value: string }[];
  choiceDisabled?: boolean;
};

type Citation = { ruleId?: string | null; title: string; source: string; zone: string };

type JobSummary = {
  id: string;
  market: string;
  locales: string[];
  category: string;
  topic: string;
  prompt?: string;
  status: 'running' | 'done' | 'failed';
  semanticScore: number | null;
  pageCount: number;
  createdAt: number;
  finishedAt: number | null;
};

type Readiness = {
  factDensity: number; citationCoverage: number;
  entityConsistency: number; crawlability: number;
  pass: boolean; details?: Record<string, string[]>;
};

const STAGES = [
  { id: 0, name: '需求澄清', desc: '自然语言 → 结构化任务单', isNew: true },
  { id: 1, name: '规则加载', desc: '目标市场 + 品类 → 硬约束清单', isNew: true },
  { id: 2, name: '选题定档', desc: '效果数据 + 内容缺口 → 选题与理由', isNew: true },
  { id: 3, name: '结构规划', desc: '选题 + 案例 → 页面大纲', isNew: false },
  { id: 4, name: '多语种生成', desc: '大纲 + 约束 → N 语种初稿', isNew: false },
  { id: 5, name: '确定性校验', desc: '禁词 / 必填字段 / 认证标识', isNew: false },
  { id: 6, name: '语义质检', desc: 'LLM 判官评分 + 打回原因', isNew: false },
  { id: 7, name: '引用就绪度', desc: '事实密度 / 来源 / 实体 / 可抓取', isNew: true },
  { id: 8, name: '产出组装', desc: '终稿 → 完整落地页 HTML', isNew: false },
];

const MARKETS = [
  { id: 'US', label: '美国（US）', locales: ['en'] },
  { id: 'DE', label: '德国（DE）', locales: ['de'] },
  { id: 'ES', label: '西班牙（ES）', locales: ['es'] },
  { id: 'EU', label: '三语种比较（US/DE/ES）', locales: ['en', 'de', 'es'] },
];

// 三个示例提示词：点一下直接执行，走预置快照（不调模型，不耗额度）
const EXAMPLES = [
  { id: 'us-solar-light', label: '美国 · 太阳能安防灯', prompt: '帮我做一个北美市场的户外太阳能安防灯落地页', market: 'US' },
  { id: 'de-solar-light', label: '德国 · 德语版', prompt: '德国市场的太阳能安防灯落地页，只要德语版', market: 'DE' },
  { id: 'eu-three-locale', label: '英语/德语/西语 · 演示', prompt: '户外太阳能灯落地页演示，要英文德语西班牙语三个版本', market: 'EU' },
];

// 富文本：只处理 **加粗** 与 `代码`
function renderRich(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}


/** 历史记录时间显示：今天显示时分，更早显示月日 */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export default function Page() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [stages, setStages] = useState<StageState[]>(Array(9).fill('idle'));
  const [stageStat, setStageStat] = useState<string[]>(Array(9).fill('待执行'));
  const [tab, setTab] = useState('pipeline');
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [semantic, setSemantic] = useState<{ score: number; issues: string[] } | null>(null);
  const [pages, setPages] = useState<Array<{ locale: string; slug: string; title: string; html: string }>>([]);
  const [activeLocale, setActiveLocale] = useState('en');
  const [kb, setKb] = useState<{ stats: Record<string, number>; groups: Record<string, Array<{ title: string; source: string }>> } | null>(null);
  const [llmMode, setLlmMode] = useState<string>('');
  /** 是否配了 key：没配就不允许切到在线 */
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmNote, setLlmNote] = useState('');
  const [kbTotal, setKbTotal] = useState(0);
  /** 是否开启了会话鉴权：开了才显示「退出登录」 */
  const [authOn, setAuthOn] = useState(false);
  const [marketCsv, setMarketCsv] = useState('');
  const [marketFile, setMarketFile] = useState('');
  const [marketCsvError, setMarketCsvError] = useState('');
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('product_manual');
  const [evidenceDocs, setEvidenceDocs] = useState<EvidenceInput[]>([]);
  const [evidenceError, setEvidenceError] = useState('');
  const [evidenceAudit, setEvidenceAudit] = useState<EvidenceAudit | null>(null);
  const [reviewV9,setReviewV9] = useState<V9Review | null>(null);
  const [productFactsText,setProductFactsText] = useState('');
  const [productFactsError,setProductFactsError] = useState('');

  async function importMarketCsv(file: File | undefined) {
    if (!file) return;
    try {
      if (!/\.csv$/i.test(file.name) || file.size > 100000) throw new Error('只能选择100 KB以内的CSV文件');
      const txt = await file.text();
      setMarketCsv(txt);
      setMarketFile(file.name);
      setMarketCsvError('');
    } catch (e) {
      setMarketCsv('');
      setMarketFile('');
      setMarketCsvError((e as Error).message);
    }
  }

  async function importEvidenceFiles(fileList: FileList | null) {
    if (!fileList) return;
    try {
      const files = Array.from(fileList);
      if (files.length > 3) throw new Error('每次最多添加3个文件');
      const docs: EvidenceInput[] = [];
      for (const [i, f] of files.entries()) {
        if (!/\.(txt|md|json)$/i.test(f.name)) throw new Error('仅支持纯文本 TXT、MD、JSON；PDF 不自动解析');
        if (f.size > 50000) throw new Error(`${f.name} 超出50 KB限制`);
        const text = await f.text();
        if (!text.trim() || text.length > 20000) throw new Error(`${f.name} 为空或超出文本长度限制`);
        docs.push({ id: `evidence_${Date.now()}_${i}`, name: f.name, kind: evidenceKind, text });
      }
      setEvidenceDocs(docs);
      setEvidenceError('');
    } catch (e) {
      setEvidenceError((e as Error).message);
      setEvidenceDocs([]);
    }
  }

  // 澄清表单
  const [market, setMarket] = useState('US');
  const [category, setCategory] = useState('outdoor-lighting');
  const [topic, setTopic] = useState('outdoor solar security lighting');
  // Explicit output language is independent of the target sales market.
  const [languagePreference,setLanguagePreference]=useState<OutputLanguagePreference>('auto');
  const [phase, setPhase] = useState<'idle' | 'askMarket' | 'ready'>('idle');
  const [runId, setRunId] = useState(0);
  const [exampleId, setExampleId] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  /** 续写基线：基于哪条记录继续改（null = 全新生成） */
  const [baseJobId, setBaseJobId] = useState<string | null>(null);
  /** 同步镜像 baseJobId：setState 是异步的，run() 在同一 tick 里读不到新值 */
  const baseJobRef = useRef<string | null>(null);

  const setBase = useCallback((v: string | null) => {
    baseJobRef.current = v;
    setBaseJobId(v);
  }, []);

  const chatRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const scroll = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => {
    scroll();
  }, [msgs, scroll]);

  // 初始：拉会话与环境信息
  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then((d) => {
        setLlmMode(d.llm);
        if (typeof d.llmConfigured === 'boolean') setLlmConfigured(d.llmConfigured);
        if (typeof d.kbEntries === 'number') setKbTotal(d.kbEntries);
        if (typeof d.authEnabled === 'boolean') setAuthOn(d.authEnabled);
      })
      .catch(() => {});

    fetch('/api/kb')
      .then((r) => r.json())
      .then((d) => { setKb(d); if (typeof d.total === 'number') setKbTotal(d.total); })
      .catch(() => setKb(null));

    setMsgs([
      {
        role: 'agent',
        text: '你好，我是 Lumenvia Content Agent。\n\n我可以为你产出面向目标市场的多语种落地页——先加载合规规则，再决定写什么，最后逐句校验。\n\n描述一下你的需求，比如「户外太阳能灯的落地页」。',
      },
    ]);
  }, []);

  /* ---------------- 历史记录 ---------------- */
  const loadJobs = useCallback(() => {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.jobs)) setJobs(d.jobs); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  /** 新建会话：清空当前工作台，回到初始提问状态 */
  function newSession() {
    if (running) {
      // 允许中途开新会话，但先说清楚正在跑的那次会继续
      pushMsg({ role: 'agent', text: '已新建会话。**上一次运行仍在后台继续**，完成后会出现在左侧历史里。' });
    }
    setMsgs([{
      role: 'agent',
      text: '新会话已开始。\n\n说说这次要做什么——选个示例，或直接描述需求。',
    }]);
    setStages(Array(9).fill('idle'));
    setStageStat(Array(9).fill('待执行'));
    setReadiness(null);
    setSemantic(null);
    setReviewV9(null);
    setProductFactsText('');
    setProductFactsError('');
    setPages([]);
    setCurrentJobId(null);
    setBase(null);
    setExampleId(null);
    setInput('');
    setMarket('US');
    setCategory('outdoor-lighting');
    setTopic('outdoor solar security lighting');
    setLanguagePreference('auto');
    setPhase('idle');
    setTab('pipeline');
    lastPrompt.current = '';
  }

  /** 打开一条历史记录：拉详情，重建成完整工作台状态 */
  async function openJob(id: string) {
    try {
      const r = await fetch(`/api/jobs?id=${id}`);
      const d = await r.json();
      if (!d.ok || !d.job) {
        pushMsg({
          role: 'agent',
          text: `无法打开该记录：${d.error ?? '未知错误'}。\n\n`
            + '历史记录保存在运行实例的内存中，在 Serverless 多实例部署下可能已随实例回收而失效。'
            + '重新执行一次即可重新生成。',
        });
        return;
      }
      const j = d.job as {
        id: string; market: string; locales: string[]; category: string; topic: string; prompt?: string;
        status: 'running' | 'done' | 'failed';
        semanticScore: number | null;
        stages: Array<{ stage: number; status: string; summary: string; detail?: unknown }>;
        pages: Array<{ locale: string; slug: string; title: string; metaDesc: string; html: string }>;
        readiness: Readiness | null;
      };

      // 重建九阶段状态
      const st = Array(9).fill('idle') as StageState[];
      const stat = Array(9).fill('待执行');
      for (const e of j.stages ?? []) {
        if (e.stage < 0 || e.stage > 8) continue;
        st[e.stage] = e.status as StageState;
        stat[e.stage] = e.summary ?? '';
      }
      setStages(st);
      setStageStat(stat);
      setReadiness(j.readiness ?? null);
      setReviewV9((j as typeof j & {profileV9?:V9Review['profile']; claimsV9?:V9Review['claims']; missingV9?:V9Review['missingInfo']}).profileV9
        ? {profile:(j as any).profileV9,claims:(j as any).claimsV9??[],missingInfo:(j as any).missingV9??[],
          publicationReady:false,label:'历史记录 · 未独立核验',reasons:[]} : null);
      setSemantic(
        j.semanticScore != null
          ? { score: j.semanticScore, issues: [] }
          : null,
      );
      setPages(j.pages ?? []);
      if (j.pages?.length) setActiveLocale(j.pages[0].locale);
      setCurrentJobId(j.id);
      setMarket(j.market);
      setLanguagePreference(j.locales?.length===3?'all':(j.locales?.[0] as OutputLanguagePreference)||'auto');
      setCategory(j.category);
      setTopic(j.topic);

      // 重建对话
      const when = new Date(j.stages?.[0]?.detail && j.id ? Date.now() : Date.now());
      void when;
      setMsgs([
        {
          role: 'agent',
          text: `已载入历史运行记录。\n\n目标市场 **${j.market}** · 语种 ${(j.locales ?? []).join(' / ')} · 品类 ${j.category}\n选题：${j.topic}\n\n产出 ${j.pages?.length ?? 0} 个页面，语义质检 ${j.semanticScore ?? '—'} 分。\n\n下方「产出预览」可直接查看，或在右侧继续往下翻。`,
        },
      ]);
      // 保持 idle：载入旧记录是只读回看，用户可继续直接发新需求
      setPhase('idle');
      setTab(j.pages?.length ? 'output' : 'pipeline');
      // 设为续写基线：之后发的消息都是「在原稿上改」
      setBase(j.id);
      lastPrompt.current = '';
      setInput('');
      setExampleId(null);
    } catch (e) {
      pushMsg({ role: 'agent', text: `打开失败：${(e as Error).message}` });
    }
  }

  function pushMsg(m: Msg) {
    setMsgs((prev) => [...prev, m]);
  }

  function submit() {
    const v = input.trim();
    if (!v || running) return;
    setInput('');
    lastPrompt.current = v;
    setExampleId(null);
    pushMsg({ role: 'user', text: v });

    // The prompt may describe a previously unknown product. Do not retain demo values
    // or treat the entire message as the product name. The user can edit both fields.
    if (!baseJobRef.current) {
      const extracted=extractProductTopic(v);
      if(extracted) {
        setTopic(extracted);
        const isLighting=/太阳能灯|感应灯|照明|路灯|灯具|\blight(?:ing)?\b|\blamp\b|beleuchtung/iu.test(v);
        setCategory(isLighting?'outdoor-lighting':'general-product');
      }
      setLanguagePreference('auto');
    }

    // 续写模式：基线已确定市场/品类/选题，直接改，不再重新澄清
    if (baseJobRef.current) {
      setPhase('ready');
      setTimeout(() => {
        pushMsg({
          role: 'agent',
          text: `好的，我基于**这份已有产出**按你的要求修改。\n\n修改时只会动你提到的部分，其余文案保持原样；合规校验与质检会重新跑一遍。`,
        });
        setTimeout(() => { void run(); }, 300);
      }, 300);
      return;
    }

    setPhase('askMarket');
    setTimeout(() => {
      pushMsg({
        role: 'agent',
        text: '收到。开始前我需要确认**目标市场**——这决定加载哪一套合规规则，不能先写再改。',
        choices: MARKETS.map((m) => ({ label: m.label, value: m.id })),
      });
    }, 400);
  }

  const lastPrompt = useRef('');

  /** 点示例：一次填好市场/品类/选题并直接执行，走预置快照 */
  function pickExample(ex: (typeof EXAMPLES)[number]) {
    if (running) return;
    lastPrompt.current = ex.prompt;
    setExampleId(ex.id);
    setMarket(ex.market);
    setCategory('outdoor-lighting');
    setTopic('outdoor solar security lighting');
    setLanguagePreference('auto');
    setPhase('ready');
    setTab('pipeline');
    pushMsg({ role: 'user', text: ex.prompt });
    setTimeout(() => {
      pushMsg({
        role: 'agent',
        text: `已识别为示例「**${ex.label}**」，市场锁为 ${ex.market}。点右侧「开始执行」即可——这条走预置快照，结果和真实运行一致。`,
      });
    }, 300);
  }

  function pickMarket(id: string) {
    const m = MARKETS.find((x) => x.id === id)!;
    setMarket(id);
    setMsgs((prev) =>
      prev.map((x) => (x.choices ? { ...x, choices: x.choices, choiceDisabled: true } : x)),
    );
    pushMsg({ role: 'user', text: m.label });
    setPhase('ready');
    setTab('pipeline');
    setTimeout(() => {
      pushMsg({
        role: 'agent',
        text: `已确认目标市场。请在右侧核对**输出语言、品类与产品主题**后开始执行。未提供市场数据时，S2会给出当前产品的定性内容建议，不虚构曝光数据。`,
      });
    }, 300);
  }

  async function run() {
    if (running) return;
    // 续写模式：有基线记录时，把这次输入当「修订指令」而不是全新需求
    const base = baseJobRef.current;
    const isRevision = !!base && lastPrompt.current.trim().length > 0;
    setRunning(true);
    setEvidenceAudit(null);
    setReviewV9(null);
    setProductFactsError('');
    let userFacts: Array<{field:string;value:string}> = [];
    try {
      userFacts = productFactsText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
        const sep=line.indexOf(':');
        if(sep<=0)throw new Error('请使用 field: value 格式，每行一个字段');
        return {field:line.slice(0,sep).trim(),value:line.slice(sep+1).trim()};
      });
    } catch(e) {setProductFactsError((e as Error).message);setRunning(false);return;}
    setStages(Array(9).fill('idle'));
    setStageStat(Array(9).fill('待执行'));
    if (!isRevision) {
      setReadiness(null);
      setSemantic(null);
      setPages([]);
    }
    setCurrentJobId(null);
    setTab('pipeline');

    const locales = resolveTaskLocales(market as 'US'|'DE'|'ES'|'EU',lastPrompt.current,languagePreference);
    const r = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        market, locales, category, topic, intent: 'landing-page',
        prompt: lastPrompt.current,
        exampleId,
        productFacts:userFacts,
        evidenceDocs,
        marketCsv: marketCsv || undefined,
        // 续写：告诉后端基于哪条记录改，以及改成什么样
        ...(isRevision ? { parentId: base, instruction: lastPrompt.current } : {}),
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({error: `HTTP ${r.status}`}));
      pushMsg({role:'agent',text:`请求被拒绝：${String(err.error ?? r.status)}`});
      setRunning(false);
      return;
    }
    const reader = r.body?.getReader();
    if (!reader) { setRunning(false); return; }
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split('\n\n');
      buf = chunks.pop() ?? '';
      for (const c of chunks) {
        const line = c.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        let e: Record<string, unknown>;
        try { e = JSON.parse(line.slice(6)); } catch { continue; }

        if (e.kind === 'stage') {
          const i = e.stage as number;
          const st = e.status as string;
          setStages((prev) => {
            const n = [...prev];
            if (st === 'running') n[i] = 'running';
            else if (st === 'ok') n[i] = 'ok';
            else if (st === 'retried') n[i] = 'retried';
            else if (st === 'failed') n[i] = 'failed';
            return n;
          });
          setStageStat((prev) => {
            const n = [...prev];
            n[i] = String(e.summary ?? '');
            return n;
          });
          if (i === 7 && e.detail) setReadiness(e.detail as Readiness);
          if (i === 6 && e.detail) {
            const d = e.detail as { score?: number | null; issues?: string[] };
            setSemantic(typeof d.score === 'number' && Number.isFinite(d.score)
              ? { score: d.score, issues: d.issues ?? [] } : null);
          }
        } else if (e.kind === 'audit') {
          setEvidenceAudit(e.report as EvidenceAudit);
        } else if (e.kind === 'message') {
          pushMsg({ role: 'agent', text: String(e.content ?? '') });
        } else if (e.kind === 'citation') {
          setMsgs((prev) => {
            const n = [...prev];
            const last = n[n.length - 1];
            if (last && last.role === 'agent') {
              n[n.length - 1] = { ...last, citations: e.citations as Citation[] };
            }
            return n;
          });
        } else if (e.kind === 'done') {
          if (e.reviewStatus) setReviewV9(e.reviewStatus as V9Review);
          if (e.jobId) {
            setCurrentJobId(String(e.jobId));
            // 新产出成为下一次「继续调整」的基线，可以一直往下迭代
            if (Array.isArray(e.pages) && e.pages.length) setBase(String(e.jobId));
            else setBase(null);
          }
          // 运行完成：刷新历史列表，新产出立即出现在左侧
          loadJobs();
          setPages((e.pages as Array<{ locale: string; slug: string; title: string; html: string }>) ?? []);
          if (e.readiness) setReadiness(e.readiness as Readiness);
          if (typeof e.semanticScore === 'number') {
            setSemantic((prev) => ({ score: e.semanticScore as number, issues: prev?.issues ?? [] }));
          }
          if (e.mode === 'rule-audit') setTab('qa');
          if (Array.isArray(e.pages) && e.pages.length) {
            setActiveLocale((e.pages[0] as { locale: string }).locale);
            setTab('output');
          }
          fetch('/api/kb').then((x) => x.json()).then(setKb).catch(() => {});
        } else if (e.kind === 'error') {
          pushMsg({ role: 'agent', text: `执行失败：${String(e.message ?? '')}` });
        }
      }
    }
    setRunning(false);
    void runId;
  }

  // 清理
  useEffect(() => () => { esRef.current?.close(); }, []);

  /** 退出登录：清 cookie 后整页回登录页 */
  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 网络失败也照跳，反正 cookie 里那份 30 天后自然过期
    }
    window.location.replace('/login');
  }

  /**
   * 切换 LLM 在线 / 离线。
   * 默认离线（stub，秒出、不烧额度）；点一下切真实模型，用于现场演示。
   * 状态存在服务端进程内存里，不写环境变量、不改代码。
   */
  async function toggleLlm() {
    if (llmBusy) return;
    const next = llmMode !== 'live';
    setLlmBusy(true);
    setLlmNote('');
    try {
      const r = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const d = await r.json().catch(() => ({} as Record<string, unknown>));
      if (!r.ok || d.ok === false) {
        setLlmNote(String(d.message ?? '切换失败'));
        setTimeout(() => setLlmNote(''), 4000);
      } else {
        setLlmMode(String(d.mode ?? (next ? 'live' : 'stub')));
      }
    } catch {
      setLlmNote('切换失败：连不上服务');
      setTimeout(() => setLlmNote(''), 4000);
    }
    setLlmBusy(false);
  }

  const passedCount = readiness
    ? [readiness.factDensity >= 60, readiness.citationCoverage >= 70, readiness.entityConsistency >= 80, readiness.crawlability >= 75].filter(Boolean).length
    : 0;

  return (
    <div className="shell">
      <header>
        <div className="logo"><div className="logo-mark">L</div> Lumenvia Content Agent</div>
        <div className="tagline">跨语言内容生产 · AI 搜索可见性 · V9.2 语言与产品识别修复本地版</div>
        <button
          className={`llm-toggle${llmMode === 'live' ? ' on' : ''}`}
          onClick={toggleLlm}
          disabled={llmBusy}
          title={
            !llmConfigured
              ? '未配置 LLM_API_KEY，只能离线运行'
              : llmMode === 'live'
                ? '当前真实调用模型，点击切回离线（stub，秒出且不消耗额度）'
                : '当前离线（stub），点击切到在线，真实调用模型'
          }
        >
          <span className={`status-dot${llmMode === 'live' ? '' : ' off'}`} />
          {llmBusy ? '切换中…' : llmMode === 'live' ? 'LLM 在线' : 'LLM 离线'}
        </button>
        {llmNote ? <span className="llm-note">{llmNote}</span> : null}
        <div className="header-right">
          <span><span className="status-dot" />知识库 {kbTotal} 条 · 代码内置</span>
          {authOn ? <button className="logout-btn" onClick={logout} title="退出登录">退出</button> : null}
        </div>
      </header>

            <main>
        {/* ---------------- 历史记录栏 ---------------- */}
        <aside className={`hist${historyOpen ? '' : ' closed'}`}>
          <div className="hist-head">
            <span>历史记录</span>
            <button className="hist-new" onClick={newSession} title="新建会话">＋ 新建</button>
          </div>
          <div className="hist-scroll">
            {jobs.length === 0 ? (
              <div className="hist-empty">还没有运行记录。<br />发出第一个需求后，结果会保存在这里。</div>
            ) : (
              jobs.map((j) => (
                <button
                  key={j.id}
                  className={`hist-item${j.id === currentJobId ? ' active' : ''}`}
                  onClick={() => openJob(j.id)}
                  title={`${j.market} · ${j.topic}`}
                >
                  <div className="hist-line1">
                    <span className={`hist-pill ${j.status}`}>
                      {j.status === 'done' ? '完成' : j.status === 'running' ? '运行中' : '失败'}
                    </span>
                    <span className="hist-market">{j.market}</span>
                    {j.semanticScore != null ? (
                      <span className="hist-score">{j.semanticScore}</span>
                    ) : null}
                  </div>
                  <div className="hist-topic">{j.topic || j.category}</div>
                  <div className="hist-meta">
                    {j.locales.join('/')} · {j.pageCount} 页 · {fmtTime(j.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="chat-col">
          <div className="chat-scroll" ref={chatRef}>
            {msgs.map((m, i) => (
              <div className={`msg ${m.role}`} key={i}>
                <div className="avatar">{m.role === 'agent' ? 'L' : '你'}</div>
                <div style={{ maxWidth: '82%' }}>
                  <div className="bubble">{renderRich(m.text)}</div>
                  {m.citations?.length ? (
                    <div className="cite">
                      <div className="cite-title">依据 · 知识库检索命中</div>
                      {m.citations.map((c, j) => (
                        <div className="cite-item" key={j}>
                          · {c.ruleId ? <code>{c.ruleId}</code> : null} {c.title}
                          <span style={{ opacity: .6 }}>（{c.source}）</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {m.choices ? (
                    <div className="choices" style={{ marginTop: 10 }}>
                      {m.choices.map((c) => (
                        <button
                          key={c.value}
                          className="choice"
                          disabled={m.choiceDisabled}
                          onClick={() => pickMarket(c.value)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="composer">
            {phase === 'idle' ? (
              <div className="examples">
                <span className="examples-label">示例提示词</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.id}
                    className="example-chip"
                    onClick={() => pickExample(ex)}
                    disabled={running}
                    title={ex.prompt}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            ) : null}
            {baseJobId ? (
              <div className="rev-banner">
                <span>续写模式 · 在原稿上调整</span>
                <button onClick={() => setBase(null)}>退出</button>
              </div>
            ) : null}
            <div className="input-wrap">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                placeholder={
                  running ? '本次运行中…可在左侧「＋新建」开新会话'
                  : baseJobId ? '在这份产出上继续调整，例如「标题改短一点」「FAQ 加一条」'
                  : '描述你的出海内容需求…'
                }
                disabled={running}
              />
              <button className="send-btn" onClick={submit} disabled={running || !input.trim()}>↑</button>
            </div>
          </div>
        </section>

        {/* ---------------- 右：工作台 ---------------- */}
        <section className="work-col">
          <div className="tabs">
            <div className={`tab ${tab === 'pipeline' ? 'active' : ''}`} onClick={() => setTab('pipeline')}>编排流水线</div>
            <div className={`tab ${tab === 'kb' ? 'active' : ''}`} onClick={() => setTab('kb')}>知识库</div>
            <div className={`tab ${tab === 'qa' ? 'active' : ''}`} onClick={() => setTab('qa')}>质检报告</div>
            <div className={`tab ${tab === 'output' ? 'active' : ''}`} onClick={() => setTab('output')}>
              产出预览{pages.length ? <span className="badge">就绪</span> : null}
            </div>
          </div>

          {/* 流水线 */}
          <div className={`pane ${tab === 'pipeline' ? 'active' : ''}`}>
            {phase === 'ready' ? (
              <div className="clarify">
                <h4>任务单 · 执行前确认</h4>
                <div className="field-row">
                  <label>目标市场</label>
                  <select value={market} onChange={(e) => setMarket(e.target.value)}>
                    {MARKETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <label>输出语言</label>
                  <select value={languagePreference} onChange={(e) => setLanguagePreference(e.target.value as OutputLanguagePreference)}>
                    <option value="auto">自动匹配目标市场（尊重明确的语言要求）</option>
                    <option value="en">英语（en）</option>
                    <option value="de">德语（de）</option>
                    <option value="es">西班牙语（es）</option>
                    <option value="all">英语 / 德语 / 西班牙语</option>
                  </select>
                </div>
                <div className="hint">当前输出：{resolveLocaleSelection(market as 'US'|'DE'|'ES'|'EU',lastPrompt.current,languagePreference).locales.map(x=>({en:'英语',de:'德语',es:'西班牙语'}[x])).join(' / ')}（{({manual:'手动指定',user_request:'根据本次语言要求',market_default:'目标市场推荐'} as const)[resolveLocaleSelection(market as 'US'|'DE'|'ES'|'EU',lastPrompt.current,languagePreference).source]}）。市场决定内容方向与审核背景，语言决定文案表达。例如德国市场可指定英文网页。</div>
                <div className="field-row">
                  <label>品类</label>
                  <input value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
                <div className="field-row">
                  <label>选题</label>
                  <input value={topic} onChange={(e) => setTopic(e.target.value)} />
                </div>
                <div className="field-row">
                  <label>产品事实（可选，每行 field: value）</label>
                  <textarea value={productFactsText} onChange={e=>setProductFactsText(e.target.value)} rows={4}
                    placeholder={'battery: 5200 mAh LiFePO4\nlumen: 1100 lm\nip: IP65'} />
                </div>
                <div className="hint">不填写也能生成。可用字段如 model、sku、battery、lumen、ip、runtime、range、panel_power、install。资料仅视为用户陈述，未独立核验。普通任务不加载虚构演示参数。</div>
                {productFactsError ? <div className="hint" style={{color:'crimson'}}>{productFactsError}</div> : null}
                <div className="field-row">
                  <label>市场数据CSV（可选）</label>
                  <input type="file" accept=".csv" onChange={(e) => { void importMarketCsv(e.target.files?.[0]); }} />
                </div>
                <div className="hint">{marketFile ? `使用已上传数据：${marketFile}` : '未上传：S2根据本次产品进行定性内容规划，不套用其他产品的演示统计。'}</div>
                {marketCsvError ? <div className="hint" style={{color:'crimson'}}>{marketCsvError}</div> : null}
                <div className="field-row">
                  <label>佐证资料类型</label>
                  <select value={evidenceKind} onChange={(e) => setEvidenceKind(e.target.value as EvidenceKind)}>
                    <option value="product_manual">产品手册</option>
                    <option value="test_report">检测报告</option>
                    <option value="declaration">合规声明</option>
                    <option value="other">其他资料</option>
                  </select>
                </div>
                <div className="field-row">
                  <label>上传产品资料（TXT / MD / JSON）</label>
                  <input type="file" multiple accept=".txt,.md,.json"
                    onChange={(e) => { void importEvidenceFiles(e.target.files); }} />
                </div>
                <div className="hint">已选择 {evidenceDocs.length} 个文件。资料未核验真实性；文本可能发往已配置的大模型服务商，请勿上传敏感原件。</div>
                {evidenceDocs.map((d) => <div key={d.id} className="hint">待核验：{d.name}</div>)}
                {evidenceError ? <div className="hint" style={{color:'crimson'}}>{evidenceError}</div> : null}
                <button className="run-btn" onClick={run} disabled={running}>
                  {running ? '执行中…' : '开始执行'}
                </button>
                <div className="hint">
                  未上传适配的实际市场数据时，S2 不会提供虚构的搜索量或曝光率。
                </div>
              </div>
            ) : null}

            <div className="stages">
              {STAGES.map((s) => (
                <div className={`stage ${stages[s.id]}`} key={s.id}>
                  <div className="num">{s.id}</div>
                  <div>
                    <div className="name">
                      {s.name}
                      {s.isNew ? <span className="tag-new">新增</span> : null}
                    </div>
                    <div className="desc">{s.desc}</div>
                  </div>
                  <div className="stat">{stageStat[s.id]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 知识库 */}
          <div className={`pane ${tab === 'kb' ? 'active' : ''}`}>
            {kb ? (
              <div className="kb-grid">
                {(['rule', 'cognition', 'case', 'fact'] as const).map((z) => (
                  <div className="kb-card" key={z}>
                    <h4>
                      <span className="dot-r" style={{
                        background: z === 'rule' ? '#e2727e' : z === 'case' ? '#7d59d5' : z === 'fact' ? '#3fa87a' : '#d9a24a',
                      }} />
                      {{ rule: '规则区', cognition: '认知区', case: '案例区', fact: '事实区' }[z]}
                    </h4>
                    <div className="count">
                      {z === 'rule' ? '精确召回' : '语义召回'} · {kb.stats?.[z] ?? 0} 条
                    </div>
                    {(kb.groups?.[z] ?? []).slice(0, 4).map((it, i) => (
                      <div className="kb-item" key={i}>
                        {it.title}
                        <div className="src">{it.source}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty"><div className="big">▤</div>知识库未连接或为空，请先执行 db:push 与 db:seed</div>
            )}
          </div>

          {/* 质检 */}
          <div className={`pane ${tab === 'qa' ? 'active' : ''}`}>
            {reviewV9 ? (
              <div className="qa-review" aria-label="产品事实与来源审核">
                <div className="check qa-review-status">
                  <span className={`ic ${reviewV9.publicationReady ? 'ok' : 'warn'}`} aria-hidden="true">
                    {reviewV9.publicationReady ? '✓' : '!'}
                  </span>
                  <div className="qa-review-status-copy">
                    <b>{reviewV9.label}</b>
                    <div className="detail qa-review-totals">
                      {reviewV9.claims.length} 条声明 · {reviewV9.claims.filter(c => c.action === 'safe_rewrite').length} 条安全改写 · {reviewV9.missingInfo.length} 项待补充
                    </div>
                    <div className="detail">用户提供的信息尚未经过独立核验；生成完成不等于可以直接商用发布。</div>
                  </div>
                </div>

                {/* 主面板一：事实审查 + 资料来源，不单独重复一个“本次产品资料”卡片 */}
                <details className="qa-review-section">
                  <summary className="qa-review-summary">
                    <span className="qa-review-section-title">事实与来源审核</span>
                    <span className="qa-review-count" aria-label={`${reviewV9.claims.length} 条声明`}>{reviewV9.claims.length}</span>
                  </summary>
                  <div className="qa-review-body">
                    <div className="qa-review-help">逐条查看声明、对应来源及安全改写。来源与用户资料一致不代表经过独立验证。</div>
                    {reviewV9.claims.length ? reviewV9.claims.slice(0, 80).map((c, i) => (
                      <div className="check qa-review-item" key={c.id + '-' + i}>
                        <span className={`ic ${c.action === 'safe_rewrite' || c.action === 'withheld' ? 'warn' : 'ok'}`} aria-hidden="true">
                          {c.action === 'safe_rewrite' || c.action === 'withheld' ? '!' : '✓'}
                        </span>
                        <div className="qa-review-item-copy">
                          <b>{c.locale} · {c.fieldPath} · {c.action === 'safe_rewrite' ? '安全改写' : c.action === 'withheld' ? '暂缓声明' : '与本次资料一致'}</b>
                          <div className="detail">原文：{c.original}</div>
                          {c.action !== 'retained' ? <div className="detail">{c.action === 'withheld' ? '暂缓：' : '改写：'}{c.final || '该声明未放入最终页面'}</div> : null}
                          <div className="detail">{c.reason} · 关联事实：{c.factIds.join(', ') || '无'} · 来源：{c.sourceIds.join(', ') || '无'}</div>
                        </div>
                      </div>
                    )) : <div className="qa-review-empty">本次没有可展示的声明记录；不代表所有事实已核验。</div>}
                    {reviewV9.claims.length > 80 ? <div className="qa-review-empty">这里展示前 80 条声明，完整记录请以原始任务数据为准。</div> : null}
                    <details className="qa-review-source-list">
                      <summary className="qa-review-source-summary">查看本次产品资料及原始来源（{reviewV9.profile.length}）</summary>
                      <div className="qa-review-source-body">
                        {reviewV9.profile.map(x => (
                          <div className="qa-review-source-item" key={x.id}>
                            <b>{x.id} · {x.field}</b>
                            <div className="detail">{x.value} · 来源：{x.sourceId} · 尚未独立核验</div>
                          </div>
                        ))}
                        {!reviewV9.profile.length ? <div className="qa-review-empty">本次没有可用的产品事实资料。</div> : null}
                      </div>
                    </details>
                  </div>
                </details>

                {/* 主面板二：普通用户最需要操作的资料缺口 */}
                <details className="qa-review-section">
                  <summary className="qa-review-summary">
                    <span className="qa-review-section-title">待补充资料</span>
                    <span className="qa-review-count" aria-label={`${reviewV9.missingInfo.length} 项待补充资料`}>{reviewV9.missingInfo.length}</span>
                  </summary>
                  <div className="qa-review-body">
                    {reviewV9.missingInfo.map(x => (
                      <div className="check qa-review-item" key={x.field}>
                        <span className="ic warn" aria-hidden="true">!</span>
                        <div className="qa-review-item-copy">
                          <b>{x.label}</b>
                          <div className="detail">尚未提供，不会自行补造。</div>
                        </div>
                      </div>
                    ))}
                    {!reviewV9.missingInfo.length ? <div className="qa-review-empty">本次没有新增的资料缺失提示。</div> : null}
                  </div>
                </details>

                {/* 次级入口：内容选择决策仍保留，日常默认隐藏 */}
                <details className="qa-review-advanced">
                  <summary className="qa-review-advanced-summary">
                    <span>查看详细生成记录</span>
                    <span className="qa-review-advanced-note">{reviewV9.editorial?.length ?? 0} 项内容调整</span>
                  </summary>
                  <div className="qa-review-advanced-body">
                    <div className="qa-review-advanced-intro">记录消费者页面的 FAQ、场景和安全兜底文案选择；事实声明的原文、改写与来源详见上方「事实与来源审核」。</div>
                    {(reviewV9.editorial ?? []).map((x, i) => (
                      <div className="check qa-review-item" key={'editorial-' + i}>
                        <span className={`ic ${x.action === 'excluded_from_public_page' ? 'warn' : 'ok'}`} aria-hidden="true">
                          {x.action === 'excluded_from_public_page' ? '!' : '✓'}
                        </span>
                        <div className="qa-review-item-copy">
                          <b>{x.locale} · {x.action === 'excluded_from_public_page' ? '未放入消费者页面' : x.action === 'added_grounded_scene' ? '补充应用场景' : x.action === 'grounded_fallback_copy' ? '优化安全兜底文案' : '补充通用选购问题'}</b>
                          <div className="detail">{x.question}</div>
                          <div className="detail">{x.reason}</div>
                        </div>
                      </div>
                    ))}
                    {!reviewV9.editorial?.length ? <div className="qa-review-empty">本次没有额外的内容筛选记录。</div> : null}
                  </div>
                </details>
              </div>
            ) : null}
            {evidenceAudit ? (
              <div className="check-list">
                <div className="check">
                  <span className="ic warn">!</span>
                  <div><b>证据审查：{evidenceAudit.issues.length} 项高风险声明</b>
                    <div className="detail">{evidenceAudit.unreviewedCount} 份上传文件尚未独立核验。{evidenceAudit.note}</div>
                  </div>
                </div>
                {evidenceAudit.issues.map((issue, i) => (
                  <div className="check" key={`${issue.ruleId}-${i}`}>
                    <span className="ic warn">!</span>
                    <div><b>{issue.locale}: {issue.ruleId}</b>
                      <div className="detail">{issue.matched} · {issue.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {readiness ? (
              <>
                <div className="score-row">
                  {[
                    { k: '事实密度', v: readiness.factDensity, min: 60 },
                    { k: '结构化标注', v: readiness.citationCoverage, min: 70 },
                    { k: '实体一致性', v: readiness.entityConsistency, min: 80 },
                    { k: '可抓取性', v: readiness.crawlability, min: 75 },
                  ].map((x) => (
                    <div className="score-box" key={x.k}>
                      <div className="score-val" style={{ color: x.v >= x.min ? 'var(--ok)' : 'var(--warn)' }}>{x.v}</div>
                      <div className="score-lbl">{x.k}</div>
                    </div>
                  ))}
                </div>
                <div className="check-list">
                  <div className="check">
                    <span className="ic ok">✓</span>
                    <div><b>引用就绪度</b>· {passedCount}/4 项达标
                      <div className="detail">阈值：事实密度 ≥60 · 来源标注 ≥70 · 实体一致性 ≥80 · 可抓取性 ≥75</div>
                    </div>
                  </div>
                  {Object.entries(readiness.details ?? {}).map(([k, notes]) => (
                    <div className="check" key={k}>
                      <span className={`ic ${notes.length ? 'warn' : 'ok'}`}>{notes.length ? '!' : '✓'}</span>
                      <div><b>{{
                        factDensity: '事实密度', citationCoverage: '结构化标注',
                        entityConsistency: '实体一致性', crawlability: '可抓取性',
                      }[k] ?? k}</b>
                        <div className="detail">{notes.length ? notes.join('；') : '无问题'}</div>
                      </div>
                    </div>
                  ))}
                  {semantic ? (
                    <div className="check">
                      <span className={`ic ${semantic.score >= 80 ? 'ok' : 'warn'}`}>{semantic.score >= 80 ? '✓' : '!'}</span>
                      <div><b>语义质检</b>· {semantic.score} 分
                        <div className="detail">{semantic.issues.length ? semantic.issues.join('；') : '无问题'}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="empty"><div className="big">◷</div>等待流水线执行后生成质检报告</div>
            )}
          </div>

          {/* 产出 */}
          <div className={`pane ${tab === 'output' ? 'active' : ''}`}>
            {pages.length ? (
              <>
                <div className="preview-toolbar">
                  {pages.map((p) => (
                    <button key={p.locale}
                      className={`lang-tab ${activeLocale === p.locale ? 'active' : ''}`}
                      onClick={() => setActiveLocale(p.locale)}>
                      {p.locale.toUpperCase()}
                    </button>
                  ))}
                  <button
                    className="open-link"
                    onClick={() => {
                      const p = pages.find((x) => x.locale === activeLocale);
                      if (!p?.html) return;
                      // 直接用本次运行结果渲染，不依赖服务端任务记录：
                      // serverless 多实例下 /api/preview/{id} 可能落到没有该记录的 isolate
                      const blob = new Blob([p.html], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank', 'noreferrer');
                      setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    }}
                    title="在独立标签页打开本次生成的页面"
                  >
                    ↗ 新窗口打开
                  </button>
                  <button
                    className="open-link"
                    onClick={() => {
                      const p = pages.find((x) => x.locale === activeLocale);
                      if (!p?.html) return;
                      const baseSlug = (p.slug || 'landing-page').replace(new RegExp(`-${p.locale}$`), '');
                      const blob = new Blob([p.html], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${baseSlug}-${p.locale}.html`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    }}
                    title="下载成 .html 单文件，零外部依赖，可直接丢给客户或评委"
                  >
                    ↓ 下载 .html
                  </button>
                </div>
                <div className="frame-wrap">
                  <iframe
                    key={activeLocale}
                    srcDoc={pages.find((p) => p.locale === activeLocale)?.html ?? ''}
                    title="预览"
                  />
                </div>
              </>
            ) : (
              <div className="empty"><div className="big">▤</div>完成流水线后将在此预览生成的落地页</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}