// Metric Graph Engine — semantic metric model, formulas, scenarios, impact, validation

// ── Types ──────────────────────────────────────────────────────────────

export type MetricKind = 'input' | 'derived' | 'observed' | 'assumption' | 'target' | 'benchmark';
export type MetricRole = 'north_star' | 'driver' | 'intermediate' | 'output' | 'guardrail' | 'diagnostic' | 'input';
export type MetricUnit = 'currency' | 'count' | 'percent' | 'ratio' | 'duration' | 'score' | 'rate' | 'index';
export type MetricDomain = 'monetization' | 'finance' | 'acquisition' | 'retention' | 'engagement' | 'product' | 'operations' | 'growth';
export type MetricStatus = 'valid' | 'draft' | 'warning' | 'error' | 'incomplete';
export type RelationType = 'calc' | 'influence';

export interface MetricDef {
  id: string;
  name: string;
  kind: MetricKind;
  unit: string;        // display unit like ₽, %, x, mo, users, pts
  unitType: MetricUnit; // semantic unit type
  value: number;
  description: string;
  domain: MetricDomain;
  role: MetricRole;
  status: MetricStatus;
  formula?: (m: Record<string, MetricDef>) => number;
  formulaDisplay?: string; // human-readable formula
  position: { x: number; y: number };
  col: number;
}

export interface Edge {
  from: string;
  to: string;
  type: RelationType;
  sign: number;
  weight?: number;
}

export interface Scenario {
  label: string;
  description: string;
  overrides?: Record<string, number>;
}

// ── Metric Catalog (library of standard metrics) ─────────────────────

export interface CatalogMetric {
  id: string;
  name: string;
  kind: MetricKind;
  unit: string;
  unitType: MetricUnit;
  description: string;
  domain: MetricDomain;
  role: MetricRole;
  defaultValue: number;
  formula?: (m: Record<string, MetricDef>) => number;
  formulaDisplay?: string;
  dependencies?: string[]; // metric ids this depends on
  category: string;
}

