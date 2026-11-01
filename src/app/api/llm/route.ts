import { NextRequest, NextResponse } from 'next/server';
import { llmConfigured, llmMode, llmModel, llmRuntimeOn, setLlmRuntime } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 当前 LLM 状态 */
function snapshot() {
  return {
    ok: true,
    enabled: llmRuntimeOn(),
    mode: llmMode(),
    configured: llmConfigured(),
    model: llmModel(),
  };
}

export async function GET() {
  return NextResponse.json(snapshot());
}

/**
 * 顶栏按钮切换：POST { enabled: boolean }
 * 只改本进程的运行时开关，不写 .env、不改代码。
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: '请求格式不对' },
      { status: 400 },
    );
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json(
      { ok: false, message: '缺少 enabled 布尔字段' },
      { status: 400 },
    );
  }

  const r = setLlmRuntime(body.enabled);
  if (!r.ok) {
    return NextResponse.json({ ...snapshot(), ok: false, message: r.message }, { status: 400 });
  }
  return NextResponse.json(snapshot());
}