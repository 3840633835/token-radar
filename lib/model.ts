// Token Radar 模型 radar-4：快照进，排名板出。
//
// radar-4 相对 radar-3 的改动（每一项都有验证数字，见 validation）：
//   1. 增长与成熟的常数不再手写：81 组常数在两道盲测上网格搜索——
//      留一（119 个 comps 全折）挑最优，再在按上榜日期分半的 walk-forward
//      上复核；最优常数写进 board.json 的 model 块，搜索过程写进 validation。
//   2. Walk-forward 价值验证：按上榜日期排，老一半拟合曲线、新一半测试，
//      报告整模型的中位对数误差和 flat-median 基线，供读者判断时间外推。
//   3. 不确定性加一道：留一残差的 conformal 80% 区间（按类别算，薄类别用
//      全局分位数兜底），和 bootstrap p10-p90 并列；farm verdict 仍按 P10 判。
//   4. 每行带 nearest comparable（kin）：TVL 最接近的已发币协议，
//      名字、市值、TVL 和市值/TVL 都写进 board.json，detail 里展示。
//   5. Dashboard 加 integrity strip、build funnel、类别合计隐含价值、
//      每行一行的方程、farm 的 $/hour；另有 METHODOLOGY.md 讲清全部方法。
//
// 公式：implied = exp(ic + slope*ln(TVL)) * growth * maturity
//       expected = implied * launch_odds
// 没有任何协议名字被特殊对待；同一个函数给每一行打分。

/** 快照里的一个协议：快照固定给的十个字段。 */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** 整份快照。 */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** 模型常数：dashboard 会原样展示，改常数就改这里一处。 */
export interface ModelConstants {
  growth_weight_up: number;
  growth_weight_down: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_halflife_days: number;
  unknown_age_days: number;
  odds_shrink_prior: number;
  bootstrap_draws: number;
  bootstrap_seed: number;
}

export const MODEL: ModelConstants = {
  growth_weight_up: 0.5,
  growth_weight_down: 0.8,
  growth_floor: -80,
  growth_cap: 120,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_halflife_days: 730,
  unknown_age_days: 365,
  odds_shrink_prior: 5,
  bootstrap_draws: 200,
  bootstrap_seed: 20261126,
};

/** 模型版本号：dashboard 和 board 都写它，改模型就改版本。 */
export const MODEL_VERSION = 'radar-4';

/** Live-token 协议放进 dashboard 对照表的前几名。 */
export const LIVE_ROWS = 24;

/** 一个 farm 步骤：动作、成本、耗时。 */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** 拟合的 log-log 曲线。 */
export interface CurveFit {
  intercept: number;
  slope: number;
  r_squared: number;
  comps: number;
}

/** 一个年龄桶的 launch odds。 */
export interface OddsBucket {
  label: string;
  age_min_days: number;
  age_max_days: number | null;
  cohort: number;
  token_rate: number;
}

/** 网格搜索的一行结果：常数组合 + 它在留一盲测上的误差。 */
export interface GridSearchRow {
  growth_weight_up: number;
  growth_weight_down: number;
  maturity_floor: number;
  maturity_halflife_days: number;
  loo_median_abs_log_error: number;
}

/** 网格搜索的完整结果：试了多少组、最优是哪组、前五名。 */
export interface GridSearchResult {
  configs_tried: number;
  best: GridSearchRow;
  top: GridSearchRow[];
}

/** Walk-forward 价值验证：按上榜日期分半，老一半拟合、新一半测试。 */
export interface WalkForwardResult {
  train_before: string;
  train_n: number;
  test_n: number;
  median_abs_log_error: number;
  within_2x: number;
  flat_median_abs_log_error: number;
}

/** Conformal 区间：留一残差的 80% 分位数，全局 + 每个够样本的类别。 */
export interface ConformalResult {
  global_q80_log: number;
  categories: { category: string; comps: number; q80_log: number }[];
}

/** 验证数字：全部在快照上现算，写进 board.json 的 model 块和 dashboard。 */
export interface Validation {
  loo: { form: string; median_abs_log_error: number; within_2x: number }[];
  split: { form: string; median_abs_log_error: number; within_2x: number }[];
  ablation: { config: string; median_abs_log_error: number; within_2x: number }[];
  odds: { loo_brier: number; base_brier: number; loo_log_loss: number; base_log_loss: number; time_split_brier: number; time_split_base_brier: number };
  per_category_loo: { category: string; comps: number; median_abs_log_error: number }[];
  grid_search: GridSearchResult;
  walk_forward: WalkForwardResult;
  conformal: ConformalResult;
}

