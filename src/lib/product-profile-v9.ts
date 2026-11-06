/** V9: Request-scoped product facts. Nothing here is independently verified. */
export type SubmittedFact = { field: string; value: string };
export type ProductFactV9 = {
  id: string;
  field: string;
  value: string;
  sourceId: string;
  sourceType: 'user_entry' | 'prompt_explicit' | 'fictional_demo';
  verification: 'unreviewed';
};

const FIELDS = new Set([
  'model','sku','battery','runtime','runtime_short','range','range_short','ip','lumen',
  'temp','install','price','panel_power','cable_length','included','power_source','motion_sensor',
  'no_mains','scenario','feature','cert','warranty',
]);

export function validateSubmittedFacts(raw: unknown): SubmittedFact[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 25) throw new Error('产品事实最多25条');
  const seen = new Set<string>();
  return raw.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`产品事实 ${index + 1} 格式错误`);
    const { field, value } = row as Record<string, unknown>;
    if (typeof field !== 'string' || !FIELDS.has(field)) throw new Error(`产品事实 ${index + 1} 字段不支持`);
    if (seen.has(field)) throw new Error(`产品事实字段 ${field} 重复`);
    if (typeof value !== 'string' || !value.trim() || value.length > 250 || /[\x00-\x1f]/.test(value)) {
      throw new Error(`产品事实 ${field} 内容无效或过长`);
    }
    seen.add(field);
    return {field, value:value.trim()};
  });
}

/** Only explicit words in the user's prompt are extracted; never infer numbers or certifications. */
export function promptFacts(prompt: string): SubmittedFact[] {
  const facts: SubmittedFact[] = [];
  if (/太阳能|solar[- ]powered|solar (?:motion|security|outdoor|garden|light)/i.test(prompt)) {
    facts.push({field:'power_source',value:'solar powered'});
  }
  if (/人体感应|运动感应|感应灯|motion[ -]?sens(?:or|ing)|bewegungsmelder|sensor de movimiento/i.test(prompt)) {
    facts.push({field:'motion_sensor',value:'motion sensing'});
  }
  if (/无需连接市电|无需接市电|免布线|无需布线|no mains wiring|no mains connection|wire[- ]free/i.test(prompt)) {
    facts.push({field:'no_mains',value:'no mains wiring required'});
  }
  // User's declarative product description: capture the common explicit metrics.
  // These are user-provided, UNVERIFIED facts, not third-party product claims.
  const explicitMetrics: Array<[string,RegExp]> = [
    ['ip', /\bIP\s?([0-6][0-9])\b/i],
    ['lumen', /(?:亮度|光通量|brightness|light output)[：:约为是\s]*([\d,.]+)\s*(?:lm|流明)\b|\b([\d,.]+)\s*(?:lm|流明)\b/i],
    ['battery', /(?:电池容量|电池|battery(?: capacity)?)[：:约为是\s]*([\d,.]+)\s*(?:mAh|毫安时)|\b([\d,.]+)\s*mAh\b/i],
    ['panel_power', /(?:太阳能板功率|光伏板功率|solar panel(?: power)?)[：:约为是\s]*([\d,.]+)\s*(?:W|瓦)\b/i],
    ['range', /(?:感应距离|探测距离|detection range)[：:约为是\s]*([\d,.]+)\s*(?:m|米)\b/i],
  ];
  for(const [field,re] of explicitMetrics){
    const m=re.exec(prompt); if(!m)continue;
    const value=m[0].trim();
    // Only positively described product specifications, not negated ones.
    const context=prompt.slice(Math.max(0,m.index-5),m.index);
    if(/不支持|未达到|没有|not |without/i.test(context))continue;
    facts.push({field,value});
  }
  const features:string[]=[];
  if(/定时喂食|scheduled feeding|timed feeding|alimentaci[oó]n programada/i.test(prompt))features.push('scheduled feeding');
  if(/(?:支持|具备|includes?|supports?)\s*(?:手机\s*)?(?:App|应用程序)\s*(?:远程\s*)?(?:控制|操控|管理)?|(?:手机\s*)?(?:App|应用程序)\s*(?:远程\s*)?(?:控制|操控|管理)|\b(?:app[- ]controlled|app control|mobile app control|control(?:led)? via (?:a )?(?:mobile )?app)\b/i.test(prompt))features.push('App control');
  if(features.length)facts.push({field:'feature',value:features.join('; ')});
  // These are usage contexts, not product performance guarantees.
  const contexts: string[] = [];
  if (/车库|garage|garaje|garageeinfahrt/i.test(prompt)) contexts.push('garage entrance');
  if (/庭院|院子|yard|garden|patio|garten/i.test(prompt)) contexts.push('garden / yard');
  if (/车道|driveway|einfahrt|entrada de vehículos/i.test(prompt)) contexts.push('driveway');
  if (contexts.length) facts.push({field:'scenario',value:contexts.join(', ')});
  return facts;
}

export function buildProductProfile(prompt: string, submitted: SubmittedFact[], demoFacts: SubmittedFact[] = []): ProductFactV9[] {
  const result: ProductFactV9[] = [];
  const explicit = new Map<string,SubmittedFact>();
  promptFacts(prompt).forEach(f => explicit.set(f.field,f));
  // Structured user entries override keyword recognition, never demo data.
  submitted.forEach(f => explicit.set(f.field,f));
  const entries = demoFacts.length ? demoFacts : [...explicit.values()];
  entries.forEach((f, index) => result.push({
    id:`F${String(index+1).padStart(3,'0')}`,
    field:f.field,
    value:f.value,
    sourceId:demoFacts.length ? `demo:${f.field}` : submitted.some(u=>u.field===f.field) ? `user:fact:${f.field}` : 'user:prompt',
    sourceType:demoFacts.length ? 'fictional_demo' : submitted.some(u=>u.field===f.field) ? 'user_entry' : 'prompt_explicit',
    verification:'unreviewed',
  }));
  return result;
}

const EXPECTED_FIELDS: Array<{ field: string; label: string; priority: 'important'|'optional' }> = [
  {field:'lumen',label:'产品亮度及测量条件（lm）',priority:'important'},
  {field:'battery',label:'电池容量、类型及支持资料',priority:'optional'},
  {field:'runtime',label:'续航及测试条件',priority:'important'},
  {field:'ip',label:'IP 防护等级及试验依据',priority:'important'},
  {field:'range',label:'感应范围及安装条件',priority:'optional'},
  {field:'cert',label:'认证/合规文件及适用型号',priority:'important'},
];
export function missingProductInfo(facts: ProductFactV9[],category='outdoor-lighting') {
  const keys = new Set(facts.map(f=>f.field));
  const expected = category === 'outdoor-lighting' ? EXPECTED_FIELDS : [
    {field:'model',label:'具体产品型号或识别信息',priority:'optional' as const},
    {field:'feature',label:'核心功能与实际操作条件',priority:'important' as const},
    {field:'warranty',label:'保修与售后政策（如需展示）',priority:'optional' as const},
    {field:'cert',label:'适用于该品类及市场的合规证明（如需宣称）',priority:'important' as const},
  ];
  return expected.filter(f=>!keys.has(f.field)).map(f=>({...f,reason:'本次用户资料中未提供；不应自行编造'}));
}
