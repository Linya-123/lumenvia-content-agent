import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMarketCsv,rankMarketTopics,marketTopicDecision} from '../src/lib/market-data';
const csv=`market,topic,impressions,page_count\nUS,solar lighting,2100,6\nUS,security camera,3500,12\nUS,solar floodlight,1500,0\nDE,solar leuchte,1700,5\nDE,security,300,10`;
test('parse valid market data and handle no-supply topic first',()=>{
  const rows=parseMarketCsv(csv);
  assert.equal(rows.length,5);
  const ranked=rankMarketTopics(rows,'US');
  assert.equal(ranked[0].topic,'solar floodlight');
  assert.equal(ranked[0].gapRatio,null);
  assert.equal(ranked[0].priority,'P0');
});
test('market ratios use separate market totals',()=>{
  const r=rankMarketTopics(parseMarketCsv(csv),'US');
  const solar=r.find(x=>x.topic==='solar lighting');
  assert.ok(solar);
  assert.ok(Math.abs(solar.demandShare-(2100/7100*100))<0.001);
  assert.ok(Math.abs(solar.supplyShare-(6/18*100))<0.001);
});
test('market decision transparently identifies uploaded CSV',()=>{
  const d=marketTopicDecision(parseMarketCsv(csv),'DE');
  assert.equal(d.topic,'solar leuchte');
  assert.match(d.evidence[0].value,/CSV/);
});
test('quoted CSV topics supported',()=>{
  const data='market,topic,impressions,page_count\nUS,"solar, floodlight",100,1\nUS,security,200,2';
  assert.equal(parseMarketCsv(data)[0].topic,'solar, floodlight');
});
test('reject invalid metrics and duplicate topics',()=>{
  assert.throws(()=>parseMarketCsv('market,topic,impressions,page_count\nUS,solar,-2,1\nUS,camera,1,1'));
  assert.throws(()=>parseMarketCsv('market,topic,impressions,page_count\nUS,solar,2,1\nUS,solar,3,1'));
});
test('reject absent market totals and unmatched market',()=>{
  const rows=parseMarketCsv('market,topic,impressions,page_count\nUS,solar,0,0\nUS,camera,0,0');
  assert.throws(()=>rankMarketTopics(rows,'US'));
  assert.throws(()=>rankMarketTopics(rows,'DE'));
  assert.throws(()=>rankMarketTopics(rows,'EU'));
});
