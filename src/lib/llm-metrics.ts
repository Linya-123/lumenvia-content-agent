/**
 * Request-scoped LLM usage collection. Node.js runtime only.
 * Records numeric usage; never persists prompts, raw API keys or responses.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type UsageLedger = {
  calls: number;
  failedCalls: number;
  callsWithoutUsage: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens: number;
};

export function createUsageLedger(): UsageLedger {
  return {
    calls: 0, failedCalls: 0, callsWithoutUsage: 0,
    promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0,
  };
}

const store = new AsyncLocalStorage<UsageLedger>();

export function runWithUsageLedger<T>(ledger: UsageLedger, fn: () => T): T {
  return store.run(ledger, fn);
}

export function recordLLMCall(): void {
  const ledger = store.getStore();
  if (ledger) ledger.calls++;
}

export function recordLLMFailure(): void {
  const ledger = store.getStore();
  if (ledger) ledger.failedCalls++;
}

function nonnegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
    ? value : null;
}

export function recordLLMUsage(usage: unknown): void {
  const ledger = store.getStore();
  if (!ledger) return;
  if (!usage || typeof usage !== 'object') { ledger.callsWithoutUsage++; return; }
  const src = usage as Record<string, unknown>;
  const prompt = nonnegativeInt(src.prompt_tokens);
  const completion = nonnegativeInt(src.completion_tokens);
  if (prompt === null || completion === null) { ledger.callsWithoutUsage++; return; }
  const reportedTotal = nonnegativeInt(src.total_tokens);
  ledger.promptTokens += prompt;
  ledger.completionTokens += completion;
  ledger.totalTokens += reportedTotal ?? prompt + completion;
  const details = (src.prompt_tokens_details && typeof src.prompt_tokens_details === 'object')
    ? src.prompt_tokens_details as Record<string, unknown> : {};
  const cached = nonnegativeInt(src.prompt_cache_hit_tokens)
    ?? nonnegativeInt(details.cached_tokens)
    ?? 0;
  ledger.cachedPromptTokens += Math.min(cached, prompt);
}

export function usageSnapshot(ledger: UsageLedger): UsageLedger & { complete: boolean } {
  return { ...ledger, complete: ledger.callsWithoutUsage === 0 && ledger.failedCalls === 0 };
}