export const metricCatalog: CatalogMetric[] = [
  // ── Acquisition ──
  { id: 'traffic', name: 'Qualified Traffic', kind: 'input', unit: 'users', unitType: 'count', description: 'Квалифицированный трафик', domain: 'acquisition', role: 'input', defaultValue: 12000, category: 'Acquisition' },
  { id: 'conversion', name: 'Conversion Rate', kind: 'input', unit: '%', unitType: 'percent', description: 'Конверсия в оплату', domain: 'acquisition', role: 'input', defaultValue: 12, category: 'Acquisition' },
  { id: 'cac', name: 'CAC', kind: 'input', unit: '₽', unitType: 'currency', description: 'Стоимость привлечения клиента', domain: 'acquisition', role: 'input', defaultValue: 2500, category: 'Acquisition' },
  { id: 'newCustomers', name: 'New Customers', kind: 'derived', unit: 'users', unitType: 'count', description: 'Трафик × Конверсия', domain: 'acquisition', role: 'output', defaultValue: 0, formulaDisplay: 'traffic × conversion', dependencies: ['traffic', 'conversion'], formula: (m) => m.traffic.value * (m.conversion.value / 100), category: 'Acquisition' },
  { id: 'signups', name: 'Signups', kind: 'input', unit: 'users', unitType: 'count', description: 'Кол-во регистраций за период', domain: 'acquisition', role: 'input', defaultValue: 5000, category: 'Acquisition' },
  { id: 'activationRate', name: 'Activation Rate', kind: 'input', unit: '%', unitType: 'percent', description: 'Доля пользователей, достигших Time to Value', domain: 'product', role: 'diagnostic', defaultValue: 35, category: 'Acquisition' },
  // ── Monetization ──
  { id: 'price', name: 'Price (ARPU)', kind: 'input', unit: '₽', unitType: 'currency', description: 'Средний чек / цена подписки за период', domain: 'monetization', role: 'input', defaultValue: 1200, category: 'Monetization' },
  { id: 'arpu', name: 'ARPU', kind: 'derived', unit: '₽', unitType: 'currency', description: 'Средняя выручка на клиента', domain: 'monetization', role: 'driver', defaultValue: 0, formulaDisplay: 'price', dependencies: ['price'], formula: (m) => m.price.value, category: 'Monetization' },
  { id: 'arppu', name: 'ARPPU', kind: 'input', unit: '₽', unitType: 'currency', description: 'Выручка на платящего пользователя', domain: 'monetization', role: 'driver', defaultValue: 2400, category: 'Monetization' },
  { id: 'mrr', name: 'MRR', kind: 'derived', unit: '₽', unitType: 'currency', description: 'Monthly Recurring Revenue', domain: 'monetization', role: 'output', defaultValue: 0, formulaDisplay: 'price × activeCustomers', dependencies: ['price'], formula: (m) => m.price.value * (m.newCustomers?.value ?? 0), category: 'Monetization' },
  { id: 'aov', name: 'AOV', kind: 'input', unit: '₽', unitType: 'currency', description: 'Средний чек (Average Order Value)', domain: 'monetization', role: 'driver', defaultValue: 3500, category: 'Monetization' },
  // ── Finance / Costs ──
  { id: 'cogs', name: 'Variable Cost (COGS)', kind: 'input', unit: '₽', unitType: 'currency', description: 'Переменные затраты на единицу', domain: 'finance', role: 'input', defaultValue: 420, category: 'Finance' },
  { id: 'grossMargin', name: 'Gross Margin', kind: 'derived', unit: '%', unitType: 'percent', description: 'Валовая маржа', domain: 'finance', role: 'driver', defaultValue: 0, formulaDisplay: '(price - cogs) / price × 100', dependencies: ['price', 'cogs'], formula: (m) => ((m.price.value - m.cogs.value) / Math.max(m.price.value, 1)) * 100, category: 'Finance' },
  { id: 'opex', name: 'OpEx', kind: 'input', unit: '₽', unitType: 'currency', description: 'Операционные расходы за период', domain: 'finance', role: 'guardrail', defaultValue: 500000, category: 'Finance' },
  { id: 'burnRate', name: 'Burn Rate', kind: 'input', unit: '₽', unitType: 'currency', description: 'Скорость расходования средств', domain: 'finance', role: 'guardrail', defaultValue: 120000, category: 'Finance' },
  // ── Retention ──
  { id: 'churn', name: 'Churn Rate', kind: 'input', unit: '%', unitType: 'percent', description: 'Отток клиентов за месяц', domain: 'retention', role: 'input', defaultValue: 8, category: 'Retention' },
  { id: 'retentionRate', name: 'Retention Rate', kind: 'derived', unit: '%', unitType: 'percent', description: '100% − Churn Rate', domain: 'retention', role: 'driver', defaultValue: 0, formulaDisplay: '100 - churn', dependencies: ['churn'], formula: (m) => 100 - (m.churn?.value ?? 0), category: 'Retention' },
  { id: 'nrr', name: 'Net Revenue Retention', kind: 'input', unit: '%', unitType: 'percent', description: 'Чистое удержание выручки', domain: 'retention', role: 'output', defaultValue: 105, category: 'Retention' },
  // ── Unit Economics ──
  { id: 'ltv', name: 'LTV', kind: 'derived', unit: '₽', unitType: 'currency', description: 'ARPU × Gross Margin × Lifetime', domain: 'finance', role: 'output', defaultValue: 0, formulaDisplay: 'arpu × grossMargin × (1 / churn)', dependencies: ['arpu', 'grossMargin', 'churn'], formula: (m) => { const arpu = m.arpu.value; const gm = m.grossMargin.value / 100; const lifetime = 1 / Math.max(m.churn.value / 100, 0.001); return arpu * gm * lifetime; }, category: 'Unit Economics' },
  { id: 'payback', name: 'CAC Payback', kind: 'derived', unit: 'mo', unitType: 'duration', description: 'Срок окупаемости CAC', domain: 'finance', role: 'guardrail', defaultValue: 0, formulaDisplay: 'cac / (price - cogs)', dependencies: ['cac', 'price', 'cogs'], formula: (m) => m.cac.value / Math.max(m.price.value - m.cogs.value, 1), category: 'Unit Economics' },
  { id: 'ltvCac', name: 'LTV / CAC', kind: 'derived', unit: 'x', unitType: 'ratio', description: 'Ключевой коэффициент unit-экономики', domain: 'finance', role: 'north_star', defaultValue: 0, formulaDisplay: 'ltv / cac', dependencies: ['ltv', 'cac'], formula: (m) => m.ltv.value / Math.max(m.cac.value, 1), category: 'Unit Economics' },
  { id: 'monthlyContribution', name: 'Monthly Contribution', kind: 'derived', unit: '₽', unitType: 'currency', description: 'Месячный contribution от новых клиентов', domain: 'finance', role: 'output', defaultValue: 0, formulaDisplay: '(price - cogs) × newCustomers - cac × newCustomers', dependencies: ['price', 'cogs', 'newCustomers', 'cac'], formula: (m) => (m.price.value - m.cogs.value) * m.newCustomers.value - m.cac.value * m.newCustomers.value, category: 'Unit Economics' },
  { id: 'health', name: 'Health Score', kind: 'derived', unit: 'pts', unitType: 'score', description: 'Сводный score модели', domain: 'finance', role: 'north_star', defaultValue: 0, formulaDisplay: 'composite(ltvCac, payback, grossMargin)', dependencies: ['ltvCac', 'payback', 'grossMargin'], formula: (m) => { const ratioScore = Math.min((m.ltvCac.value / 3) * 40, 40); const paybackScore = Math.max(0, 30 - m.payback.value * 2); const marginScore = Math.min((m.grossMargin.value / 70) * 30, 30); return ratioScore + paybackScore + marginScore; }, category: 'Unit Economics' },
  // ── Growth ──
  { id: 'revenueGrowth', name: 'Revenue Growth Rate', kind: 'input', unit: '%', unitType: 'percent', description: 'Темп роста выручки MoM', domain: 'growth', role: 'driver', defaultValue: 15, category: 'Growth' },
  { id: 'viralCoeff', name: 'Viral Coefficient', kind: 'input', unit: 'x', unitType: 'ratio', description: 'K-factor вирального роста', domain: 'growth', role: 'driver', defaultValue: 0.3, category: 'Growth' },
  // ── Marketplace ──
  { id: 'gmv', name: 'GMV', kind: 'input', unit: '₽', unitType: 'currency', description: 'Gross Merchandise Value', domain: 'monetization', role: 'output', defaultValue: 5000000, category: 'Marketplace' },
  { id: 'takeRate', name: 'Take Rate', kind: 'input', unit: '%', unitType: 'percent', description: 'Комиссия платформы', domain: 'monetization', role: 'driver', defaultValue: 15, category: 'Marketplace' },
];

