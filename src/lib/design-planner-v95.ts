/**
 * V9.5: model-directed visual composition. The LLM chooses a DESIGN, not raw
 * executable markup. The renderer composes validated layout primitives.
 * The visual design is deliberately independent of product-category templates.
 */
export type PageDesignPlan = {
  source: 'llm' | 'fallback' | 'cache';
  concept: string;
  reasoning: string[];
  hero: 'split' | 'reverse' | 'centered' | 'poster' | 'text-only';
  visual: 'concept' | 'geometric' | 'typographic' | 'none';
  scenarios: 'grid' | 'feature-first' | 'timeline' | 'alternating';
  facts: 'cards' | 'table' | 'compact';
  faq: 'columns' | 'stacked';
  navigation: 'glass' | 'minimal' | 'solid';
  typography: 'modern' | 'editorial' | 'friendly';
  spacing: 'airy' | 'balanced' | 'dense';
  corners: 'rounded' | 'soft' | 'square';
  palette: { ink: string; accent: string; background: string; surface: string; muted: string };
};
export const DESIGN_SCHEMA = `{
  "concept":"一句中文设计理念，具体联系这次产品和目标受众",
  "reasoning":["为什么使用该布局","为什么选择这套视觉语言"],
  "hero":"split|reverse|centered|poster|text-only",
  "visual":"concept|geometric|typographic|none",
  "scenarios":"grid|feature-first|timeline|alternating",
  "facts":"cards|table|compact",
  "faq":"columns|stacked",
  "navigation":"glass|minimal|solid",
  "typography":"modern|editorial|friendly",
  "spacing":"airy|balanced|dense",
  "corners":"rounded|soft|square",
  "palette":{"ink":"#172E27","accent":"#216A54","background":"#F8F7F1","surface":"#FFFFFF","muted":"#576A61"}
}`;

const DEFAULT_PALETTE = {ink:'#183A32',accent:'#236B53',background:'#F9F7F1',surface:'#FFFFFF',muted:'#52635A'};
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const choice=<T extends string>(v:unknown,options:readonly T[],fallback:T):T=>
  typeof v==='string'&&options.includes(v as T)?v as T:fallback;
const color=(v:unknown,fallback:string):string=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v.toUpperCase():fallback;
const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const lum=(hex:string)=>rgb(hex).map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a:string,b:string)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const dim=(hex:string,factor:number)=>'#'+rgb(hex).map(v=>Math.round(v*factor).toString(16).padStart(2,'0')).join('').toUpperCase();
const safeAccent=(hex:string)=>{let c=hex;for(let i=0;i<12&&contrast(c,'#FFFFFF')<4.5;i++)c=dim(c,.86);return contrast(c,'#FFFFFF')>=4.5?c:DEFAULT_PALETTE.accent;};
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

export function normalizeDesignPlan(value:unknown,source:PageDesignPlan['source']='llm'):PageDesignPlan {
  const p=isRecord(value)?value:{};
  const colors=isRecord(p.palette)?p.palette:{};
  const background=color(colors.background,DEFAULT_PALETTE.background);
  const surface=color(colors.surface,DEFAULT_PALETTE.surface);
  const ink=color(colors.ink,DEFAULT_PALETTE.ink);
  const palette={
    background:contrast(background,'#111827')>=8?background:DEFAULT_PALETTE.background,
    surface:contrast(surface,'#111827')>=8?surface:DEFAULT_PALETTE.surface,
    ink:contrast(ink,'#FFFFFF')>=8?ink:DEFAULT_PALETTE.ink,
    accent:safeAccent(color(colors.accent,DEFAULT_PALETTE.accent)),
    muted:color(colors.muted,DEFAULT_PALETTE.muted),
  };
  if(contrast(palette.ink,palette.background)<7)palette.ink=DEFAULT_PALETTE.ink;
  if(contrast(palette.muted,palette.background)<4.5)palette.muted=DEFAULT_PALETTE.muted;
  return {
    source,
    concept:typeof p.concept==='string'?p.concept.slice(0,180):'根据本次任务决定视觉叙事与页面组织',
    reasoning:Array.isArray(p.reasoning)?p.reasoning.filter(v=>typeof v==='string').slice(0,3).map(v=>String(v).slice(0,180)):[],
    hero:choice(p.hero,['split','reverse','centered','poster','text-only'] as const,'split'),
    visual:choice(p.visual,['concept','geometric','typographic','none'] as const,'geometric'),
    scenarios:choice(p.scenarios,['grid','feature-first','timeline','alternating'] as const,'grid'),
    facts:choice(p.facts,['cards','table','compact'] as const,'cards'),
    faq:choice(p.faq,['columns','stacked'] as const,'columns'),
    navigation:choice(p.navigation,['glass','minimal','solid'] as const,'glass'),
    typography:choice(p.typography,['modern','editorial','friendly'] as const,'modern'),
    spacing:choice(p.spacing,['airy','balanced','dense'] as const,'balanced'),
    corners:choice(p.corners,['rounded','soft','square'] as const,'rounded'),
    palette,
  };
}

