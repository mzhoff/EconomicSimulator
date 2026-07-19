import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  GitBranch,
  Info,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  behaviorLabel,
  fmt,
  getCalculationRelations,
  type ImpactResult,
  type MetricDef,
  type ModelState,
  type Shock,
  type ThresholdResult,
} from './metric-engine';

interface InspectorPanelProps {
  metrics: Record<string, MetricDef>;
  baselineMetrics: Record<string, MetricDef>;
  model: ModelState;
  selectedId: string | null;
  scenarioId: string;
  thresholds: {
    breakEven: ThresholdResult;
    payback12: ThresholdResult;
    payback24: ThresholdResult;
  };
  impact: ImpactResult | null;
  shock: Shock;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onSetNorthStar: (id: string) => void;
  onChangeShock: (shock: Shock) => void;
}

const summaryMetrics = [
  { id: 'rental_revenue', label: 'Арендная выручка' },
  { id: 'cash_contribution', label: 'Денежный вклад' },
  { id: 'profit_before_tax', label: 'Прибыль до налогов' },
  { id: 'payback_months', label: 'Окупаемость' },
];

function scenarioDelta(current: number | null, baseline: number | null): string | null {
  if (current === null || baseline === null || Math.abs(baseline) < 1e-12) return null;
  const delta = ((current - baseline) / Math.abs(baseline)) * 100;
  if (Math.abs(delta) < 0.05) return null;
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% vs Base`;
}

function thresholdText(result: ThresholdResult): string {
  return result.reached && result.value !== null ? `${result.value.toFixed(2)} аренд/день` : 'Не достигнута';
}

function shockDisplayAmount(shock: Shock): number {
  return shock.kind === 'absolute' ? shock.amount : shock.amount * 100;
}

export function InspectorPanel({
  metrics,
  baselineMetrics,
  model,
  selectedId,
  scenarioId,
  thresholds,
  impact,
  shock,
  collapsed,
  onToggle,
  onSelect,
  onSetNorthStar,
  onChangeShock,
}: InspectorPanelProps) {
  const selected = selectedId ? metrics[selectedId] : undefined;
  const relations = getCalculationRelations(model);
  const parents = relations
    .filter((relation) => relation.to === selectedId)
    .map((relation) => metrics[relation.from])
    .filter(Boolean);
  const children = relations
    .filter((relation) => relation.from === selectedId)
    .map((relation) => metrics[relation.to])
    .filter(Boolean);
  const selectedIsInput = selected?.kind !== 'derived';
  const activeNorthStar = model.activeNorthStarId
    ? metrics[model.activeNorthStarId]
    : undefined;

  return (
    <>
      {collapsed && (
        <button
          data-canvas-interactive="true"
          onClick={onToggle}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute top-[0.75rem] right-[0.75rem] z-30 flex items-center justify-center size-[2rem] rounded-[var(--radius-md)] border border-border bg-card text-muted-foreground hover:text-foreground shadow-md transition-all cursor-pointer"
          title="Показать инспектор"
        >
          <PanelRightOpen className="size-[1rem]" />
        </button>
      )}

      <aside
        data-canvas-interactive="true"
        className={`absolute top-0 right-0 bottom-0 z-20 flex flex-col bg-card/95 backdrop-blur-sm border-l border-border transition-transform duration-300 ease-in-out ${
          collapsed ? 'translate-x-full' : 'translate-x-0'
        }`}
        style={{ width: '20rem' }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-[1rem] py-[0.625rem]">
          <div className="flex items-center gap-[0.5rem]">
            <Info className="size-[0.875rem] text-muted-foreground" />
            <span className="text-[0.8125rem] text-foreground" style={{ fontWeight: 600 }}>Инспектор</span>
          </div>
          <button
            onClick={onToggle}
            className="flex items-center justify-center size-[1.5rem] rounded-[var(--radius-sm)] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            title="Свернуть"
          >
            <PanelRightClose className="size-[0.875rem]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {selected && (
            <>
              <section className="border-b border-border p-[1rem]">
                <div className="flex items-start justify-between gap-[0.5rem]">
                  <div>
                    <div className="text-[0.9375rem] text-foreground" style={{ fontWeight: 650 }}>{selected.name}</div>
                    <div className="mt-[0.125rem] text-[1.25rem] text-foreground" style={{ fontWeight: 700 }}>{fmt(selected.value, selected.unit)}</div>
                  </div>
                  {model.activeNorthStarId === selected.id && <Sparkles className="size-[1rem] text-amber-500" />}
                </div>
                <p className="mt-[0.5rem] text-[0.6875rem] leading-relaxed text-muted-foreground">{selected.description}</p>

                {model.activeNorthStarId !== selected.id && (
                  <button
                    onClick={() => onSetNorthStar(selected.id)}
                    className="mt-[0.625rem] flex items-center gap-[0.25rem] rounded-[var(--radius-md)] border border-border px-[0.5rem] py-[0.3125rem] text-[0.625rem] text-muted-foreground hover:text-foreground hover:border-primary/50 cursor-pointer"
                  >
                    <Target className="size-[0.6875rem]" />
                    Сделать North Star
                  </button>
                )}

                <div className="mt-[0.75rem] space-y-[0.25rem]">
                  <Row label="Behavior" value={behaviorLabel(selected.behavior)} />
                  <Row label="Unit" value={selected.unit.symbol} />
                  <Row label="Grain" value={`${selected.grain.entity} × ${selected.grain.time}`} />
                  <Row label="Статус знания" value={selected.knowledgeStatus} />
                  <Row label="Сценарий" value={model.scenarios[scenarioId]?.label ?? scenarioId} />
                </div>

                <div className="mt-[0.625rem] rounded-[var(--radius-md)] bg-secondary p-[0.5rem]">
                  <div className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground">Источник</div>
                  <div className="mt-[0.125rem] text-[0.625rem] text-foreground">{selected.provenance.source}</div>
                  <div className="text-[0.5625rem] text-muted-foreground">
                    {selected.provenance.version} · confidence {selected.provenance.confidence}
                  </div>
                  {selected.provenance.comment && (
                    <div className="mt-[0.25rem] text-[0.5625rem] leading-relaxed text-muted-foreground">{selected.provenance.comment}</div>
                  )}
                </div>

                {selected.validationMessages.map((message) => (
                  <div key={message} className="mt-[0.5rem] flex gap-[0.25rem] rounded-[var(--radius-md)] bg-amber-50 p-[0.5rem] text-[0.625rem] text-amber-800">
                    <AlertTriangle className="mt-[0.0625rem] size-[0.6875rem] shrink-0" />
                    {message}
                  </div>
                ))}
              </section>

              {(parents.length > 0 || children.length > 0) && (
                <section className="border-b border-border p-[1rem]">
                  <div className="flex items-center gap-[0.25rem] mb-[0.5rem]">
                    <GitBranch className="size-[0.75rem] text-muted-foreground" />
                    <span className="text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>Расчётный DAG</span>
                  </div>
                  {parents.length > 0 && (
                    <DependencyGroup label="Зависит от" metrics={parents} onSelect={onSelect} />
                  )}
                  {children.length > 0 && (
                    <DependencyGroup label="Влияет на" metrics={children} onSelect={onSelect} arrows />
                  )}
                </section>
              )}

              {selectedIsInput && (
                <section className="border-b border-border p-[1rem]">
                  <div className="flex items-center gap-[0.25rem] mb-[0.5rem]">
                    <BarChart3 className="size-[0.75rem] text-muted-foreground" />
                    <span className="text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>What-if shock</span>
                  </div>
                  <div className="grid grid-cols-[1fr_5rem] gap-[0.375rem]">
                    <select
                      value={shock.kind}
                      onChange={(event) => {
                        const kind = event.target.value as Shock['kind'];
                        onChangeShock(
                          kind === 'relative'
                            ? { kind, amount: 0.1 }
                            : kind === 'percentage_points'
                              ? { kind, amount: 0.02 }
                              : { kind, amount: Math.max(Math.abs(selected.value ?? 0) * 0.1, 1) },
                        );
                      }}
                      className="rounded-[var(--radius-md)] border border-border bg-background px-[0.5rem] py-[0.375rem] text-[0.6875rem] outline-none focus:border-primary"
                    >
                      <option value="relative">Относительный, %</option>
                      <option value="absolute">Абсолютный, +N</option>
                      <option value="percentage_points" disabled={selected.unit.symbol !== '%'}>Процентные пункты</option>
                    </select>
                    <input
                      type="number"
                      value={Number(shockDisplayAmount(shock).toFixed(4))}
                      onChange={(event) => {
                        const raw = Number(event.target.value);
                        onChangeShock(
                          shock.kind === 'absolute'
                            ? { kind: shock.kind, amount: raw }
                            : { kind: shock.kind, amount: raw / 100 },
                        );
                      }}
                      className="rounded-[var(--radius-md)] border border-border bg-background px-[0.5rem] py-[0.375rem] text-right text-[0.6875rem] outline-none focus:border-primary"
                    />
                  </div>

                  {impact && activeNorthStar && (
                    <div className="mt-[0.5rem] rounded-[var(--radius-lg)] bg-primary/5 p-[0.625rem]">
                      <div className="text-[0.5625rem] text-muted-foreground">Влияние на North Star</div>
                      <div className="mt-[0.125rem] text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>{activeNorthStar.name}</div>
                      <div className="mt-[0.25rem] flex items-center justify-between gap-[0.25rem] text-[0.6875rem]">
                        <span>{fmt(impact.beforeNorthStar, activeNorthStar.unit)}</span>
                        <ChevronRight className="size-[0.6875rem] text-muted-foreground" />
                        <span>{fmt(impact.afterNorthStar, activeNorthStar.unit)}</span>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          <section className="border-b border-border p-[1rem]">
            <div className="flex items-center gap-[0.25rem] mb-[0.5rem]">
              <Target className="size-[0.75rem] text-muted-foreground" />
              <span className="text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>Критические значения</span>
            </div>
            <div className="space-y-[0.375rem]">
              <ThresholdRow label="Безубыточность" value={thresholdText(thresholds.breakEven)} />
              <ThresholdRow label="Payback ≤ 12 мес." value={thresholdText(thresholds.payback12)} />
              <ThresholdRow label="Payback ≤ 24 мес." value={thresholdText(thresholds.payback24)} />
            </div>
          </section>

          <section className="p-[1rem]">
            <div className="flex items-center gap-[0.25rem] mb-[0.5rem]">
              <BarChart3 className="size-[0.75rem] text-muted-foreground" />
              <span className="text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>Экономика станции</span>
            </div>
            <div className="space-y-[0.375rem]">
              {summaryMetrics.map(({ id, label }) => {
                const metric = metrics[id];
                if (!metric) return null;
                const delta = scenarioDelta(metric.value, baselineMetrics[id]?.value ?? null);
                return (
                  <button
                    key={id}
                    onClick={() => onSelect(id)}
                    className="w-full flex items-center justify-between rounded-[var(--radius-md)] border border-border p-[0.5rem] text-left hover:border-primary/40 cursor-pointer"
                  >
                    <div>
                      <div className="text-[0.625rem] text-muted-foreground">{label}</div>
                      <div className="text-[0.875rem] text-foreground" style={{ fontWeight: 600 }}>{fmt(metric.value, metric.unit)}</div>
                    </div>
                    {delta && <span className="text-[0.5625rem] text-violet-600">{delta}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-[0.5rem] text-[0.625rem]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right capitalize" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function DependencyGroup({
  label,
  metrics,
  onSelect,
  arrows,
}: {
  label: string;
  metrics: MetricDef[];
  onSelect: (id: string) => void;
  arrows?: boolean;
}) {
  return (
    <div className="mb-[0.375rem] last:mb-0">
      <span className="text-[0.625rem] text-muted-foreground">{label}</span>
      <div className="mt-[0.125rem] flex flex-wrap gap-[0.25rem]">
        {metrics.map((metric) => (
          <button
            key={metric.id}
            onClick={() => onSelect(metric.id)}
            className="inline-flex items-center gap-[0.0625rem] bg-secondary text-secondary-foreground rounded-full px-[0.375rem] py-[0.0625rem] text-[0.625rem] hover:bg-accent cursor-pointer"
          >
            {arrows && <ChevronRight className="size-[0.5rem]" />}
            {metric.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThresholdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-[0.5rem]">
      <div className="text-[0.5625rem] text-muted-foreground">{label}</div>
      <div className="text-[0.75rem] text-foreground" style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
