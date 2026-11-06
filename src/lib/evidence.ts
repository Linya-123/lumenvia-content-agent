/**
 * Uploaded evidence is NEVER automatically certified as authentic.
 * These are request-scoped extracts for reviewer triage, not a legal conclusion.
 */
export type EvidenceKind = 'product_manual' | 'test_report' | 'declaration' | 'other';
export type EvidenceInput = {
  id: string;
  name: string;
  kind: EvidenceKind;
  text: string;
};
export type EvidenceDocument = EvidenceInput & { status: 'submitted_unreviewed' };
export const MAX_EVIDENCE_FILES = 3;
export const MAX_EVIDENCE_CHARS = 20000;
const KINDS: EvidenceKind[] = ['product_manual', 'test_report', 'declaration', 'other'];

export function normalizeEvidenceDocs(value: unknown): EvidenceDocument[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_FILES) {
    throw new Error(`仅支持最多 ${MAX_EVIDENCE_FILES} 个证据文件`);
  }
  const seen = new Set<string>();
  return value.map((raw: unknown, index: number): EvidenceDocument => {
    if (!raw || typeof raw !== 'object') throw new Error(`证据文件 ${index + 1} 结构错误`);
    const data = raw as Record<string, unknown>;
    const id = typeof data.id === 'string' ? data.id.trim() : '';
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const text = typeof data.text === 'string' ? data.text : '';
    const kind = data.kind;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || seen.has(id)) throw new Error('证据 ID 不合法或重复');
    if (!name || name.length > 150 || /[\\\x00-\x1f]/.test(name)) throw new Error('文件名不合法');
    if (!KINDS.includes(kind as EvidenceKind)) throw new Error('不支持的证据类型');
    if (!text.trim() || text.length > MAX_EVIDENCE_CHARS) throw new Error('证据为空或超出文本长度限制');
    seen.add(id);
    // Ignore forged status/reviewedBy/signed flags from untrusted client input.
    return { id, name, kind: kind as EvidenceKind, text, status: 'submitted_unreviewed' };
  });
}

export function evidencePublicSummary(docs: EvidenceDocument[]) {
  return docs.map(({ id, name, kind, status }) => ({ id, name, kind, status }));
}