/** Offline fallback does not require knowing any product category. */
export function fallbackDesignPlan(seed:string):PageDesignPlan {
  let hash=2166136261;
  for(const ch of seed)hash=Math.imul(hash^ch.codePointAt(0)!,16777619)>>>0;
  const pick=<T extends string>(v:readonly T[],n=0)=>v[(hash>>>n)%v.length];
  const colors=[
    {ink:'#183A32',accent:'#276D55',background:'#FAF7F0',surface:'#FFFFFF',muted:'#51675F'},
    {ink:'#26344C',accent:'#315B88',background:'#F5F7FA',surface:'#FFFFFF',muted:'#54657A'},
    {ink:'#42352F',accent:'#98512E',background:'#FCF8F2',surface:'#FFFFFF',muted:'#6B5A50'},
    {ink:'#2C3047',accent:'#5E4B87',background:'#F9F7FB',surface:'#FFFFFF',muted:'#655D75'},
  ];
  return normalizeDesignPlan({
    concept:'离线：根据任务标识生成可复现的布局组合（非模型设计）',
    hero:pick(['split','reverse','centered','poster'] as const),
    visual:pick(['geometric','typographic','concept'] as const,3),
    scenarios:pick(['grid','feature-first','timeline','alternating'] as const,5),
    facts:pick(['cards','table','compact'] as const,9),
    faq:pick(['columns','stacked'] as const,11),
    navigation:pick(['glass','minimal','solid'] as const,14),
    typography:pick(['modern','editorial','friendly'] as const,18),
    spacing:pick(['airy','balanced','dense'] as const,21),
    corners:pick(['rounded','soft','square'] as const,24),
    palette:colors[hash%colors.length],
  },'fallback');
}