/** board.json 的一行。 */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  expected_value_usd: number;
  launch_odds: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  conformal_p10_usd: number;
  conformal_p90_usd: number;
  kin_slug: string;
  kin_name: string;
  kin_mcap_usd: number | null;
  kin_tvl_usd: number;
  kin_ratio: number;
  rank_p10: number;
  rank_p90: number;
  farm_verdict: 'farm' | 'thin' | 'skip';
  farm_cost_usd: number;
  farm_hours: number;
  model: {
    curve_intercept: number;
    curve_slope: number;
    curve_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** dashboard 用的精简行：farm 计划由页面按同一套规则现场算出。 */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  expected_value_usd: number;
  launch_odds: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  conformal_p10_usd: number;
  conformal_p90_usd: number;
  kin_slug: string;
  kin_name: string;
  kin_mcap_usd: number | null;
  kin_tvl_usd: number;
  kin_ratio: number;
  rank_p10: number;
  rank_p90: number;
  farm_verdict: 'farm' | 'thin' | 'skip';
  farm_cost_usd: number;
  farm_hours: number;
  watchlist: boolean;
  curve_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** 已发币协议：只展示市场自己的市值，不进排名。 */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** 一个被排除的协议：审计表用，说明它为什么没进排名。 */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** dashboard 需要的全部数据。 */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  live_total: number;
  pre_token_total: number;
  excluded_size: number;
  funnel: { step: string; count: number }[];
  category_totals: { category: string; rows: number; combined_implied_usd: number }[];
  curve: CurveFit;
  odds_buckets: OddsBucket[];
  validation: Validation;
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
}

/** 快照格式不对时抛出的错误。 */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** 有限数，否则用 fallback。 */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 夹在 [lo, hi] 之间。 */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** 一组数的中位数；空组返回 null。 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}

/** 有种子的伪随机数：同一份快照永远得到同一串数。 */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从 from 到 to 的整天数，至少 0；日期缺失或非法返回 null。 */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** 协议是否在快照里记录了 token：三者全空才算 pre-token。 */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** 名字尾巴带版本号的协议：那是另一个协议的池子，不是独立协议。 */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** house 的 watchlist 筛选里排除的类别：已发币产品的衍生品。 */
export const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** 一个协议为什么不能进排名：null 表示可以进。 */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'token already trades';
  if (p.category === 'CEX') return 'exchange, not a launch candidate';
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return `category ${p.category} is a derivative of a token that already trades`;
  if (VERSIONED.test(p.name)) return 'versioned pool of another protocol';
  if (EXCHANGE_PREFIX.test(p.name)) return 'named after an exchange';
  if (WRAPPED_WORD.test(p.name)) return 'name says it is a wrapped or staked product';
  return null;
}

/** 一个协议能不能进排名：pre-token 且通过 house 的 watchlist 筛选。 */
export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

/** 拟合 log-log 曲线的 live comps：已发币、正市值、正 TVL、非交易所。 */
export function liveComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** 最小二乘拟合 log(mcap) = ic + slope * log(TVL)。 */
export function fitLogLog(comps: SnapshotProtocol[]): CurveFit {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) * (x - mx);
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (intercept + slope * xs[i]!)) ** 2, 0);
  return {
    intercept: round4(intercept),
    slope: round4(slope),
    r_squared: ssTot === 0 ? 0 : round3(1 - ssRes / ssTot),
    comps: comps.length,
  };
}

/** 曲线在某 TVL 上的值。 */
export function curveValue(fit: CurveFit, tvlUsd: number): number {
  return Math.max(1, Math.exp(fit.intercept + fit.slope * Math.log(Math.max(1, tvlUsd))));
}

/** 增长乘数：涨 x0.5、跌 x0.8，增长先夹在 -80%..+120%。 */
export function growthMultiplier(change7d: number | null, model: ModelConstants): { pct: number; mult: number } {
  const pct = clamp(finite(change7d, 0), model.growth_floor, model.growth_cap);
  const weight = pct >= 0 ? model.growth_weight_up : model.growth_weight_down;
  return { pct, mult: 1 + (pct / 100) * weight };
}

/** 成熟乘数：越久没发币越接近 1，边际递减。 */
export function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const a = age ?? model.unknown_age_days;
  return model.maturity_floor + model.maturity_range * (1 - Math.exp(-a / model.maturity_halflife_days));
}

/** 年龄桶：launch odds 按年龄分组。 */
const ODDS_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '0–180 days', min: 0, max: 180 },
  { label: '180–365 days', min: 180, max: 365 },
  { label: '365–730 days', min: 365, max: 730 },
  { label: '730–1100 days', min: 730, max: 1100 },
  { label: 'over 1100 days', min: 1100, max: null },
];

function bucketOf(age: number | null): number {
  const a = age ?? 365;
  for (let i = 0; i < ODDS_BUCKETS.length; i++) {
    const b = ODDS_BUCKETS[i]!;
    if (a >= b.min && (b.max === null || a < b.max)) return i;
  }
  return ODDS_BUCKETS.length - 1;
}

/**
 * Launch odds：同类协议里已经发币的占比。
 * 队列是全部有上榜日期、非交易所、名字不带版本号的协议；
 * 每个（年龄桶 x 类别）格子的比率向桶的比率收缩（prior 5 个协议），
 * 薄格子不能凭一个协议就把榜冲垮。odds 是队列比率，绝不是发币日期预测。
 */
