import { memo, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { fmt, type MetricDef } from './metric-engine';

export interface DomainSummary {
  id: string;
  name: string;
  color: string;
  order: number;
}

type DomainMetric = MetricDef & {
  domainIds?: string[];
};

interface InputPanelProps {
  metrics: Record<string, DomainMetric>;
  domains?: DomainSummary[];
  overriddenIds: Set<string>;
  selectedId: string;
  onSelect: (id: string) => void;
  onBeginInputChange: (id: string) => void;
  onChangeInput: (id: string, value: number) => void;
  onEndInputChange: (id: string) => void;
  onReset: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  collapsedDomainIds?: Set<string>;
  onToggleDomain?: (domainId: string) => void;
  onManageDomain?: (domainId: string) => void;
}

interface DomainSection {
  domain: DomainSummary;
  metrics: DomainMetric[];
}

export const UNASSIGNED_DOMAIN_ID = '__unassigned__';

const LEGACY_DOMAINS: DomainSummary[] = [
  { id: 'demand', name: 'Спрос', color: '#64748b', order: 0 },
  { id: 'revenue', name: 'Выручка и тариф', color: '#10b981', order: 1 },
  { id: 'variable_costs', name: 'Переменные расходы', color: '#f97316', order: 2 },
  { id: 'fixed_costs', name: 'Постоянные расходы', color: '#ef4444', order: 3 },
  { id: 'capex', name: 'CAPEX', color: '#8b5cf6', order: 4 },
  { id: 'operations', name: 'Операционные ограничения', color: '#0ea5e9', order: 5 },
  { id: 'results', name: 'Результаты', color: '#14b8a6', order: 6 },
];

const EMPTY_COLLAPSED_DOMAIN_IDS = new Set<string>();

function metricDomainIds(metric: DomainMetric): readonly string[] {
  if (metric.domainIds !== undefined) return metric.domainIds;
  return metric.domain ? [metric.domain] : [];
}

function controls(metric: DomainMetric): { value: number; min: number; max: number; step: number; factor: number } {
  const value = metric.value ?? 0;
  const fallbackMin = Math.min(0, value);
  const fallbackMax = Math.max(Math.abs(value) * 3, 1);
  const min = Math.min(metric.inputConfig?.min ?? fallbackMin, value);
  const max = Math.max(metric.inputConfig?.max ?? fallbackMax, value);
  const step = metric.inputConfig?.step
    ?? Math.max(Math.abs(max - min) / 100, Math.abs(value) / 100, 0.01);
  const factor = metric.unit.symbol === '%' ? 100 : 1;
  return {
    value: value * factor,
    min: min * factor,
    max: max * factor,
    step: step * factor,
    factor,
  };
}

interface DomainHeaderProps {
  domain: DomainSummary;
  count: number;
  collapsed: boolean;
  onToggle?: (domainId: string) => void;
  onManage?: (domainId: string) => void;
}

const DomainHeader = memo(function DomainHeader({
  domain,
  count,
  collapsed,
  onToggle,
  onManage,
}: DomainHeaderProps) {
  return (
    <div className="mb-[0.375rem] flex items-center gap-[0.25rem]">
      <button
        type="button"
        onClick={() => onToggle?.(domain.id)}
        className="group flex min-w-0 flex-1 items-center gap-[0.375rem] rounded-[var(--radius-sm)] px-[0.125rem] py-[0.1875rem] text-left hover:bg-accent/60 transition-colors cursor-pointer"
        aria-expanded={!collapsed}
        aria-controls={`domain-section-${domain.id}`}
        title={collapsed ? `Развернуть «${domain.name}»` : `Свернуть «${domain.name}»`}
      >
        {collapsed
          ? <ChevronRight className="size-[0.75rem] shrink-0 text-muted-foreground" />
          : <ChevronDown className="size-[0.75rem] shrink-0 text-muted-foreground" />}
        <span
          className="size-[0.4375rem] shrink-0 rounded-full"
          style={{ backgroundColor: domain.color }}
          aria-hidden="true"
        />
        <span
          className="min-w-0 truncate text-[0.625rem] uppercase tracking-wide text-muted-foreground group-hover:text-foreground"
          style={{ fontWeight: 600 }}
        >
          {domain.name}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-muted px-[0.375rem] py-[0.0625rem] text-[0.5625rem] tabular-nums text-muted-foreground">
          {count}
        </span>
      </button>
      {onManage ? (
        <button
          type="button"
          onClick={() => onManage(domain.id)}
          className="flex size-[1.375rem] shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          aria-label={`Настроить домен «${domain.name}»`}
          title="Настроить домен"
        >
          <MoreHorizontal className="size-[0.75rem]" />
        </button>
      ) : null}
    </div>
  );
});

interface MetricInputCardProps {
  metric: DomainMetric;
  selected: boolean;
  changed: boolean;
  onSelect: (id: string) => void;
  onBeginInputChange: (id: string) => void;
  onChangeInput: (id: string, value: number) => void;
  onEndInputChange: (id: string) => void;
  onReset: (id: string) => void;
}

const MetricInputCard = memo(function MetricInputCard({
  metric,
  selected,
  changed,
  onSelect,
  onBeginInputChange,
  onChangeInput,
  onEndInputChange,
  onReset,
}: MetricInputCardProps) {
  const control = controls(metric);
  const provenance = metric.provenance
    ? [metric.knowledgeStatus, metric.provenance.version].filter(Boolean).join(' · ')
    : metric.knowledgeStatus;

  return (
    <div
      onClick={() => onSelect(metric.id)}
      className={`cursor-pointer rounded-[var(--radius-lg)] border p-[0.625rem] transition-all ${
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
      }`}
      data-metric-input-id={metric.id}
    >
      <div className="mb-[0.25rem] flex items-start justify-between gap-[0.5rem]">
        <div className="min-w-0">
          <div className="truncate text-[0.75rem] text-foreground" style={{ fontWeight: 500 }}>
            {metric.name}
          </div>
          {provenance ? (
            <div className="truncate text-[0.5625rem] text-muted-foreground">
              {provenance}
            </div>
          ) : null}
        </div>
        {changed ? (
          <button
            type="button"
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
        ) : null}
      </div>
      <input
        aria-label={metric.name}
        type="range"
        data-model-history-input="true"
        min={control.min}
        max={control.max}
        step={control.step}
        value={control.value}
        onFocus={() => onBeginInputChange(metric.id)}
        onPointerDown={() => onBeginInputChange(metric.id)}
        onKeyDown={() => onBeginInputChange(metric.id)}
        onChange={(event) => onChangeInput(metric.id, Number(event.target.value) / control.factor)}
        onPointerUp={() => onEndInputChange(metric.id)}
        onPointerCancel={() => onEndInputChange(metric.id)}
        onKeyUp={() => onEndInputChange(metric.id)}
        onBlur={() => onEndInputChange(metric.id)}
        className="h-[0.25rem] w-full cursor-pointer accent-[var(--primary)]"
        onClick={(event) => event.stopPropagation()}
      />
      <div className="mt-[0.25rem] flex items-center justify-between gap-[0.5rem]">
        <span className="text-[0.75rem] text-foreground" style={{ fontWeight: 600 }}>
          {fmt(metric.value, metric.unit)}
        </span>
        <div className="flex items-center gap-[0.25rem]">
          <input
            type="number"
            step="any"
            value={Number(control.value.toFixed(4))}
            onFocus={() => onBeginInputChange(metric.id)}
            onPointerDown={() => onBeginInputChange(metric.id)}
            onKeyDown={() => onBeginInputChange(metric.id)}
            onChange={(event) => onChangeInput(metric.id, Number(event.target.value) / control.factor)}
            onBlur={() => onEndInputChange(metric.id)}
            onClick={(event) => event.stopPropagation()}
            className="w-[4.75rem] rounded-[var(--radius-sm)] border border-border bg-background px-[0.375rem] py-[0.125rem] text-right text-[0.6875rem] outline-none focus:border-primary"
          />
          <span className="text-[0.5625rem] text-muted-foreground">{metric.unit.symbol}</span>
        </div>
      </div>
      {metric.validationMessages.map((message) => (
        <div key={message} className="mt-[0.25rem] text-[0.5625rem] text-amber-700">
          {message}
        </div>
      ))}
    </div>
  );
});

function buildSections(
  inputs: DomainMetric[],
  domains: DomainSummary[],
): { sections: DomainSection[]; unassigned: DomainMetric[] } {
  const domainById = new Map(domains.map((domain) => [domain.id, domain]));
  const metricsByDomain = new Map<string, DomainMetric[]>();
  const unassigned: DomainMetric[] = [];

  for (const metric of inputs) {
    const knownMemberships = new Set(metricDomainIds(metric).filter((id) => domainById.has(id)));
    if (knownMemberships.size === 0) unassigned.push(metric);
    for (const domainId of knownMemberships) {
      const domainMetrics = metricsByDomain.get(domainId);
      if (domainMetrics) domainMetrics.push(metric);
      else metricsByDomain.set(domainId, [metric]);
    }
  }

  const orderedDomains = [...domains].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  const sections = orderedDomains.flatMap((domain) => {
    const domainMetrics = metricsByDomain.get(domain.id);
    return domainMetrics?.length ? [{ domain, metrics: domainMetrics }] : [];
  });

  return { sections, unassigned };
}

export function InputPanel({
  metrics,
  domains = LEGACY_DOMAINS,
  overriddenIds,
  selectedId,
  onSelect,
  onBeginInputChange,
  onChangeInput,
  onEndInputChange,
  onReset,
  collapsed,
  onToggle,
  collapsedDomainIds = EMPTY_COLLAPSED_DOMAIN_IDS,
  onToggleDomain,
  onManageDomain,
}: InputPanelProps) {
  const inputs = useMemo(
    () => Object.values(metrics).filter((metric) => (
      !metric.formula && metric.valueSource === 'input'
    )),
    [metrics],
  );
  const { sections, unassigned } = useMemo(
    () => buildSections(inputs, domains),
    [domains, inputs],
  );

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          data-canvas-interactive="true"
          onClick={onToggle}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute top-[0.75rem] left-[0.75rem] z-30 flex size-[2rem] cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-border bg-card text-muted-foreground shadow-md transition-all hover:text-foreground"
          title="Показать входные параметры"
        >
          <PanelLeftOpen className="size-[1rem]" />
        </button>
      ) : null}

      <aside
        data-canvas-interactive="true"
        className={`absolute top-0 left-0 bottom-0 z-20 flex flex-col border-r border-border bg-card/95 backdrop-blur-sm transition-transform duration-300 ease-in-out ${
          collapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
        style={{ width: '19.5rem' }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-[1rem] py-[0.625rem]">
          <div className="flex items-center gap-[0.5rem]">
            <Sliders className="size-[0.875rem] text-muted-foreground" />
            <span className="text-[0.8125rem] text-foreground" style={{ fontWeight: 600 }}>
              Допущения
            </span>
            <span className="text-[0.625rem] text-muted-foreground">{inputs.length}</span>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="flex size-[1.5rem] cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Свернуть"
          >
            <PanelLeftClose className="size-[0.875rem]" />
          </button>
        </div>

        <div className="flex-1 space-y-[0.875rem] overflow-y-auto p-[0.75rem]">
          {sections.map(({ domain, metrics: domainMetrics }) => {
            const sectionCollapsed = collapsedDomainIds.has(domain.id);
            return (
              <section key={domain.id}>
                <DomainHeader
                  domain={domain}
                  count={domainMetrics.length}
                  collapsed={sectionCollapsed}
                  onToggle={onToggleDomain}
                  onManage={onManageDomain}
                />
                {sectionCollapsed ? null : (
                  <div id={`domain-section-${domain.id}`} className="space-y-[0.5rem]">
                    {domainMetrics.map((metric) => (
                      <MetricInputCard
                        key={`${domain.id}:${metric.id}`}
                        metric={metric}
                        selected={selectedId === metric.id}
                        changed={overriddenIds.has(metric.id)}
                        onSelect={onSelect}
                        onBeginInputChange={onBeginInputChange}
                        onChangeInput={onChangeInput}
                        onEndInputChange={onEndInputChange}
                        onReset={onReset}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {unassigned.length > 0 ? (
            <section>
              <DomainHeader
                domain={{
                  id: UNASSIGNED_DOMAIN_ID,
                  name: 'Без домена',
                  color: '#94a3b8',
                  order: Number.MAX_SAFE_INTEGER,
                }}
                count={unassigned.length}
                collapsed={collapsedDomainIds.has(UNASSIGNED_DOMAIN_ID)}
                onToggle={onToggleDomain}
              />
              {collapsedDomainIds.has(UNASSIGNED_DOMAIN_ID) ? null : (
                <div id={`domain-section-${UNASSIGNED_DOMAIN_ID}`} className="space-y-[0.5rem]">
                  {unassigned.map((metric) => (
                    <MetricInputCard
                      key={`${UNASSIGNED_DOMAIN_ID}:${metric.id}`}
                      metric={metric}
                      selected={selectedId === metric.id}
                      changed={overriddenIds.has(metric.id)}
                      onSelect={onSelect}
                      onBeginInputChange={onBeginInputChange}
                      onChangeInput={onChangeInput}
                      onEndInputChange={onEndInputChange}
                      onReset={onReset}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </aside>
    </>
  );
}