/** Only validated plan values enter CSS; model-supplied CSS/JS/HTML is ignored. */
export function adaptiveDesignCss(d:PageDesignPlan):string {
  const a=d.palette;
  const corners={rounded:'28px',soft:'15px',square:'5px'}[d.corners];
  const hFont=d.typography==='editorial'?'Georgia, "Times New Roman", serif':d.typography==='friendly'?'ui-rounded, system-ui, sans-serif':'system-ui, -apple-system, "Segoe UI", sans-serif';
  const scale={airy:1.2,balanced:1,dense:.80}[d.spacing];
  return `/* V9.5 model-directed, validated design */
:root{--ink:${a.ink};--ink-2:${a.ink};--accent:${a.accent};--accent-hover:${dim(a.accent,.82)};--accent-soft:color-mix(in srgb,${a.accent} 13%,white);--paper:${a.background};--card:${a.surface};--muted:${a.muted};--line:color-mix(in srgb,${a.ink} 12%,white);--warm:${a.accent};--v95-round:${corners}}
h1,h2,h3{font-family:${hFont}}.hero-art,.use,.spec,.faq-item,.lead{border-radius:var(--v95-round)}
.section{padding-top:${Math.round(89*scale)}px;padding-bottom:${Math.round(89*scale)}px}.hero{padding-top:${Math.round(78*scale)}px;padding-bottom:${Math.round(90*scale)}px}
.hero-v95--reverse .hero-copy{order:2}.hero-v95--reverse .hero-art{order:1}
.hero-v95--centered{display:flex;flex-direction:column;justify-content:center;text-align:center;gap:35px}.hero-v95--centered .hero-copy{max-width:840px}.hero-v95--centered h1,.hero-v95--centered .sub{max-width:840px}.hero-v95--centered .actions,.hero-v95--centered .hero-proof{justify-content:center}.hero-v95--centered .hero-art{width:min(100%,820px);height:390px}
.hero-v95--poster{max-width:none;padding-left:max(30px,calc((100vw - 1180px)/2));padding-right:max(30px,calc((100vw - 1180px)/2));background:linear-gradient(130deg,var(--ink),color-mix(in srgb,var(--ink) 66%,var(--accent)));color:white;grid-template-columns:1.14fr .86fr}.hero-v95--poster h1{color:white;font-size:clamp(44px,5.3vw,72px)}.hero-v95--poster .sub,.hero-v95--poster .hero-proof{color:#f4f4f4}.hero-v95--poster .kicker{background:rgba(255,255,255,.13);color:white}.hero-v95--poster .btn{background:white;color:var(--ink)}.hero-v95--poster .btn.alt{background:transparent;color:white;border-color:#ffffff88}
.hero-v95--text-only{display:block;min-height:490px}.hero-v95--text-only .hero-copy{max-width:850px}.hero-v95--text-only h1{max-width:820px;font-size:clamp(47px,6vw,82px)}.hero-v95--text-only .hero-art{display:none}
.visual-v95--geometric{height:420px;background:radial-gradient(ellipse at 75% 25%,var(--accent-soft),transparent 62%),var(--card);overflow:hidden;position:relative;border:1px solid var(--line)}.art-geo{position:absolute;inset:7%;border:1px solid var(--line);border-radius:30px}.art-geo .ring{position:absolute;border:25px solid var(--accent);border-radius:50%;width:54%;aspect-ratio:1;top:5%;left:25%;opacity:.72}.art-geo .slab{position:absolute;background:var(--ink);border-radius:30px;width:42%;height:52%;left:10%;bottom:5%;transform:rotate(-14deg);box-shadow:22px 18px 40px #0002}.art-geo .stripe{position:absolute;background:var(--accent-soft);width:70%;height:14%;right:-15%;top:43%;transform:rotate(-24deg)}
.visual-v95--typographic{height:420px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;padding:32px;overflow:hidden;border:1px solid var(--line)}.art-type{text-align:center;font-family:${hFont};font-size:clamp(36px,5vw,80px);font-weight:850;letter-spacing:-.07em;line-height:1.04;overflow-wrap:anywhere;color:var(--ink);max-height:350px;overflow:hidden}
.scenarios-v95--feature-first .uses{grid-template-columns:repeat(2,minmax(0,1fr))}.scenarios-v95--feature-first .use:first-child{grid-row:span 2;min-height:380px;background:var(--ink);color:#fff}.scenarios-v95--feature-first .use:first-child p{color:#e2eae4}.scenarios-v95--feature-first .use:first-child .use-icon{background:#ffffff22;color:white}
.scenarios-v95--timeline .uses{display:block;max-width:930px;margin-left:auto;margin-right:auto;border-left:3px solid var(--accent);padding-left:28px}.scenarios-v95--timeline .use{position:relative;margin-bottom:17px;min-height:0}.scenarios-v95--timeline .use::before{content:'';position:absolute;left:-41px;top:35px;width:18px;height:18px;background:var(--accent);border:5px solid var(--paper);border-radius:50%}
.scenarios-v95--alternating .uses{grid-template-columns:1fr}.scenarios-v95--alternating .use{display:grid;grid-template-columns:75px 1fr;align-items:center;min-height:130px;column-gap:25px}.scenarios-v95--alternating .use .use-icon{grid-row:span 2;margin:0}.scenarios-v95--alternating .use:nth-child(even){background:var(--accent-soft)}
.facts-v95--table .specs{display:block;border:1px solid var(--line);border-radius:var(--v95-round);overflow:hidden}.facts-v95--table .spec{display:grid;grid-template-columns:230px 1fr;gap:10px;align-items:center;border:0;border-radius:0;border-bottom:1px solid var(--line);box-shadow:none;padding:15px 23px}.facts-v95--table dd{margin:0;font-size:15px}.facts-v95--compact .specs{display:flex;flex-wrap:wrap;gap:10px}.facts-v95--compact .spec{padding:14px 19px;min-width:210px;flex:1}.facts-v95--compact dd{font-size:15px}
.faq-v95--stacked .faq-grid{grid-template-columns:1fr;max-width:860px;margin:0 auto}
.nav-v95--minimal.site-header{background:transparent;border:0;backdrop-filter:none;position:relative}.nav-v95--solid.site-header{background:var(--ink);border-color:var(--ink);color:white}.nav-v95--solid .nav a,.nav-v95--solid .lang{color:#e3e7e5}.nav-v95--solid .brand-mark{background:white;color:var(--ink)}
@media(max-width:760px){.hero-v95--reverse .hero-copy,.hero-v95--reverse .hero-art{order:initial}.hero-v95--poster{padding:55px 20px;grid-template-columns:1fr}.hero-v95--centered .hero-art,.visual-v95--typographic,.visual-v95--geometric{height:290px}.scenarios-v95--feature-first .uses{grid-template-columns:1fr}.scenarios-v95--feature-first .use:first-child{min-height:0;grid-row:auto}.scenarios-v95--alternating .use{grid-template-columns:60px 1fr}.facts-v95--table .spec{grid-template-columns:1fr}.hero-v95--text-only{min-height:0}.hero-v95--poster h1{font-size:clamp(36px,9vw,55px)}}`;
}

export function adaptiveArtMarkup(d:PageDesignPlan,conceptArt:string,productName:string,locale:string='en'):string {
  const typeLabel=locale==='de'?'Typografische Produktdarstellung':locale==='es'?'Representación tipográfica del producto':'Typographic product representation';
  const geomLabel=locale==='de'?'Abstrakte Produktillustration':locale==='es'?'Ilustración abstracta del producto':'Abstract product illustration';
  if(d.visual==='none'||d.hero==='text-only')return '';
  if(d.visual==='concept')return conceptArt;
  if(d.visual==='typographic')return `<div class="hero-art visual-v95--typographic" role="img" aria-label="${typeLabel}"><div class="art-type">${esc(productName.slice(0,95))}</div></div>`;
  return `<div class="hero-art visual-v95--geometric" role="img" aria-label="${geomLabel}"><div class="art-geo"><span class="ring"></span><span class="slab"></span><span class="stripe"></span></div></div>`;
}