export function launchOddsTable(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { buckets: OddsBucket[]; oddsFor: (p: SnapshotProtocol, age: number | null) => number } {
  const cohort = snapshot.protocols.filter(
    (p) => p.listed_at !== null && p.category !== 'CEX' && !VERSIONED.test(p.name),
  );
  const buckets: OddsBucket[] = ODDS_BUCKETS.map((b) => {
    const g = cohort.filter((p) => bucketOf(ageDays(snapshot.as_of, p.listed_at)) === ODDS_BUCKETS.indexOf(b));
    const tk = g.filter((p) => !isPreToken(p)).length;
    return { label: b.label, age_min_days: b.min, age_max_days: b.max, cohort: g.length, token_rate: g.length === 0 ? 0 : round3(tk / g.length) };
  });
  const oddsFor = (p: SnapshotProtocol, age: number | null): number => {
    const bi = bucketOf(age);
    const bucketRate = buckets[bi]!.token_rate;
    const cat = p.category ?? 'Other';
    const cell = cohort.filter(
      (q) => bucketOf(ageDays(snapshot.as_of, q.listed_at)) === bi && (q.category ?? 'Other') === cat,
    );
    const cellTk = cell.filter((q) => !isPreToken(q)).length;
    const k = model.odds_shrink_prior;
    return round3((cellTk + k * bucketRate) / (cell.length + k));
  };
  return { buckets, oddsFor };
}

/** 3x3 线性方程组：二次曲线拟合用。 */
function solve3(a: number[][], b: number[]): number[] {
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k < 4; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return m.map((row, i) => row[3]! / row[i]!);
}

function looErrors(
  comps: SnapshotProtocol[],
  fitPredict: (train: SnapshotProtocol[]) => (p: SnapshotProtocol) => number,
): number[] {
  const errs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const pred = fitPredict(train)(comps[i]!);
    errs.push(Math.abs(Math.log(comps[i]!.mcap_usd!) - Math.log(Math.max(1, pred))));
  }
  return errs.sort((a, b) => a - b);
}

function summarizeErrs(errs: number[]): { median_abs_log_error: number; within_2x: number } {
  const sorted = [...errs].sort((a, b) => a - b);
  return {
    median_abs_log_error: round3(sorted[Math.floor(sorted.length / 2)]!),
    within_2x: round3(errs.filter((e) => e < Math.log(2)).length / errs.length),
  };
}

const linePredict =
  (train: SnapshotProtocol[]) =>
  (p: SnapshotProtocol): number => {
    const f = fitLogLog(train);
    return curveValue(f, p.tvl_usd);
  };

const quadPredict =
  (train: SnapshotProtocol[]) =>
  (p: SnapshotProtocol): number => {
    const xs = train.map((q) => Math.log(q.tvl_usd));
    const ys = train.map((q) => Math.log(q.mcap_usd!));
    const a = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const b = [0, 0, 0];
    xs.forEach((x, i) => {
      const r = [1, x, x * x];
      for (let j = 0; j < 3; j++) {
        b[j]! += r[j]! * ys[i]!;
        for (let k = 0; k < 3; k++) a[j]![k]! += r[j]! * r[k]!;
      }
    });
    const co = solve3(a, b);
    const x = Math.log(Math.max(1, p.tvl_usd));
    return Math.max(1, Math.exp(co[0]! + co[1]! * x + co[2]! * x * x));
  };

const flatPredict =
  (train: SnapshotProtocol[]) =>
  (p: SnapshotProtocol): number => {
    const m = median(train.map((q) => q.mcap_usd! / q.tvl_usd)) ?? 0.2;
    return Math.max(1, p.tvl_usd * m);
  };

/**
 * 网格搜索增长与成熟常数：3x3x3x3 = 81 组，每组都在 119 个 comps 上
 * 做留一盲测（每折重拟合曲线），挑中位对数误差最小的一组。
 * 平局取网格顺序第一组；排序稳定，所以同一份快照永远得到同一组常数。
 * 手写的旧常数（涨 0.5 / 跌 0.8 / 成熟底 0.65 / 半衰 730 天）也在网格里，
 * 搜索赢它才换，赢不了就留着——搜索是验证，不是装饰。
 */
export function gridSearch(snapshot: Snapshot): GridSearchResult {
  const comps = liveComps(snapshot);
  const rows: GridSearchRow[] = [];
  for (const up of [0.3, 0.5, 0.7])
    for (const down of [0.6, 0.8, 1.0])
      for (const floor of [0.5, 0.65, 0.8])
        for (const half of [365, 730, 1460]) {
          const m: ModelConstants = {
            ...MODEL,
            growth_weight_up: up,
            growth_weight_down: down,
            maturity_floor: floor,
            maturity_range: 1 - floor,
            maturity_halflife_days: half,
          };
          const errs: number[] = [];
          for (let i = 0; i < comps.length; i++) {
            const train = comps.filter((_, j) => j !== i);
            const f = fitLogLog(train);
            const p = comps[i]!;
            errs.push(Math.abs(Math.log(p.mcap_usd!) - Math.log(Math.max(1, impliedOf(p, snapshot.as_of, f, m).implied))));
          }
          rows.push({
            growth_weight_up: up,
            growth_weight_down: down,
            maturity_floor: floor,
            maturity_halflife_days: half,
            loo_median_abs_log_error: round3(median(errs) ?? 0),
          });
        }
  rows.sort((a, b) => a.loo_median_abs_log_error - b.loo_median_abs_log_error);
  return { configs_tried: rows.length, best: rows[0]!, top: rows.slice(0, 5) };
}

