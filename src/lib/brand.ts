import type { AdFact } from './pipeline';

/**
 * 虚拟品牌配置
 * ------------------------------------------------------------
 * 这是**唯一**允许出现品牌信息的地方。真实域名/产品名一律不得进入代码。
 * 若换成新的虚拟品牌，只改这一个文件即可。
 */

export type BrandConfig = {
  name: string;
  domain: string;
  demoEmail: string;
  sku: string;
  model: string;
};

export function getBrandConfig(): BrandConfig {
  return {
    name: process.env.BRAND_NAME ?? 'Lumenvia',
    domain: process.env.BRAND_DOMAIN ?? 'lumenvia.com',
    demoEmail: process.env.BRAND_DEMO_EMAIL ?? 'demo@lumenvia.com',
    sku: process.env.BRAND_SKU ?? 'LMN-LGS-20',
    model: process.env.BRAND_MODEL ?? 'LumenGuard S20',
  };
}

const SHARED = {
  ip: 'IP65',
  battery: '5200 mAh LiFePO4',
  range: 'Up to 12 m at 120°, measured at 2 m mounting height',
  lumen: '1100 lm, 4000 K',
  temp: '−20 °C to 55 °C',
};

/**
 * 产品事实数据：全部带测量条件。
 * 在 S4 生成与 S7 事实密度打分时共同使用 —— 保证"事实密度"是可验证的，不是凑出来的。
 */
export function getProductFacts(locale: string, brand: BrandConfig): AdFact[] {
  const base: AdFact[] = [
    { label: 'model', value: brand.model },
    { label: 'sku', value: brand.sku },
    { label: 'ip', value: SHARED.ip },
    { label: 'battery', value: SHARED.battery },
    { label: 'range', value: SHARED.range },
    { label: 'lumen', value: SHARED.lumen },
    { label: 'temp', value: SHARED.temp },
    { label: 'runtime', value: '4–5 nights (≈8 activations/night)' },
    { label: 'runtime_short', value: '4–5 nights' },
    { label: 'range_short', value: '12 m' },
    { label: 'install', value: '20 min' },
    { label: 'price', value: '79.00' },
    // 演示产品不附带真实认证文件，不能默认已获 CE / FCC / RoHS 认证。
    { label: 'cert', value: 'Certification not independently verified (demo)' },
  ];

  if (locale === 'de' || locale === 'es') {
    return base.map((f) => {
      if (f.label === 'cert') return { ...f, value: locale === 'de'
        ? 'Zertifizierung nicht verifiziert (Demo)' : 'Certificación no verificada (demo)' };
      if (f.label === 'price') return { ...f, value: '74.00' };
      if (locale === 'de') {
        if (f.label === 'runtime') return { ...f, value: '4–5 Nächte (≈8 Auslösungen/Nacht)' };
        if (f.label === 'runtime_short') return { ...f, value: '4–5 Nächte' };
        if (f.label === 'range') return { ...f, value: 'Bis 12 m bei 120°, gemessen bei 2 m Montagehöhe' };
        if (f.label === 'temp') return { ...f, value: '−20 °C bis 55 °C' };
      } else {
        if (f.label === 'runtime') return { ...f, value: '4–5 noches (≈8 activaciones/noche)' };
        if (f.label === 'runtime_short') return { ...f, value: '4–5 noches' };
        if (f.label === 'range') return { ...f, value: 'Hasta 12 m con 120°, medido a 2 m de altura de montaje' };
        if (f.label === 'temp') return { ...f, value: '−20 °C a 55 °C' };
      }
      return f;
    });
  }

  return [
    ...base,
    { label: 'included', value: 'Fixture, solar panel, 3 m cable, mounting bracket, drilling template, quick-start guide' },
  ];
}