// ── Default edges for the SaaS template ─────────────────────────────

export const defaultEdges: Edge[] = [
  { from: 'price', to: 'arpu', type: 'calc', sign: 1 },
  { from: 'price', to: 'grossMargin', type: 'calc', sign: 1 },
  { from: 'cogs', to: 'grossMargin', type: 'calc', sign: -1 },
  { from: 'churn', to: 'ltv', type: 'calc', sign: -1 },
  { from: 'arpu', to: 'ltv', type: 'calc', sign: 1 },
  { from: 'grossMargin', to: 'ltv', type: 'calc', sign: 1 },
  { from: 'traffic', to: 'newCustomers', type: 'calc', sign: 1 },
  { from: 'conversion', to: 'newCustomers', type: 'calc', sign: 1 },
  { from: 'cac', to: 'payback', type: 'calc', sign: 1 },
  { from: 'price', to: 'payback', type: 'calc', sign: -1 },
  { from: 'cogs', to: 'payback', type: 'calc', sign: 1 },
  { from: 'ltv', to: 'ltvCac', type: 'calc', sign: 1 },
  { from: 'cac', to: 'ltvCac', type: 'calc', sign: -1 },
  { from: 'newCustomers', to: 'monthlyContribution', type: 'calc', sign: 1 },
  { from: 'price', to: 'monthlyContribution', type: 'calc', sign: 1 },
  { from: 'cogs', to: 'monthlyContribution', type: 'calc', sign: -1 },
  { from: 'cac', to: 'monthlyContribution', type: 'calc', sign: -1 },
  { from: 'ltvCac', to: 'health', type: 'influence', sign: 1, weight: 0.5 },
  { from: 'payback', to: 'health', type: 'influence', sign: -1, weight: 0.25 },
  { from: 'grossMargin', to: 'health', type: 'influence', sign: 1, weight: 0.25 },
];

// ── Default positions ───────────────────────────────────────────────