/**
 * Walk-forward 价值验证：comps 按上榜日期排，老一半拟合曲线、新一半测试，
 * 整模型（曲线 x 增长 x 成熟）算中位对数误差，并和同一分半上的
 * flat-median 基线对比。这是时间外推的检验，不是随机分半。
 */
export function walkForward(snapshot: Snapshot, model: ModelConstants = MODEL): WalkForwardResult {
  const dated = liveComps(snapshot)
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  const cut = Math.floor(dated.length / 2);
  const train = dated.slice(0, cut);
  const test = dated.slice(cut);
  const fit = fitLogLog(train);
  const flat = median(train.map((q) => q.mcap_usd! / q.tvl_usd)) ?? 0.2;
  const errs = test.map((p) => Math.abs(Math.log(p.mcap_usd!) - Math.log(Math.max(1, impliedOf(p, snapshot.as_of, fit, model).implied))));
  const flatErrs = test.map((p) => Math.abs(Math.log(p.mcap_usd!) - Math.log(Math.max(1, p.tvl_usd * flat))));
  return {
    train_before: test[0]!.listed_at!,
    train_n: train.length,
    test_n: test.length,
    median_abs_log_error: round3(median(errs) ?? 0),
    within_2x: round3(errs.filter((e) => e < Math.log(2)).length / errs.length),
    flat_median_abs_log_error: round3(median(flatErrs) ?? 0),
  };
}

/**
 * 留一残差的 conformal 80% 区间：整模型在每个 comp 上留一预测，
 * |log(实际) - log(预测)| 的 80% 分位数就是区间的半宽（对数尺度）。
 * 类别够 5 个 comps 就按类别算，薄类别用全局分位数兜底。
 * 这是残差的不确定性，和 bootstrap 的参数不确定性是两回事，两道都展示。
 */
export function conformalQuantiles(snapshot: Snapshot, model: ModelConstants = MODEL): ConformalResult {
  const comps = liveComps(snapshot);
  const absResid: { category: string; abs: number }[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const f = fitLogLog(train);
    const p = comps[i]!;
    const pred = impliedOf(p, snapshot.as_of, f, model).implied;
    absResid.push({ category: p.category ?? 'Other', abs: Math.abs(Math.log(p.mcap_usd!) - Math.log(Math.max(1, pred))) });
  }
  const q80 = (vals: number[]): number => {
    const s = [...vals].sort((a, b) => a - b);
    return round3(s[Math.min(s.length - 1, Math.floor(0.8 * s.length))] ?? 0);
  };
  const categories: { category: string; comps: number; q80_log: number }[] = [];
  for (const cat of [...new Set(absResid.map((r) => r.category))].sort()) {
    const g = absResid.filter((r) => r.category === cat);
    if (g.length < 5) continue;
    categories.push({ category: cat, comps: g.length, q80_log: q80(g.map((r) => r.abs)) });
  }
  categories.sort((a, b) => a.q80_log - b.q80_log);
  return { global_q80_log: q80(absResid.map((r) => r.abs)), categories };
}

