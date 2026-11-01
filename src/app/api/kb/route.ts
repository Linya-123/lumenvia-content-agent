import { kbStats, kbGroups, KB_ENTRIES } from '@/lib/kb';
import { TOPIC_GAPS, FUNNEL } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = kbStats();
  const groups = kbGroups();
  return Response.json({
    stats,
    groups: {
      rule: groups.rule.map(toBrief),
      cognition: groups.cognition.map(toBrief),
      case: groups.case.map(toBrief),
      fact: groups.fact.map(toBrief),
    },
    total: KB_ENTRIES.length,
    analytics: { gaps: TOPIC_GAPS, funnel: FUNNEL },
  });
}

function toBrief(e: { title: string; source: string; ruleId?: string; effectiveAt?: string; market: string | null }) {
  return { title: e.title, source: e.source, ruleId: e.ruleId ?? null, effectiveAt: e.effectiveAt ?? null, market: e.market };
}