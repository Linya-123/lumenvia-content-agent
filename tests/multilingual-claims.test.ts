import test from 'node:test';
import assert from 'node:assert/strict';
import { auditGeneratedPages, redactUnsubstantiatedCopy } from '../src/lib/claim-audit';

const cases = [
  { locale: 'en', content: 'CE certification is included.', positive: true, ruleId: 'EU-CERTIFICATE-AVAILABILITY' },
  { locale: 'en', content: 'FCC certificate is supplied.', positive: true, ruleId: 'EU-CERTIFICATE-AVAILABILITY' },
  { locale: 'de', content: 'CE-Konformitätserklärung liegt bei.', positive: true, ruleId: 'EU-CERTIFICATE-AVAILABILITY' },
  { locale: 'es', content: 'Cuenta con certificación CE.', positive: true, ruleId: 'SPANISH-CERTIFICATION-ASSERTION' },
  { locale: 'es', content: 'Producto con marcado CE verificado.', positive: true, ruleId: 'SPANISH-CERTIFICATION-ASSERTION' },
  { locale: 'en', content: '该产品已通过CE认证。', positive: true, ruleId: 'CHINESE-CERTIFICATION-ASSERTION' },
  { locale: 'en', content: '该产品未通过CE认证。', positive: false },
  { locale: 'es', content: 'No cuenta con certificación CE.', positive: false },
  { locale: 'es', content: 'No tiene certificación CE.', positive: false },
  { locale: 'en', content: 'CE conformity has not been verified.', positive: false },
  { locale: 'en', content: 'The product is not CE certified.', positive: false },
  { locale: 'de', content: 'Diese CE-Unterlagen müssen noch geprüft werden.', positive: false },
];

for (const entry of cases) {
  test(`${entry.positive ? 'detect' : 'do not flag'} [${entry.locale}]: ${entry.content}`, () => {
    const issues = auditGeneratedPages([{ locale: entry.locale, html: `<p>${entry.content}</p>` }]).issues;
    const redacted = redactUnsubstantiatedCopy({ headline: entry.content, other: 'Unchanged ordinary copy.' }, entry.locale);
    assert.equal(issues.length > 0, entry.positive, JSON.stringify(issues));
    assert.equal(redacted.redactions > 0, entry.positive);
    assert.equal(redacted.copy.other, 'Unchanged ordinary copy.');
    if (entry.positive) {
      assert.ok(issues.some(item => item.ruleId === entry.ruleId));
      assert.notEqual(redacted.copy.headline, entry.content);
      assert.equal(auditGeneratedPages([{ locale: entry.locale, html: `<p>${redacted.copy.headline}</p>` }]).issues.length, 0);
    } else {
      assert.equal(redacted.copy.headline, entry.content);
    }
  });
}

test('reviews document availability claim inside meta and JSON-LD, excluding CSS script', () => {
  const html = `<!doctype html><head>
    <meta name="description" content="Cuenta con certificación CE.">
    <script type="application/ld+json">{"description":"FCC certificate is supplied."}</script>
    <script>const hidden = "CE certification is included.";</script>
    <style>.badge::after {content:"CE certification is included."}</style>
    </head><body>Demonstration product.</body>`;
  const issues = auditGeneratedPages([{ locale: 'es', html }]).issues;
  assert.ok(issues.some(item => item.ruleId === 'SPANISH-CERTIFICATION-ASSERTION'));
  assert.ok(issues.some(item => item.ruleId === 'EU-CERTIFICATE-AVAILABILITY'));
  assert.equal(issues.filter(item => item.matched === 'CE certification is included.').length, 0);
});

test('keeps source object unchanged and never marks user-provided text as verified', () => {
  const original = Object.freeze({headline:'Cuenta con certificación CE.', specification:'IP65 (demo data).'});
  const result = redactUnsubstantiatedCopy(original, 'es');
  assert.ok(result.redactions >= 1);
  assert.equal(original.headline,'Cuenta con certificación CE.');
  assert.equal(result.copy.specification,'IP65 (demo data).');
});