/** 最近的已发币可比协议（kin）：TVL 在对数尺度上最接近的那一个。 */
export function nearestKin(
  p: SnapshotProtocol,
  comps: SnapshotProtocol[],
): { slug: string; name: string; mcap_usd: number | null; tvl_usd: number; ratio: number } {
  const x = Math.log(Math.max(1, p.tvl_usd));
  let best = comps[0]!;
  let bestD = Infinity;
  for (const q of comps) {
    const d = Math.abs(Math.log(Math.max(1, q.tvl_usd)) - x);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return {
    slug: best.slug,
    name: best.name,
    mcap_usd: best.mcap_usd,
    tvl_usd: best.tvl_usd,
    ratio: round4((best.mcap_usd ?? 0) / Math.max(1, best.tvl_usd)),
  };
}

/** 全部验证数字：LOO、 seeded random-half split、消融、odds 验证、按类别 LOO、
 *  网格搜索、walk-forward、conformal 区间。grid 已算好可以传进来，省一次重算。 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL, grid?: GridSearchResult): Validation {
  const comps = liveComps(snapshot);
  const forms = [
    { form: 'log-log line', fit: linePredict },
    { form: 'log-log quadratic', fit: quadPredict },
    { form: 'flat median multiple', fit: flatPredict },
  ];
  const loo = forms.map((f) => ({ form: f.form, ...summarizeErrs(looErrors(comps, f.fit)) }));
  // Seeded random-half split：同一批 comps，一半拟合、一半测试。
  const rng = mulberry32(model.bootstrap_seed);
  const order = comps.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  const half = Math.floor(order.length / 2);
  const train = order.slice(0, half).map((i) => comps[i]!);
  const test = order.slice(half).map((i) => comps[i]!);
  const split = forms.map((f) => {
    const pred = f.fit(train);
    const errs = test.map((p) => Math.abs(Math.log(p.mcap_usd!) - Math.log(Math.max(1, pred(p)))));
    return { form: f.form, ...summarizeErrs(errs) };
  });
  // 消融：曲线 alone / +growth / +growth+maturity / +breadth / 类别中位数 alone / 类别中位数全套。
  const ablationDefs: { config: string; price: (fit: CurveFit, p: SnapshotProtocol) => number }[] = [
    { config: 'curve alone', price: (f, p) => curveValue(f, p.tvl_usd) },
    {
      config: 'curve + growth',
      price: (f, p) => curveValue(f, p.tvl_usd) * growthMultiplier(p.change_7d, model).mult,
    },
    {
      config: 'curve + growth + maturity',
      price: (f, p) =>
        curveValue(f, p.tvl_usd) * growthMultiplier(p.change_7d, model).mult * maturityMultiplier(ageDays(snapshot.as_of, p.listed_at), model),
    },
    {
      config: 'curve + growth + maturity + breadth',
      price: (f, p) =>
        curveValue(f, p.tvl_usd) *
        growthMultiplier(p.change_7d, model).mult *
        maturityMultiplier(ageDays(snapshot.as_of, p.listed_at), model) *
        (1 + 0.04 * Math.min(Math.max(p.chains.length - 1, 0), 4)),
    },
  ];
  const ablation = ablationDefs.map((d) => {
    const errs: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const trainC = comps.filter((_, j) => j !== i);
      const f = fitLogLog(trainC);
      errs.push(Math.abs(Math.log(comps[i]!.mcap_usd!) - Math.log(Math.max(1, d.price(f, comps[i]!)))));
    }
    return { config: d.config, ...summarizeErrs(errs) };
  });
  // 类别中位数（radar-2 的做法）放进消融：每折重新算类别倍数。
  const catAblation = (withMults: boolean): { config: string; median_abs_log_error: number; within_2x: number } => {
    const errs: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const trainC = comps.filter((_, j) => j !== i);
      const g = clamp(median(trainC.map((q) => q.mcap_usd! / q.tvl_usd)) ?? 0.2, 0.08, 0.5);
      const p = comps[i]!;
      const ratios = trainC.filter((q) => (q.category ?? 'Other') === (p.category ?? 'Other')).map((q) => q.mcap_usd! / q.tvl_usd);
      const raw = median(ratios);
      const usable = raw !== null && ratios.length >= 3 ? clamp(raw, 0.08, 0.5) : g;
      const mult = clamp((usable + g) / 2, 0.08, 0.5);
      let pred = p.tvl_usd * mult;
      if (withMults) {
        pred *= growthMultiplier(p.change_7d, model).mult * maturityMultiplier(ageDays(snapshot.as_of, p.listed_at), model) * (1 + 0.04 * Math.min(Math.max(p.chains.length - 1, 0), 4));
      }
      errs.push(Math.abs(Math.log(p.mcap_usd!) - Math.log(Math.max(1, pred))));
    }
    return { config: withMults ? 'category median + growth + maturity + breadth' : 'category median alone', ...summarizeErrs(errs) };
  };
  ablation.push(catAblation(false), catAblation(true));
  // Launch odds 验证：留一 Brier / log loss，对比基准率；按上榜日期分半验证。
  const cohort = snapshot.protocols.filter((p) => p.listed_at !== null && p.category !== 'CEX' && !VERSIONED.test(p.name));
  const baseRate = cohort.filter((p) => !isPreToken(p)).length / cohort.length;
  const oddsTable = launchOddsTable(snapshot, model);
  const brier = (probs: number[], actual: number[]): number => {
    let s = 0;
    for (let i = 0; i < probs.length; i++) s += (probs[i]! - actual[i]!) ** 2;
    return s / probs.length;
  };
  const logLoss = (probs: number[], actual: number[]): number => {
    let s = 0;
    for (let i = 0; i < probs.length; i++) {
      const q = clamp(probs[i]!, 0.001, 0.999);
      s += actual[i]! === 1 ? -Math.log(q) : -Math.log(1 - q);
    }
    return s / probs.length;
  };
  // 留一：每折用其余队列重算 odds 表（桶比率与格子比率都重算）。
  const looProbs: number[] = [];
  const actual: number[] = [];
  for (let i = 0; i < cohort.length; i++) {
    const rest = cohort.filter((_, j) => j !== i);
    const restSnap: Snapshot = { ...snapshot, protocols: rest };
    const t = launchOddsTable(restSnap, model);
    const p = cohort[i]!;
    looProbs.push(t.oddsFor(p, ageDays(snapshot.as_of, p.listed_at)));
    actual.push(isPreToken(p) ? 0 : 1);
  }
  const baseProbs = actual.map(() => baseRate);
  // 时间分半：按上榜日期排，老一半拟合、新一半测试。
  const byDate = [...cohort].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const cut = Math.floor(byDate.length / 2);
  const oldSnap: Snapshot = { ...snapshot, protocols: byDate.slice(0, cut) };
  const oldTable = launchOddsTable(oldSnap, model);
  const newHalf = byDate.slice(cut);
  const tsProbs = newHalf.map((p) => oldTable.oddsFor(p, ageDays(snapshot.as_of, p.listed_at)));
  const tsActual = newHalf.map((p) => (isPreToken(p) ? 0 : 1));
  const tsBase = newHalf.filter((p) => !isPreToken(p)).length / newHalf.length;
  const odds = {
    loo_brier: round3(brier(looProbs, actual)),
    base_brier: round3(brier(baseProbs, actual)),
    loo_log_loss: round3(logLoss(looProbs, actual)),
    base_log_loss: round3(logLoss(baseProbs, actual)),
    time_split_brier: round3(brier(tsProbs, tsActual)),
    time_split_base_brier: round3(brier(tsActual.map(() => tsBase), tsActual)),
  };
  // 按类别 LOO（曲线）：样本 >= 5 的类别。
  const perCategory: { category: string; comps: number; median_abs_log_error: number }[] = [];
  for (const cat of [...new Set(comps.map((p) => p.category ?? 'Other'))].sort()) {
    const g = comps.filter((p) => (p.category ?? 'Other') === cat);
    if (g.length < 5) continue;
    const errs = g.map((p) => {
      const trainC = comps.filter((q) => q.slug !== p.slug);
      const f = fitLogLog(trainC);
      return Math.abs(Math.log(p.mcap_usd!) - Math.log(Math.max(1, curveValue(f, p.tvl_usd))));
    });
    perCategory.push({ category: cat, comps: g.length, median_abs_log_error: round3(median(errs) ?? 0) });
  }
  perCategory.sort((a, b) => a.median_abs_log_error - b.median_abs_log_error);
  return {
    loo,
    split,
    ablation,
    odds,
    per_category_loo: perCategory,
    grid_search: grid ?? gridSearch(snapshot),
    walk_forward: walkForward(snapshot, model),
    conformal: conformalQuantiles(snapshot, model),
  };
}

/** 主链的 gas 定价：一条链一次交易的美元价。 */
export function gasUsd(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 12;
  if (c === 'bitcoin') return 2;
  if (c === 'solana') return 0.05;
  if (['arbitrum', 'optimism', 'base', 'polygon', 'zksync', 'scroll', 'linea', 'blast', 'mantle', 'mode', 'ink', 'unichain', 'katana', 'world chain'].includes(c)) return 1;
  return 0.5;
}

/** 协议的第一条链，没有就用中性说法。 */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** 按 TVL 定一档本金：越大越值得多放一点，但永远只是小仓位。 */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** 按年龄定持有天数：越年轻的协议，越要拉长合格窗口。 */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Farm 的净成本与耗时：本金 + 每次交易的 gas（2 次建仓 + 每周 1 次 + 1 次退出）。 */
export function farmEconomics(p: SnapshotProtocol, age: number | null): { capital: number; gas_usd: number; total_cost_usd: number; hours: number; hold_days: number } {
  const capital = capitalFor(p);
  const gas = gasUsd(chainOf(p));
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const gasTotal = Math.round((2 * gas + weeks * gas + gas) * 100) / 100;
  const hours = Math.round((0.5 + weeks * (10 / 60) + 0.25) * 10) / 10;
  return { capital, gas_usd: gasTotal, total_cost_usd: Math.round((capital + gasTotal) * 100) / 100, hours, hold_days: hold };
}

/** 按类别给一个可执行的动作：名字、链、本金都填进去，不写口号。 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction'))
    return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('chain'))
    return `Use $${capital} on ${name}'s chain on ${chain}: send one transaction a week and keep the wallet active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** 同类别的第二个动作：只做一次不算活跃，换一个功能再做一次。 */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Borrow a small amount against the ${name} deposit on ${chain} and repay it within the week.`;
  if (c.includes('dex') || c.includes('yield'))
    return `Swap a small amount through ${name} on ${chain} so the wallet shows both providing and trading.`;
  if (c.includes('bridge'))
    return `Bridge a smaller amount back through ${name} so the wallet shows two-way use.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('rwa'))
    return `Claim or restake the vault yield on ${name} once, instead of letting it sit untouched.`;
  return `Vote or join one community action on ${name} on ${chain} so the wallet shows more than deposits.`;
}