export const defaultPositions: Record<string, { x: number; y: number; col: number }> = {
  price:      { x: 60,  y: 80,  col: 0 },
  cogs:       { x: 60,  y: 230, col: 0 },
  churn:      { x: 60,  y: 380, col: 0 },
  traffic:    { x: 60,  y: 530, col: 0 },
  conversion: { x: 60,  y: 680, col: 0 },
  cac:        { x: 60,  y: 830, col: 0 },
  arpu:         { x: 420, y: 80,  col: 1 },
  grossMargin:  { x: 420, y: 260, col: 1 },
  newCustomers: { x: 420, y: 600, col: 1 },
  ltv:     { x: 780, y: 170,  col: 2 },
  payback: { x: 780, y: 400, col: 2 },
  monthlyContribution: { x: 780, y: 600, col: 2 },
  ltvCac: { x: 1140, y: 170,  col: 3 },
  health: { x: 1140, y: 420, col: 3 },
};

// ── Scenarios ───────────────────────────────────────────────────────

export const scenarios: Record<string, Scenario> = {
  base: { label: 'Base', description: 'Текущие значения без изменений' },
  growth: { label: 'Growth', description: 'Агрессивный рост трафика и конверсии', overrides: { price: 1250, conversion: 14, traffic: 15000, cac: 2700 } },
  efficiency: { label: 'Efficiency', description: 'Оптимизация затрат и удержания', overrides: { cogs: 350, churn: 6.5, cac: 2200 } },
};

// ── Model State (mutable) ───────────────────────────────────────────

export interface ModelState {
  metrics: Record<string, MetricDef>;
  edges: Edge[];
}

export function createDefaultModel(): ModelState {
  const metrics: Record<string, MetricDef> = {};
  const defaultIds = ['price', 'cogs', 'churn', 'cac', 'conversion', 'traffic', 'arpu', 'grossMargin', 'newCustomers', 'ltv', 'payback', 'ltvCac', 'monthlyContribution', 'health'];

  for (const cat of metricCatalog) {
    if (defaultIds.includes(cat.id)) {
      const pos = defaultPositions[cat.id] || { x: 100, y: 100, col: 0 };
      metrics[cat.id] = {
        id: cat.id,
        name: cat.name,
        kind: cat.kind,
        unit: cat.unit,
        unitType: cat.unitType,
        value: cat.defaultValue,
        description: cat.description,
        domain: cat.domain,
        role: cat.role,
        status: 'valid',
        formula: cat.formula,
        formulaDisplay: cat.formulaDisplay,
        position: { x: pos.x, y: pos.y },
        col: pos.col,
      };
    }
  }
  return { metrics, edges: [...defaultEdges] };
}

// ── Topological sort for eval order ─────────────────────────────────

function topoSort(metrics: Record<string, MetricDef>, edges: Edge[]): string[] {
  const derived = Object.keys(metrics).filter(id => metrics[id].kind === 'derived' || (metrics[id].formula && metrics[id].kind !== 'input'));
  const inDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const id of derived) {
    inDegree[id] = 0;
    adj[id] = [];
  }
  for (const e of edges) {
    if (e.type === 'calc' && derived.includes(e.to)) {
      if (derived.includes(e.from)) {
        adj[e.from].push(e.to);
        inDegree[e.to] = (inDegree[e.to] || 0) + 1;
      }
    }
  }
  // also count inputs -> derived (inDegree stays 0 for those receiving only from inputs)
  const queue = derived.filter(id => (inDegree[id] || 0) === 0);
  const result: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    result.push(cur);
    for (const next of (adj[cur] || [])) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }
  // add remaining that didn't make it (fallback)
  for (const id of derived) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

// ── Compute ─────────────────────────────────────────────────────────

export function computeMetrics(model: ModelState, scenarioKey: string, inputOverrides: Record<string, number>): Record<string, MetricDef> {
  const scenarioOverrides = scenarios[scenarioKey]?.overrides || {};
  const metrics: Record<string, MetricDef> = {};
  for (const [id, m] of Object.entries(model.metrics)) {
    metrics[id] = { ...m };
  }
  // Apply scenario then user overrides for inputs
  for (const [id, value] of Object.entries(scenarioOverrides)) {
    if (metrics[id] && (metrics[id].kind === 'input' || metrics[id].kind === 'assumption')) metrics[id].value = value;
  }
  for (const [id, value] of Object.entries(inputOverrides)) {
    if (metrics[id]) metrics[id].value = value;
  }
  // Evaluate derived in topo order
  const evalOrder = topoSort(metrics, model.edges);
  for (const id of evalOrder) {
    if (metrics[id].formula) {
      try {
        metrics[id].value = metrics[id].formula!(metrics);
        metrics[id].status = 'valid';
      } catch {
        metrics[id].status = 'error';
        metrics[id].value = 0;
      }
    }
  }
  return metrics;
}

