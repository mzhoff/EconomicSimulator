import React, { useMemo, useState } from 'react';

const baseMetrics = {
  price: { id: 'price', name: 'Price', kind: 'input', unit: '₽', value: 1200, x: 40, y: 260, description: 'Средний чек / цена подписки за период' },
  cogs: { id: 'cogs', name: 'Variable Cost', kind: 'input', unit: '₽', value: 420, x: 40, y: 360, description: 'Переменные затраты на единицу' },
  churn: { id: 'churn', name: 'Churn Rate', kind: 'input', unit: '%', value: 8, x: 40, y: 460, description: 'Отток клиентов за месяц' },
  cac: { id: 'cac', name: 'CAC', kind: 'input', unit: '₽', value: 2500, x: 340, y: 460, description: 'Стоимость привлечения клиента' },
  conversion: { id: 'conversion', name: 'Conversion', kind: 'input', unit: '%', value: 12, x: 340, y: 260, description: 'Конверсия в оплату' },
  traffic: { id: 'traffic', name: 'Qualified Traffic', kind: 'input', unit: 'users', value: 12000, x: 340, y: 360, description: 'Квалифицированный трафик' },
  arpu: { id: 'arpu', name: 'ARPU', kind: 'derived', unit: '₽', x: 660, y: 250, description: 'Средняя выручка на клиента в месяц', formula: (m) => m.price.value },
  grossMargin: { id: 'grossMargin', name: 'Gross Margin', kind: 'derived', unit: '%', x: 660, y: 360, description: 'Валовая маржа', formula: (m) => ((m.price.value - m.cogs.value) / Math.max(m.price.value, 1)) * 100 },
  ltv: { id: 'ltv', name: 'LTV', kind: 'derived', unit: '₽', x: 980, y: 250, description: 'Упрощенный LTV = ARPU × Gross Margin × Lifetime', formula: (m) => {
      const arpu = m.arpu.value;
      const gm = m.grossMargin.value / 100;
      const lifetime = 1 / Math.max(m.churn.value / 100, 0.001);
      return arpu * gm * lifetime;
    } },
  newCustomers: { id: 'newCustomers', name: 'New Customers', kind: 'derived', unit: 'users', x: 660, y: 470, description: 'Новые клиенты = трафик × конверсия', formula: (m) => m.traffic.value * (m.conversion.value / 100) },
  payback: { id: 'payback', name: 'CAC Payback', kind: 'derived', unit: 'mo', x: 980, y: 360, description: 'Срок окупаемости CAC', formula: (m) => {
      const contrib = m.price.value - m.cogs.value;
      return m.cac.value / Math.max(contrib, 1);
    } },
  ltvCac: { id: 'ltvCac', name: 'LTV / CAC', kind: 'derived', unit: 'x', x: 1320, y: 250, description: 'Ключевой коэффициент юнит-экономики', formula: (m) => m.ltv.value / Math.max(m.cac.value, 1) },
  monthlyContribution: { id: 'monthlyContribution', name: 'Monthly Contribution', kind: 'derived', unit: '₽', x: 1320, y: 360, description: 'Месячный contribution от новых клиентов', formula: (m) => (m.price.value - m.cogs.value) * m.newCustomers.value - m.cac.value * m.newCustomers.value / Math.max(m.newCustomers.value, 1) },
  health: { id: 'health', name: 'Health Score', kind: 'derived', unit: 'pts', x: 1640, y: 305, description: 'Сводный score модели', formula: (m) => {
      const ratioScore = Math.min((m.ltvCac.value / 3) * 40, 40);
      const paybackScore = Math.max(0, 30 - m.payback.value * 2);
      const marginScore = Math.min((m.grossMargin.value / 70) * 30, 30);
      return ratioScore + paybackScore + marginScore;
    } },
};

const edges = [
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
  { from: 'ltvCac', to: 'health', type: 'influence', sign: 1, weight: 0.5 },
  { from: 'payback', to: 'health', type: 'influence', sign: -1, weight: 0.25 },
  { from: 'grossMargin', to: 'health', type: 'influence', sign: 1, weight: 0.25 },
];

const scenarios = {
  base: { label: 'Base' },
  growth: { label: 'Growth', overrides: { price: 1250, conversion: 14, traffic: 15000, cac: 2700 } },
  efficiency: { label: 'Efficiency', overrides: { cogs: 350, churn: 6.5, cac: 2200 } },
};

function cloneMetrics(scenarioKey, inputOverrides) {
  const scenarioOverrides = scenarios[scenarioKey]?.overrides || {};
  const metrics = Object.fromEntries(
    Object.entries(baseMetrics).map(([id, metric]) => [id, { ...metric, value: metric.value ?? 0 }])
  );
  for (const [id, value] of Object.entries(scenarioOverrides)) metrics[id].value = value;
  for (const [id, value] of Object.entries(inputOverrides)) metrics[id].value = value;

  const order = ['arpu', 'grossMargin', 'ltv', 'newCustomers', 'payback', 'ltvCac', 'monthlyContribution', 'health'];
  order.forEach((id) => {
    metrics[id].value = metrics[id].formula(metrics);
  });
  return metrics;
}