/** 类别风险步：每个类别最该先查的风险，不写口号。 */
function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm'))
    return `Check the impermanent loss on ${name}'s pool first: if the pair moves apart, the loss can exceed a week of yield, so size the position to survive it.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Check the health factor on ${name} before you borrow: keep it above 2 so a price dip cannot liquidate the deposit.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis'))
    return `Check the funding rate on ${name} first: a high rate eats the position every eight hours, so close it if the rate stays against you.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Check the unbonding wait on ${name} before you stake: the funds cannot move until the wait ends, so never stake money you need this month.`;
  if (c.includes('stable'))
    return `Check the peg and the backing of ${name}'s stable asset first: if it trades below $1, do not mint more until the peg holds.`;
  if (c.includes('rwa'))
    return `Check what backs ${name}'s yield asset and who can redeem it: if the backing is not verifiable, treat the yield as a claim, not a fact.`;
  if (c.includes('bridge'))
    return `Check the bridge's own security record on ${name} first: a bridge that has been drained before is a reason to keep the position small.`;
  if (c.includes('insurance'))
    return `Read what ${name}'s cover actually pays for before you buy: a policy that excludes the risk you fear is money spent on nothing.`;
  return `Read ${name}'s own docs for the one risk its category is known for, and size the position so that risk cannot take the whole deposit.`;
}

