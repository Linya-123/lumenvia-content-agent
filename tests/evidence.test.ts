import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvidenceDocs } from '../src/lib/evidence';
import { auditGeneratedPages, redactUnsubstantiatedCopy } from '../src/lib/claim-audit';

test('reject forged reviewed status from untrusted upload', () => {
  const docs = normalizeEvidenceDocs([{id:'manual1',name:'manual.txt',kind:'product_manual',text:'product manual contents',status:'verified',reviewedBy:'TÜV'}]);
  assert.equal(docs[0].status,'submitted_unreviewed');
  assert.equal((docs[0] as unknown as Record<string,unknown>).reviewedBy,undefined);
});
test('reject oversized and duplicate evidence uploads', () => {
  assert.throws(() => normalizeEvidenceDocs([{id:'file1',name:'big.txt',kind:'other',text:'x'.repeat(20001)}]));
  assert.throws(() => normalizeEvidenceDocs([{id:'file1',name:'a.txt',kind:'other',text:'a'},{id:'file1',name:'b.txt',kind:'other',text:'b'}]));
});
test('ordinary caution that certification is not verified is not a positive claim', () => {
  const result = auditGeneratedPages([{locale:'en',html:'<p>CE conformity status has not been verified for this demo product.</p>'}]);
  assert.equal(result.issues.length,0);
});
test('blocks unsupported CE and FCC claims even with unreviewed documents', () => {
  const docs = normalizeEvidenceDocs([{id:'dec1',name:'doс.txt',kind:'declaration',text:'CE status claimed in draft'}]);
  const result = auditGeneratedPages([{locale:'en',html:'<p>CE certified and FCC approved.</p>'}],docs);
  assert.equal(result.issues.length,2);
  assert.ok(result.issues.every(x => x.candidateEvidenceIds.includes('dec1')));
  assert.equal(result.publicationReady,false);
});
test('detect invalid EU lighting legal reference inside JSON-LD', () => {
  const html='<script type="application/ld+json">{"description":"Label: EU 2023/1670"}</script>';
  const result = auditGeneratedPages([{locale:'en',html}]);
  assert.equal(result.issues[0]?.ruleId,'WRONG-LIGHTING-LAW');
});
test('do not match strings from CSS or code', () => {
  const result = auditGeneratedPages([{locale:'en',html:'<style>.x{content:"CE certified"}</style><script>const x="FCC approved"</script><p>Safe draft.</p>'}]);
  assert.equal(result.issues.length,0);
});
test('rewrite only structured copy and preserve unrelated fields', () => {
  const data={h1:'CE certified for all markets',scenes:[{h:'Garden',p:'Easy to mount'}],score:4};
  const res=redactUnsubstantiatedCopy(data,'en');
  assert.equal(res.redactions,1);
  assert.ok(!res.copy.h1.includes('CE certified'));
  assert.deepEqual(res.copy.scenes,data.scenes);
  assert.equal(data.h1,'CE certified for all markets');
  assert.equal(res.copy.h1,'Certification claims require independent verification before publication.');
});
test('localized redaction is cautious rather than inventing a report', () => {
  const d=redactUnsubstantiatedCopy({sub:'CE zertifiziert'},'de');
  assert.match(d.copy.sub,/vor der Veröffentlichung unabhängig geprüft werden/);
  assert.doesNotMatch(d.copy.sub,/Prüfbericht/);
});
test('negative certification wording is not a positive assertion', () => {
  const html = '<p>The product is not CE certified.</p><p>Es un producto no certificado CE.</p>';
  const r = auditGeneratedPages([{locale:'en',html}]);
  assert.equal(r.issues.length,0);
  const cleaned = redactUnsubstantiatedCopy({text:'The product is not CE certified.'},'en');
  assert.equal(cleaned.redactions,0);
});

test('detects positive claims about availability of certificates',()=>{
  const html='<p>The product has CE certification.</p><p>FCC Part 15 verified.</p><p>EU Declaration of Conformity supplied with every unit.</p>';
  const result=auditGeneratedPages([{locale:'en',html}]);
  assert.ok(result.issues.some(x=>x.ruleId==='CERTIFICATE-AVAILABILITY-CLAIM'));
  const cleaned=redactUnsubstantiatedCopy({intro:'The product has CE certification.'},'en');
  assert.ok(cleaned.redactions>0);
});

test('checks unverified marketing claims inside meta description',()=>{
  const html='<html><head><meta name="description" content="Our model is CE certified for EU markets"></head><body><p>Demo product</p></body></html>';
  const result=auditGeneratedPages([{locale:'en',html}]);
  assert.ok(result.issues.some(x=>x.matched.includes('CE certified')));
});

test('cautious statements about claims needing verification remain acceptable',()=>{
  const html='<p>CE conformity not independently verified.</p><p>Certification must be checked.</p>';
  const result=auditGeneratedPages([{locale:'en',html}]);
  assert.equal(result.issues.length,0);
});