function fmt(value, unit) {
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'x') return `${value.toFixed(2)}x`;
  if (unit === 'mo') return `${value.toFixed(1)}m`;
  if (unit === 'users') return Math.round(value).toLocaleString('ru-RU');
  if (unit === 'pts') return value.toFixed(0);
  return `${Math.round(value).toLocaleString('ru-RU')} ${unit}`;
}

function MetricCard({ metric, selected, onSelect, delta }) {
  const isInput = metric.kind === 'input';
  const deltaText = delta === undefined ? '' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
  return (
    <div
      onClick={() => onSelect(metric.id)}
      className={`absolute w-64 cursor-pointer rounded-3xl border p-4 shadow-sm transition ${selected ? 'border-orange-500 bg-orange-50 shadow-lg' : 'border-slate-200 bg-white hover:border-slate-300'}`}
      style={{ left: metric.x, top: metric.y }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{metric.name}</div>
          <div className="mt-1 text-[11px] text-slate-500">{isInput ? 'Входная метрика' : 'Расчетная метрика'}</div>
        </div>
        {delta !== undefined && (
          <div className={`rounded-full px-2 py-1 text-[11px] font-medium ${delta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {deltaText}
          </div>
        )}
      </div>
      <div className="text-3xl font-bold tracking-tight text-slate-950">{fmt(metric.value, metric.unit)}</div>
      <div className="mt-2 line-clamp-2 text-xs text-slate-500">{metric.description}</div>
    </div>
  );
}

function Edge({ from, to, highlight }) {
  const x1 = from.x + 256;
  const y1 = from.y + 56;
  const x2 = to.x;
  const y2 = to.y + 56;
  const midX = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  return <path d={d} fill="none" stroke={highlight ? '#f97316' : '#cbd5e1'} strokeWidth={highlight ? 3 : 2} strokeDasharray={highlight ? '0' : '0'} opacity={0.95} />;
}

export default function MetricPyramidPrototype() {
  const [scenarioKey, setScenarioKey] = useState('base');
  const [inputOverrides, setInputOverrides] = useState({});
  const [selectedId, setSelectedId] = useState('ltvCac');
  const [draftMode, setDraftMode] = useState(false);
  const current = useMemo(() => cloneMetrics(scenarioKey, inputOverrides), [scenarioKey, inputOverrides]);
  const baseline = useMemo(() => cloneMetrics('base', {}), []);

  const impactMap = useMemo(() => {
    const selected = current[selectedId];
    if (!selected || selected.kind !== 'input') return {};
    const changed = { ...inputOverrides, [selectedId]: (inputOverrides[selectedId] ?? current[selectedId].value) * 1.1 };
    const shifted = cloneMetrics(scenarioKey, changed);
    const impacts = {};
    Object.keys(current).forEach((id) => {
      const before = current[id].value;
      const after = shifted[id].value;
      impacts[id] = ((after - before) / Math.max(Math.abs(before), 1e-6)) * 100;
    });
    return impacts;
  }, [selectedId, current, inputOverrides, scenarioKey]);

  const downstream = useMemo(() => new Set(edges.filter((e) => e.from === selectedId || e.to === selectedId).map((e) => `${e.from}-${e.to}`)), [selectedId]);

  const selected = current[selectedId];
  const inputs = Object.values(current).filter((m) => m.kind === 'input');
  const summary = [
    { label: 'LTV/CAC', value: fmt(current.ltvCac.value, current.ltvCac.unit), state: current.ltvCac.value >= 3 ? 'Здорово' : 'Риск' },
    { label: 'Payback', value: fmt(current.payback.value, current.payback.unit), state: current.payback.value <= 12 ? 'Норма' : 'Длинный' },
    { label: 'Gross Margin', value: fmt(current.grossMargin.value, current.grossMargin.unit), state: current.grossMargin.value >= 50 ? 'Норма' : 'Низкая' },
    { label: 'Health', value: fmt(current.health.value, current.health.unit), state: current.health.value >= 70 ? 'Сильная' : 'Нужно усиление' },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">Metric Graph OS — прототип</div>
            <div className="text-sm text-slate-500">Canvas для моделирования пирамиды метрик, unit-экономики и влияния</div>
          </div>
          <div className="flex items-center gap-2">
            {Object.entries(scenarios).map(([key, scenario]) => (
              <button key={key} onClick={() => setScenarioKey(key)} className={`rounded-2xl px-4 py-2 text-sm ${scenarioKey === key ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {scenario.label}
              </button>
            ))}
            <button onClick={() => { setScenarioKey('base'); setInputOverrides({}); }} className="rounded-2xl bg-white px-4 py-2 text-sm text-slate-700 ring-1 ring-slate-300">Reset</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[320px_1fr_340px] gap-0">
        <aside className="border-r border-slate-200 bg-white p-5">
          <div className="mb-5 text-sm font-semibold">Входные метрики</div>
          <div className="space-y-4">
            {inputs.map((metric) => {
              const value = inputOverrides[metric.id] ?? metric.value;
              return (
                <div key={metric.id} className="rounded-2xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <button className={`text-left font-medium ${selectedId === metric.id ? 'text-orange-600' : 'text-slate-900'}`} onClick={() => setSelectedId(metric.id)}>{metric.name}</button>
                    <div className="text-xs text-slate-500">{metric.unit}</div>
                  </div>
                  <input
                    type="range"
                    min={metric.unit === '%' ? 1 : 0}
                    max={metric.id === 'traffic' ? 30000 : metric.unit === '%' ? 40 : 6000}
                    step={metric.unit === '%' ? 0.5 : 10}
                    value={value}
                    onChange={(e) => setInputOverrides((prev) => ({ ...prev, [metric.id]: Number(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <div className="font-semibold">{fmt(value, metric.unit)}</div>
                    <button onClick={() => setInputOverrides((prev) => ({ ...prev, [metric.id]: baseMetrics[metric.id].value }))} className="text-xs text-slate-500">к базе</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-3xl bg-slate-50 p-4">
            <div className="mb-2 text-sm font-semibold">Что умеет этот прототип</div>
            <div className="space-y-2 text-sm text-slate-600">
              <div>1. Считает зависимые метрики от входных параметров.</div>
              <div>2. Показывает влияние +10% на выбранную входную метрику.</div>
              <div>3. Поддерживает сценарии Base / Growth / Efficiency.</div>
              <div>4. Демонстрирует идею typed metric graph поверх canvas.</div>
            </div>
          </div>
        </aside>

        <main className="relative overflow-auto bg-[radial-gradient(circle,_#cbd5e1_1px,_transparent_1px)] bg-[length:24px_24px]" style={{ minHeight: 'calc(100vh - 81px)' }}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/85 px-6 py-3 backdrop-blur">
            <div className="text-sm text-slate-500">Режим: Canvas / Metric Pyramid</div>
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => setDraftMode((v) => !v)} className={`rounded-2xl px-3 py-1.5 ${draftMode ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'}`}>Impact preview</button>
            </div>
          </div>

          <div className="relative" style={{ width: 1960, height: 760 }}>
            <svg className="absolute inset-0 h-full w-full">
              {edges.map((edge) => (
                <Edge key={`${edge.from}-${edge.to}`} from={current[edge.from]} to={current[edge.to]} highlight={downstream.has(`${edge.from}-${edge.to}`)} />
              ))}
            </svg>
            {Object.values(current).map((metric) => (
              <MetricCard
                key={metric.id}
                metric={metric}
                selected={metric.id === selectedId}
                onSelect={setSelectedId}
                delta={draftMode && impactMap[metric.id] !== undefined && metric.id !== selectedId ? impactMap[metric.id] : undefined}
              />
            ))}
          </div>
        </main>

        <aside className="border-l border-slate-200 bg-white p-5">
          <div className="mb-4 text-sm font-semibold">Инспектор</div>
          <div className="rounded-3xl border border-slate-200 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Selected metric</div>
            <div className="mt-2 text-2xl font-semibold">{selected.name}</div>
            <div className="mt-1 text-sm text-slate-500">{selected.description}</div>
            <div className="mt-4 text-3xl font-bold">{fmt(selected.value, selected.unit)}</div>
            <div className="mt-4 text-sm text-slate-600">
              <div><span className="font-medium text-slate-900">Тип:</span> {selected.kind === 'input' ? 'Входная' : 'Расчетная'}</div>
              <div><span className="font-medium text-slate-900">Сценарий:</span> {scenarios[scenarioKey].label}</div>
              {selected.kind === 'input' && <div><span className="font-medium text-slate-900">Impact preview:</span> изменение на +10% пересчитает все downstream-метрики</div>}
            </div>
            {selected.kind === 'derived' && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                Эта метрика считается ядром автоматически. На следующем этапе сюда можно добавить Formula / SQL / Benchmark / Target / Owner.
              </div>
            )}
          </div>

          <div className="mt-5 text-sm font-semibold">Сводка модели</div>
          <div className="mt-3 space-y-3">
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-500">{item.label}</div>
                  <div className="text-xs text-slate-500">{item.state}</div>
                </div>
                <div className="mt-1 text-xl font-semibold">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-3xl bg-orange-50 p-4">
            <div className="text-sm font-semibold text-orange-900">Подсказка для следующего шага</div>
            <div className="mt-2 text-sm text-orange-800">
              Чтобы превратить это в полноценный продукт, добавь typed AST, data bindings к модели данных, сценарии с overrides и генерацию SQL artifacts / semantic layer конфигов.
            </div>
          </div>

          <div className="mt-5 rounded-3xl bg-slate-50 p-4">
            <div className="text-sm font-semibold">Сравнение с базой</div>
            <div className="mt-2 space-y-2 text-sm text-slate-600">
              <div>LTV/CAC: {((current.ltvCac.value - baseline.ltvCac.value) / baseline.ltvCac.value * 100).toFixed(1)}%</div>
              <div>Payback: {((current.payback.value - baseline.payback.value) / baseline.payback.value * 100).toFixed(1)}%</div>
              <div>Gross Margin: {((current.grossMargin.value - baseline.grossMargin.value) / baseline.grossMargin.value * 100).toFixed(1)}%</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