/**
 * 一个协议的 farm 计划：8 步，每步都有动作、成本和耗时。
 * 全部从协议自己的记录（类别、链、TVL、年龄）推导，不写死任何名字。
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasUsd(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  const risk = riskFor(p);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm on ${p.name}, and keep its seed phrase offline on paper.`,
      cost: `under $${Math.max(3, gas)} of gas for the first transaction`,
      time: '5 minutes',
    },
    { text: action, cost: `$${capital} of capital and about $${gas} of gas on ${chain}`, time: '15 minutes to set up' },
    { text: second, cost: `about $${gas} of gas`, time: '10 minutes' },
    { text: risk, cost: 'nothing to check', time: '10 minutes' },
    {
      text: `Make one qualifying action each week on ${p.name}, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw from ${p.name}, open its own points or rewards page and claim only from the link it publishes; never pay to claim and never follow a claim link from a direct message.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `If ${p.name} issues a token, check its vesting and claim window first, then decide to hold or sell on the protocol's TVL and revenue, not on the launch-day price.`,
      cost: `one claim transaction, about $${gas} of gas`,
      time: '15 minutes',
    },
  ];
}

/** 一条步骤拼成一句话：动作 + 成本 + 耗时，夹在门禁的 20..600 字符。 */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** 已发币协议按市值排前几名：dashboard 的对照表用，市场价是事实，不是模型。 */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** 按 slug 查协议。 */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** 一个协议的隐含价值：曲线 x 增长 x 成熟。 */
export function impliedOf(
  p: SnapshotProtocol,
  asOf: string,
  fit: CurveFit,
  model: ModelConstants = MODEL,
): { implied: number; curve: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const curve = curveValue(fit, p.tvl_usd);
  const { pct, mult: growthMult } = growthMultiplier(p.change_7d, model);
  const maturityMult = maturityMultiplier(age, model);
  const implied = Math.max(1, Math.round(curve * growthMult * maturityMult));
  return { implied, curve: Math.round(curve), growthPct: pct, growthMult, maturityMult, age };
}

/** 排名板：全部 watchlist + 全部可排名的 pre-token 协议，按隐含价值从高到低。 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const fit = fitLogLog(liveComps(snapshot));
  const { oddsFor } = launchOddsTable(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // watchlist 是底线：一个都不能少。
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // 早期雷达：watchlist 之外所有可排名的 pre-token 协议，全部收进。
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  // Bootstrap：曲线在 comps 上重拟合 200 次（有种子），每行带 p10-p90 区间与排名区间。
  const comps = liveComps(snapshot);
  const rng = mulberry32(model.bootstrap_seed);
  const scored = [...chosen.values()].map((p) => {
    const v = impliedOf(p, snapshot.as_of, fit, model);
    const odds = oddsFor(p, v.age);
    return { p, ...v, odds, expected: Math.max(1, Math.round(v.implied * odds)) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const impliedRanges = new Map<string, number[]>();
  const rankRanges = new Map<string, number[]>();
  for (let d = 0; d < model.bootstrap_draws; d++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rng() * comps.length)]!);
    const bf = fitLogLog(sample);
    const boot = scored.map((s) => {
      const curve = curveValue(bf, s.p.tvl_usd);
      return { slug: s.p.slug, implied: Math.max(1, Math.round(curve * s.growthMult * s.maturityMult)) };
    });
    boot.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    boot.forEach((b, i) => {
      const iv = impliedRanges.get(b.slug) ?? [];
      iv.push(b.implied);
      impliedRanges.set(b.slug, iv);
      const rr = rankRanges.get(b.slug) ?? [];
      rr.push(i + 1);
      rankRanges.set(b.slug, rr);
    });
  }
  // Conformal 区间：整模型的留一残差分位数（按类别，薄类别用全局兜底）。
  const conf = conformalQuantiles(snapshot, model);
  const confQ = (category: string | null): number => {
    const hit = conf.categories.find((c) => c.category === (category ?? 'Other'));
    return hit ? hit.q80_log : conf.global_q80_log;
  };
  const pct = (vals: number[], q: number): number => {
    const sorted = [...vals].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  };
  return scored.map((s, i) => {
    const econ = farmEconomics(s.p, s.age);
    const ivs = impliedRanges.get(s.p.slug) ?? [s.implied];
    const rrs = rankRanges.get(s.p.slug) ?? [i + 1];
    const p10 = pct(ivs, 0.1);
    const kin = nearestKin(s.p, comps);
    const q = confQ(s.p.category);
    let verdict: 'farm' | 'thin' | 'skip';
    if (econ.gas_usd > econ.capital || p10 < 1_000_000) verdict = 'skip';
    else if (econ.gas_usd > 0.5 * econ.capital || p10 < 10_000_000) verdict = 'thin';
    else verdict = 'farm';
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: s.implied,
      expected_value_usd: s.expected,
      launch_odds: s.odds,
      implied_p10_usd: p10,
      implied_p90_usd: pct(ivs, 0.9),
      conformal_p10_usd: Math.max(1, Math.round(s.implied * Math.exp(-q))),
      conformal_p90_usd: Math.round(s.implied * Math.exp(q)),
      kin_slug: kin.slug,
      kin_name: kin.name,
      kin_mcap_usd: kin.mcap_usd,
      kin_tvl_usd: kin.tvl_usd,
      kin_ratio: kin.ratio,
      rank_p10: pct(rrs, 0.1),
      rank_p90: pct(rrs, 0.9),
      farm_verdict: verdict,
      farm_cost_usd: econ.total_cost_usd,
      farm_hours: econ.hours,
      model: {
        curve_intercept: fit.intercept,
        curve_slope: fit.slope,
        curve_value_usd: s.curve,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** board 行的精简版，供 data.js 用；watchlist 由 buildRadar 补上。 */
