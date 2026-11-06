/** Lightweight explicit workflow selection (deterministic, not an LLM planner). */
export type TaskIntent = 'generate_page'|'audit_copy'|'analyze_market'|'revise_page';

export function detectTaskIntent(prompt: string, hasRevision: boolean): TaskIntent {
  if (hasRevision) return 'revise_page';
  const p = prompt.trim();
  const wantsNewPage = /(?:生成|制作|新建|做一个|生成网页|create\s+(?:a\s+)?(?:page|landing page)|generate\s+(?:a\s+)?page)/i.test(p);
  if (wantsNewPage) return 'generate_page';
  if (/^(?:(?:请|帮我|帮忙|可以)?\s*(?:审核|检查|合规检查|审查|检测)(?:一下|下)?\s*(?:这段|以下|这份)?\s*(?:文案|广告|内容)?|audit|review|check\s+compliance)(?:[:：\s]|$)/i.test(p)) {
    return 'audit_copy';
  }
  if (/^(?:请|帮我|帮忙)?\s*(?:分析(?:选题|市场|主题)|选题分析|市场分析|推荐选题)/i.test(p) || /^analyze\s+(?:market|topic)\b/i.test(p)) {
    return 'analyze_market';
  }
  return 'generate_page';
}

/** Only text after the first colon is treated as the item to audit. */
export function extractAuditCopy(prompt: string): string {
  const colon = prompt.search(/[:：]/);
  const copy = colon >= 0 ? prompt.slice(colon+1).trim() : '';
  return copy.slice(0,5000);
}
