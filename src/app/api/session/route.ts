import { latestJob, jobCount } from '@/lib/store';
import { llmMode } from '@/lib/llm';
import { MARKETS } from '@/lib/types';
import { KB_ENTRIES } from '@/lib/kb';
import { authEnabled, sessionDays } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    storage: 'memory',
    llm: llmMode(),
    authEnabled: authEnabled(),
    sessionDays: sessionDays(),
    kbEntries: KB_ENTRIES.length,
    jobs: jobCount(),
    markets: MARKETS,
  });
}

export async function POST() {
  const last = latestJob();
  return Response.json({
    ok: true,
    storage: 'memory',
    llm: llmMode(),
    markets: MARKETS,
    lastJobId: last?.id ?? null,
  });
}