export function radarRow(row: BoardRow, watchlist = false): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    expected_value_usd: row.expected_value_usd,
    launch_odds: row.launch_odds,
    implied_p10_usd: row.implied_p10_usd,
    implied_p90_usd: row.implied_p90_usd,
    conformal_p10_usd: row.conformal_p10_usd,
    conformal_p90_usd: row.conformal_p90_usd,
    kin_slug: row.kin_slug,
    kin_name: row.kin_name,
    kin_mcap_usd: row.kin_mcap_usd,
    kin_tvl_usd: row.kin_tvl_usd,
    kin_ratio: row.kin_ratio,
    rank_p10: row.rank_p10,
    rank_p90: row.rank_p90,
    farm_verdict: row.farm_verdict,
    farm_cost_usd: row.farm_cost_usd,
    farm_hours: row.farm_hours,
    watchlist,
    curve_value_usd: row.model.curve_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** dashboard 需要的全部数据：board、live 对照、曲线、odds、验证、审计。
 *  先网格搜索常数：board 和验证都用搜索赢的那组常数，同一份快照永远同一组。 */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const grid = gridSearch(snapshot);
  const winner: ModelConstants = {
    ...model,
    growth_weight_up: grid.best.growth_weight_up,
    growth_weight_down: grid.best.growth_weight_down,
    maturity_floor: grid.best.maturity_floor,
    maturity_range: 1 - grid.best.maturity_floor,
    maturity_halflife_days: grid.best.maturity_halflife_days,
  };
  const board = buildBoard(snapshot, winner);
  const live = liveRows(snapshot);
  const fit = fitLogLog(liveComps(snapshot));
  const { buckets } = launchOddsTable(snapshot, winner);
  const validation = validateModel(snapshot, winner, grid);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const preTokenTotal = snapshot.protocols.length - liveTotal;
  const excluded: ExcludedRow[] = snapshot.protocols
    .filter((p) => isPreToken(p) && !isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: exclusionReason(p) ?? '' }));
  const funnel = [
    { step: 'Protocols in the snapshot', count: snapshot.protocols.length },
    { step: 'Pre-token (no token recorded)', count: preTokenTotal },
    { step: 'Rankable after the house screen', count: board.length },
    { step: 'Watchlist, all on the board', count: snapshot.watchlist.length },
    { step: 'Live-token, set aside', count: liveTotal },
  ];
  const catSums = new Map<string, { rows: number; sum: number }>();
  for (const r of board) {
    const key = r.category ?? 'Other';
    const e = catSums.get(key) ?? { rows: 0, sum: 0 };
    e.rows += 1;
    e.sum += r.implied_value_usd;
    catSums.set(key, e);
  }
  const categoryTotals = [...catSums.entries()]
    .map(([category, e]) => ({ category, rows: e.rows, combined_implied_usd: e.sum }))
    .sort((a, b) => b.combined_implied_usd - a.combined_implied_usd);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: winner,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    live_total: liveTotal,
    pre_token_total: preTokenTotal,
    excluded_size: excluded.length,
    funnel,
    category_totals: categoryTotals,
    curve: fit,
    odds_buckets: buckets,
    validation,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
    excluded,
  };
  return { board, radar };
}

/** 快照文本解析成 Snapshot，形状不对就拒绝。 */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** board 哪里不符合门禁就返回原因，通过返回 null：覆盖、排名、顺序、farm 步数、隐含价值。 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board has ${board.length} rows, fewer than the 100-row floor`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** dashboard 用的 data.js：整份数据集写成一个脚本，不请求网络。 */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
