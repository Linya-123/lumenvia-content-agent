/** V9.1 quality-report information architecture and visual consistency, offline. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
const start = page.indexOf('{reviewV9 ? (');
const end = page.indexOf('{evidenceAudit ? (', start);
assert(start >= 0 && end > start, 'review section must exist');
const review = page.slice(start, end);

test('only two primary cards are visible in the V9.1 report', () => {
  assert.equal((review.match(/<details className="qa-review-section">/g) || []).length, 2);
  for (const title of ['事实与来源审核', '待补充资料']) assert(review.includes(`>${title}<`));
  assert(!review.includes('qa-review-section-title">消费者网页内容选择'));
  assert(!review.includes('qa-review-section-title">本次产品资料'));
  assert.equal((review.match(/className="qa-review-count"/g) || []).length, 2);
});

test('product source is nested within factual review, not duplicated as another main card', () => {
  assert.equal((review.match(/className="qa-review-source-list"/g) || []).length, 1);
  assert(review.includes('查看本次产品资料及原始来源'));
  for (const field of ['reviewV9.profile.map', 'x.id', 'x.field', 'x.value', 'x.sourceId', '尚未独立核验']) {
    assert(review.includes(field), `${field} should remain available`);
  }
});

test('editorial decisions remain available through a collapsed secondary disclosure', () => {
  assert.equal((review.match(/<details className="qa-review-advanced">/g) || []).length, 1);
  assert(review.includes('查看详细生成记录'));
  for (const field of ['reviewV9.editorial', 'x.question', 'x.reason', 'excluded_from_public_page', 'added_grounded_scene', 'grounded_fallback_copy']) {
    assert(review.includes(field), `${field} must remain available in advanced records`);
  }
  assert(!review.includes('<details className="qa-review-advanced" open>'));
});

test('claims preserve original, rewritten, source and fact IDs with truthful statuses', () => {
  for (const field of ['c.original', 'c.final', 'c.reason', 'c.factIds', 'c.sourceIds', 'safe_rewrite', 'withheld']) {
    assert(review.includes(field), `${field} should be preserved`);
  }
  assert(review.includes("reviewV9.claims.filter(c => c.action === 'safe_rewrite').length"));
  assert(review.includes('用户提供的信息尚未经过独立核验'));
  assert(review.includes('reviewV9.publicationReady'));
});

test('quality-report style reuses existing cards with accessible disclosures', () => {
  assert(review.includes('className="check qa-review-status"'));
  assert(review.includes('className="check qa-review-item"'));
  for (const classname of ['qa-review-section', 'qa-review-advanced', 'qa-review-source-list']) {
    assert(css.includes(`.${classname}`));
  }
  assert(css.includes('.qa-review-summary:focus-visible'));
  assert(css.includes('.qa-review-advanced-summary:focus-visible'));
  assert(css.includes('.qa-review-source-summary:focus-visible'));
  assert(css.includes('prefers-reduced-motion'));
});
