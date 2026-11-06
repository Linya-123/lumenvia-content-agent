/**
 * 运行存储（单进程内存）
 * ------------------------------------------------------------
 * 不用数据库的理由：
 *   1. 数据量在「一次评审几十次运行」量级
 *   2. 京东云单机部署，进程常驻，内存即可
 *   3. 零配置、零依赖，评审环境不会因为连不上库而失败
 *
 * 局限（已明确接受）：
 *   - 进程重启后历史记录清空
 *   - 多实例部署时各实例不共享（当前单实例，无影响）
 *   - 超过 MAX_RECORDS 或 TTL 的记录自动清理，防止内存泄漏
 */

import { randomUUID } from 'node:crypto';
import type { Readiness, TopicDecision } from './types';
import type { ProductFactV9 } from './product-profile-v9';
import type { ClaimRecordV9 } from './claim-engine-v9';

export type StageRecord = {
  stage: number;
  attempt: number;
  status: 'running' | 'ok' | 'retried' | 'failed';
  summary: string;
  detail?: unknown;
  at: number;
};

export type PageRecord = {
  locale: string;
  slug: string;
  title: string;
  metaDesc: string;
  html: string;
  readiness: Readiness | null;
};

export type JobRecord = {
  id: string;
  market: string;
  locales: string[];
  category: string;
  topic: string;
  /** 用户原始需求文本（历史回看 / 重新优化用） */
  prompt?: string;
  status: 'running' | 'done' | 'failed';
  topicDecision: TopicDecision | null;
  readiness: Readiness | null;
  semanticScore: number | null;
  stages: StageRecord[];
  pages: PageRecord[];
  /** 各语种结构化文案：续写修订时作为「上一版」喂给模型 */
  copyByLocale?: Record<string, unknown>;
  profileV9?: ProductFactV9[];
  claimsV9?: ClaimRecordV9[];
  missingV9?: ReturnType<typeof import('./product-profile-v9').missingProductInfo>;
  createdAt: number;
  finishedAt: number | null;
};

const MAX_JOBS = 200;
const TTL_MS = 1000 * 60 * 60 * 6; // 6 小时

/** 用 globalThis 挂载，避免 dev 热重载时反复初始化 */
const store: Map<string, JobRecord> =
  ((globalThis as unknown as { __lumenviaJobs?: Map<string, JobRecord> }).__lumenviaJobs ??= new Map());

export function createJob(input: {
  market: string;
  locales: string[];
  category: string;
  topic: string;
  prompt?: string;
}): JobRecord {
  const job: JobRecord = {
    id: randomUUID(),
    market: input.market,
    locales: input.locales,
    category: input.category,
    topic: input.topic,
    prompt: input.prompt,
    status: 'running',
    topicDecision: null,
    readiness: null,
    semanticScore: null,
    stages: [],
    pages: [],
    createdAt: Date.now(),
    finishedAt: null,
  };
  store.set(job.id, job);
  gc();
  return job;
}

export function getJob(id: string): JobRecord | null {
  const j = store.get(id);
  if (!j) return null;
  if (Date.now() - j.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return j;
}

export function logStage(
  jobId: string,
  stage: number,
  status: StageRecord['status'],
  summary: string,
  attempt = 1,
  detail?: unknown,
) {
  const j = store.get(jobId);
  if (!j) return;
  j.stages.push({ stage, attempt, status, summary, detail, at: Date.now() });
}

export function finishJob(jobId: string, patch: Partial<JobRecord>) {
  const j = store.get(jobId);
  if (!j) return;
  Object.assign(j, patch);
  j.finishedAt = Date.now();
}

/** 最近一次运行（评审复看用） */
export function latestJob(): JobRecord | null {
  let best: JobRecord | null = null;
  for (const j of store.values()) {
    if (!best || j.createdAt > best.createdAt) best = j;
  }
  return best;
}

/** 历史记录摘要（不含 HTML，列表接口用） */
export type JobSummary = {
  id: string;
  market: string;
  locales: string[];
  category: string;
  topic: string;
  prompt?: string;
  status: JobRecord['status'];
  semanticScore: number | null;
  readiness: Readiness | null;
  pageCount: number;
  createdAt: number;
  finishedAt: number | null;
};

/** 按创建时间倒序列出所有运行记录 */
export function listJobs(): JobSummary[] {
  gc();
  return [...store.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((j) => ({
      id: j.id,
      market: j.market,
      locales: j.locales,
      category: j.category,
      topic: j.topic,
      prompt: j.prompt,
      status: j.status,
      semanticScore: j.semanticScore,
      readiness: j.readiness,
      pageCount: j.pages?.length ?? 0,
      createdAt: j.createdAt,
      finishedAt: j.finishedAt,
    }));
}

export function jobCount(): number {
  return store.size;
}

function gc() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.createdAt > TTL_MS) store.delete(k);
  }
  if (store.size <= MAX_JOBS) return;
  const sorted = [...store.values()].sort((a, b) => a.createdAt - b.createdAt);
  for (const j of sorted.slice(0, store.size - MAX_JOBS)) store.delete(j.id);
}