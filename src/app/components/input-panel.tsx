import { PanelLeftClose, PanelLeftOpen, RotateCcw, Sliders } from 'lucide-react';
import { fmt, type MetricDef, type MetricDomain } from './metric-engine';

interface InputPanelProps {
  metrics: Record<string, MetricDef>;
  overriddenIds: Set<string>;
  selectedId: string;
  onSelect: (id: string) => void;
  onChangeInput: (id: string, value: number) => void;
  onReset: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const domainOrder: MetricDomain[] = [
  'demand',
  'revenue',
  'variable_costs',
  'fixed_costs',
  'capex',
  'operations',
  'results',
];

const domainLabels: Record<MetricDomain, string> = {
  demand: 'Спрос',
  revenue: 'Выручка и тариф',
  variable_costs: 'Переменные расходы',
  fixed_costs: 'Постоянные расходы',
  capex: 'CAPEX',
  operations: 'Операционные ограничения',
  results: 'Результаты',
};

function controls(metric: MetricDef): { value: number; min: number; max: number; step: number; factor: number } {
  const value = metric.value ?? 0;
  const config = metric.inputConfig ?? {
    min: Math.min(0, value),
    max: Math.max(Math.abs(value) * 3, 1),
    step: Math.max(Math.abs(value) / 100, 0.01),
  };
  const factor = metric.unit.symbol === '%' ? 100 : 1;
  return {
    value: value * factor,
    min: config.min * factor,
    max: config.max * factor,
    step: config.step * factor,
    factor,
  };
}

export function InputPanel({
  metrics,
  overriddenIds,
  selectedId,
  onSelect,
  onChangeInput,
  onReset,
  collapsed,
  onToggle,
}: InputPanelProps) {
  const inputs = Object.values(metrics).filter((metric) => metric.kind !== 'derived' && metric.behavior !== 'event');
  const groups = domainOrder
    .map((domain) => ({
      domain,
      metrics: inputs.filter((metric) => metric.domain === domain),
    }))
    .filter((group) => group.metrics.length > 0);

  return (
    <>
      {collapsed && (
        <button
          data-canvas-interactive="true"
          onClick={onToggle}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute top-[0.75rem] left-[0.75rem] z-30 flex items-center justify-center size-[2rem] rounded-[var(--radius-md)] border border-border bg-card text-muted-foreground hover:text-foreground shadow-md transition-all cursor-pointer"
          title="Показать входные параметры"
        >
          <PanelLeftOpen className="size-[1rem]" />
        </button>
      )}

      <aside
        data-canvas-interactive="true"
        className={`absolute top-0 left-0 bottom-0 z-20 flex flex-col bg-card/95 backdrop-blur-sm border-r border-border transition-transform duration-300 ease-in-out ${
          collapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
        style={{ width: '19.5rem' }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-[1rem] py-[0.625rem]">
          <div className="flex items-center gap-[0.5rem]">
            <Sliders className="size-[0.875rem] text-muted-foreground" />
            <span className="text-[0.8125rem] text-foreground" style={{ fontWeight: 600 }}>Допущения</span>
            <span className="text-[0.625rem] text-muted-foreground">{inputs.length}</span>
          </div>
          <button
            onClick={onToggle}
            className="flex items-center justify-center size-[1.5rem] rounded-[var(--radius-sm)] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            title="Свернуть"
          >
            <PanelLeftClose className="size-[0.875rem]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-[0.75rem] space-y-[0.875rem]">
          {groups.map((group) => (
            <section key={group.domain}>
              <div className="mb-[0.375rem] px-[0.125rem] text-[0.625rem] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                {domainLabels[group.domain]}
              </div>
              <div className="space-y-[0.5rem]">
                {group.metrics.map((metric) => {
                  const control = controls(metric);
                  const isSelected = selectedId === metric.id;
                  const changed = overriddenIds.has(metric.id);
                  return (
                    <div
                      key={metric.id}
                      onClick={() => onSelect(metric.id)}
                      className={`cursor-pointer rounded-[var(--radius-lg)] border p-[0.625rem] transition-all ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-[0.5rem] mb-[0.25rem]">
                        <div className="min-w-0">
                          <div className="text-[0.75rem] text-foreground truncate" style={{ fontWeight: 500 }}>{metric.name}</div>
                          <div className="text-[0.5625rem] text-muted-foreground truncate">
                            {metric.knowledgeStatus} · {metric.provenance.version}
                          </div>
                        </div>
                        {changed && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              onReset(metric.id);
                            }}
                            className="flex items-center gap-[0.125rem] text-[0.5625rem] text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Вернуть значение сценария"
                          >
                            <RotateCcw className="size-[0.625rem]" />
                            reset
                          </button>
                        )}
                      </div>
                      <input
                        aria-label={metric.name}
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={control.value}
                        onChange={(event) => onChangeInput(metric.id, Number(event.target.value) / control.factor)}
                        className="w-full h-[0.25rem] accent-[var(--primary)] cursor-pointer"
                        onClick={(event) => event.stopPropagation()}
                      />
                      <div className="flex items-center justify-between gap-[0.5rem] mt-[0.25rem]">
                        <span className="text-[0.75rem] text-foreground" style={{ fontWeight: 600 }}>{fmt(metric.value, metric.unit)}</span>
                        <div className="flex items-center gap-[0.25rem]">
                          <input
                            type="number"
                            min={control.min}
                            max={control.max}
                            step={control.step}
                            value={Number(control.value.toFixed(4))}
                            onChange={(event) => onChangeInput(metric.id, Number(event.target.value) / control.factor)}
                            onClick={(event) => event.stopPropagation()}
                            className="w-[4.75rem] rounded-[var(--radius-sm)] border border-border bg-background px-[0.375rem] py-[0.125rem] text-right text-[0.6875rem] outline-none focus:border-primary"
                          />
                          <span className="text-[0.5625rem] text-muted-foreground">{metric.unit.symbol}</span>
                        </div>
                      </div>
                      {metric.validationMessages.map((message) => (
                        <div key={message} className="mt-[0.25rem] text-[0.5625rem] text-amber-700">{message}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