export function computeImpact(selectedId: string, model: ModelState, scenarioKey: string, inputOverrides: Record<string, number>, current: Record<string, MetricDef>): Record<string, number> {
  const selected = current[selectedId];
  if (!selected || selected.kind !== 'input') return {};
  const changed = { ...inputOverrides, [selectedId]: (inputOverrides[selectedId] ?? current[selectedId].value) * 1.1 };
  const shifted = computeMetrics(model, scenarioKey, changed);
  const impacts: Record<string, number> = {};
  for (const id of Object.keys(current)) {
    const before = current[id].value;
    const after = shifted[id].value;
    impacts[id] = ((after - before) / Math.max(Math.abs(before), 1e-6)) * 100;
  }
  return impacts;
}

// ── Validation ──────────────────────────────────────────────────────

export function detectCycle(edges: Edge[], newFrom: string, newTo: string): boolean {
  // BFS from newTo to see if we can reach newFrom
  const adj: Record<string, string[]> = {};
  for (const e of edges) {
    if (e.type === 'calc') {
      if (!adj[e.from]) adj[e.from] = [];
      adj[e.from].push(e.to);
    }
  }
  if (!adj[newFrom]) adj[newFrom] = [];
  adj[newFrom].push(newTo);

  const visited = new Set<string>();
  const queue = [newTo];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === newFrom) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of (adj[cur] || [])) {
      queue.push(next);
    }
  }
  return false;
}

// ── Auto-layout ─────────────────────────────────────────────────────

export function autoLayout(model: ModelState): Record<string, { x: number; y: number }> {
  const { metrics, edges } = model;
  const ids = Object.keys(metrics);
  if (ids.length === 0) return {};

  // Compute column/level from edges: inputs are col 0, derived from inputs are col 1, etc.
  const inCalcEdges: Record<string, string[]> = {};
  for (const e of edges) {
    if (e.type === 'calc') {
      if (!inCalcEdges[e.to]) inCalcEdges[e.to] = [];
      inCalcEdges[e.to].push(e.from);
    }
  }

  const levels: Record<string, number> = {};
  function getLevel(id: string, visited: Set<string>): number {
    if (levels[id] !== undefined) return levels[id];
    if (visited.has(id)) return 0;
    visited.add(id);
    const parents = inCalcEdges[id] || [];
    if (parents.length === 0) {
      levels[id] = 0;
      return 0;
    }
    const maxParent = Math.max(...parents.map(p => getLevel(p, visited)));
    levels[id] = maxParent + 1;
    return levels[id];
  }
  for (const id of ids) getLevel(id, new Set());

  // Group by level
  const byLevel: Record<number, string[]> = {};
  for (const id of ids) {
    const lvl = levels[id] ?? 0;
    if (!byLevel[lvl]) byLevel[lvl] = [];
    byLevel[lvl].push(id);
  }

  const COL_GAP = 360;
  const ROW_GAP = 150;
  const START_X = 60;
  const START_Y = 80;
  const CARD_H = 130;

  const positions: Record<string, { x: number; y: number }> = {};
  const sortedLevels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);

  for (const lvl of sortedLevels) {
    const col = byLevel[lvl];
    const totalH = col.length * CARD_H + (col.length - 1) * (ROW_GAP - CARD_H);
    const startY = START_Y;
    col.forEach((id, i) => {
      positions[id] = {
        x: START_X + lvl * COL_GAP,
        y: startY + i * ROW_GAP,
      };
    });
  }

  return positions;
}

// ── Formatting ──────────────────────────────────────────────────────

export function fmt(value: number, unit: string): string {
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'x') return `${value.toFixed(2)}x`;
  if (unit === 'mo') return `${value.toFixed(1)} мес`;
  if (unit === 'users') return Math.round(value).toLocaleString('ru-RU');
  if (unit === 'pts') return value.toFixed(0);
  if (unit === '₽' && Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(2)}M ₽`;
  if (unit === '₽' && Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K ₽`;
  return `${Math.round(value).toLocaleString('ru-RU')} ${unit}`;
}
