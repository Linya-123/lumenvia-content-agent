/** S2: request-specific content strategy, never fabricated market analytics. */
import { getLLM } from './llm';
import { rankMarketTopics, type MarketRow } from './market-data';
import type { JobSpec, TopicDecision } from './types';

type Fact = { label: string; value: string };
const tidy = (s:string,n=120) => s.replace(/[\r\n<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
function fallback(spec:JobSpec, facts:Fact[], note=''):TopicDecision {
  const provided = facts.slice(0,4).map(f=>`${tidy(f.label,30)}: ${tidy(f.value,60)}`);
  const focusAreas = [...new Set([spec.intent && tidy(spec.intent,90), ...provided, `围绕「${tidy(spec.topic,100)}」的使用场景`, '基于已知资料解答消费者常见疑问'].filter(Boolean) as string[])].slice(0,5);
  return { topic:spec.topic, priority:'N/A', source:'offline_heuristic', focusAreas,
    audienceQuestions:['这个产品适合哪些使用场景？','用户提供的哪些产品特点值得解释？','购买前需要了解什么？'],
    reason:`基于当前产品说明安排内容重点，不表示真实搜索热度或市场缺口。${note}`,
    evidence:[{label:'分析来源',value:'本次用户输入；离线定性规划（非市场统计）'},...(note?[{label:'上传数据说明',value:note}]:[])],
  };
}
export async function dynamicTopicDecision(spec:JobSpec, rows:MarketRow[]|undefined, facts:Fact[]):Promise<TopicDecision> {
  let note='';
  // Real CSV may influence priority only when it actually contains the selected topic.
  if (rows?.length && spec.market!=='EU') {
    try {
      const ranked = rankMarketTopics(rows,spec.market);
      const normalized = (s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
      const topic = normalized(spec.topic);
      const matched=ranked.find(r=>{const rt=normalized(r.topic);return rt.length>=4 && (rt===topic||topic.includes(rt)||rt.includes(topic));});
      if(matched) return {topic:spec.topic,priority:matched.priority,source:'uploaded_csv',
        focusAreas:[`围绕「${matched.topic}」展开当前产品内容`,...facts.slice(0,3).map(f=>`${f.label}: ${f.value}`)],
        audienceQuestions:[],
        reason:`本次CSV中匹配到「${matched.topic}」：曝光占比 ${matched.demandShare.toFixed(1)}%，页面占比 ${matched.supplyShare.toFixed(1)}%。统计口径须由上传者确认。`,
        evidence:[{label:'数据来源',value:'本次上传CSV（非联网市场数据）'}, {label:'主题匹配',value:matched.topic},
          {label:'曝光占比',value:`${matched.demandShare.toFixed(1)}%`},{label:'页面占比',value:`${matched.supplyShare.toFixed(1)}%`}],};
      note='CSV没有与本次主题匹配的条目，未使用其他产品的曝光数值。';
    } catch(e) {note=`CSV暂不适用于本次主题：${(e as Error).message}`;}
  } else if (rows?.length) note='跨市场数据未汇总成单一优先级；按本次主题做定性分析。';
  const deterministic=fallback(spec,facts,note);
  const llm=getLLM();
  if(llm.name.startsWith('stub'))return deterministic;
  try {
    const messages=[{role:'system' as const,content:`你是跨品类内容规划助手。输出JSON对象，字段必须为：{"focusAreas":["..."],"audienceQuestions":["..."],"reason":"..."}。仅根据用户提供的产品描述及目标市场选择营销内容重点；不要虚构搜索量、曝光率、竞争率、转化率、品类性能、法规结论。已明确要求的主题不可擅自替换。focusAreas给2到5条，问题给2到4条，用简短中文说明。`},
      {role:'user' as const,content:`市场：${spec.market}；品类：${spec.category}；主题：${spec.topic}；用户原始需求：${spec.userRequest??''}；用户已提供的产品事实：${facts.map(f=>`${f.label}: ${f.value}`).join('；')||'无'}。${note}`}];
    const raw=await llm.chat(messages,{jsonMode:true,temperature:0.2,maxTokens:480});
    const obj=JSON.parse(raw.replace(/^```(?:json)?\s*|```$/g,'').trim()) as Record<string,unknown>;
    const safeList=(v:unknown,max:number)=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()).map(x=>tidy(x,140)).slice(0,max):[];
    const focusAreas=safeList(obj.focusAreas,5),audienceQuestions=safeList(obj.audienceQuestions,4);
    if(focusAreas.length<2)throw Error('无有效内容建议');
    return {topic:spec.topic,priority:'N/A',source:'llm_reasoning',focusAreas,audienceQuestions,
      reason:`AI 根据本次产品说明给出内容重点，不代表真实市场统计。${note} ${typeof obj.reason==='string'?tidy(obj.reason,180):''}`,
      evidence:[{label:'分析来源',value:'DeepSeek 内容规划（定性推断，非真实市场统计）'},...(note?[{label:'上传数据说明',value:note}]:[])],};
  } catch(e){return {...deterministic,reason:`${deterministic.reason} 模型规划不可用，已使用离线建议（${tidy((e as Error).message,80)}）。`};}
}
