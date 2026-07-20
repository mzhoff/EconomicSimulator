import { useCallback, useRef } from 'react';
import {
  Activity,
  Database,
  Sparkles,
  Ticket,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { MetricDef } from '../../core/model';
import { behaviorLabel, fmt } from '../../core/presentation';
import {
  getMetricCardSize,
  METRIC_PORT_SIDES,
  type MetricPortSide,
} from './metric-geometry';

const statusColors: Record<string, string> = {
  valid: 'border-border',
  warning: 'border-amber-400',
  error: 'border-red-400',
  incomplete: 'border-dashed border-muted-foreground/40',
};

const portClasses: Record<MetricPortSide, string> = {
  left: 'left-[-0.4375rem] top-1/2 -translate-y-1/2',
  right: 'right-[-0.4375rem] top-1/2 -translate-y-1/2',
  top: 'left-1/2 top-[-0.4375rem] -translate-x-1/2',
  bottom: 'bottom-[-0.4375rem] left-1/2 -translate-x-1/2',
};

const portLabels: Record<MetricPortSide, string> = {
  left: 'слева',
  right: 'справа',
  top: 'сверху',
  bottom: 'снизу',
};

interface MetricCardProps {
  metric: MetricDef;
  selected: boolean;
  relationHovered?: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onDelete?: (id: string) => void;
  onStartDrag?: (id: string, event: React.PointerEvent) => void;
  onContextMenu?: (id: string, event: React.MouseEvent) => void;
  delta?: number;
  impactActive: boolean;
  formulaSource?: string;
  onConnectionPointerDown?: (
    id: string,
    side: MetricPortSide,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  isNorthStar?: boolean;
}

export function MetricCard({
  metric,
  selected,
  relationHovered = false,
  onSelect,
  onDelete,
  onStartDrag,
  onContextMenu,
  delta,
  impactActive,
  formulaSource,
  onConnectionPointerDown,
  isNorthStar = false,
}: MetricCardProps) {
  const isInput = metric.kind !== 'derived';
  const hasDelta = delta !== undefined && Math.abs(delta) > 0.0001;
  const geometry = getMetricCardSize(metric.behavior);
  const isStock = metric.behavior === 'stock';
  const isFlow = metric.behavior === 'flow';
  const isRate = metric.behavior === 'rate';
  const isOneOff = metric.behavior === 'one_off';
  const behaviorIcon = metric.behavior === 'stock'
    ? <Database className="size-[0.875rem] text-sky-600" />
    : metric.behavior === 'rate'
      ? <Activity className="size-[0.875rem] text-violet-500" />
      : metric.behavior === 'one_off'
        ? <Ticket className="size-[0.875rem] text-amber-600" />
        : <TrendingUp className="size-[0.875rem] text-emerald-600" />;
  const dragTimerRef = useRef<number | null>(null);
  const didDragRef = useRef(false);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    event.stopPropagation();
    if ((event.target as HTMLElement).closest('button') || event.button !== 0) return;
    didDragRef.current = false;
    const startX = event.clientX;
    const startY = event.clientY;

    dragTimerRef.current = window.setTimeout(() => {
      didDragRef.current = true;
      onStartDrag?.(metric.id, event);
    }, 150);

    const handleMove = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientX - startX) <= 3 && Math.abs(moveEvent.clientY - startY) <= 3) return;
      if (!didDragRef.current) {
        didDragRef.current = true;
        if (dragTimerRef.current) window.clearTimeout(dragTimerRef.current);
        onStartDrag?.(metric.id, event);
      }
      window.removeEventListener('pointermove', handleMove);
    };
    const handleUp = () => {
      if (dragTimerRef.current) window.clearTimeout(dragTimerRef.current);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [metric.id, onStartDrag]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (!didDragRef.current) onSelect(metric.id, event.shiftKey);
  }, [metric.id, onSelect]);

  return (
    <div
      data-canvas-interactive="true"
      data-metric-id={metric.id}
      className="absolute select-none"
      style={{
        left: metric.position.x,
        top: metric.position.y,
        width: geometry.width,
        height: geometry.height,
        zIndex: selected ? 10 : 1,
      }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(metric.id, event);
      }}
    >
      <div
        title={metric.validationMessages.join('\n')}
        className={`relative flex h-full flex-col overflow-visible border transition-all duration-150 cursor-pointer group ${
          selected
            ? 'border-primary bg-card shadow-[0_0_0_2px_var(--primary)]'
            : relationHovered
              ? 'border-sky-400 bg-card shadow-[0_0_0_2px_rgba(14,165,233,0.22)]'
            : `${statusColors[metric.validationStatus] ?? 'border-border'} bg-card hover:border-muted-foreground/30 hover:shadow-md`
        } ${isRate ? 'p-[0.625rem]' : isOneOff ? 'px-[1rem] py-[0.75rem]' : 'p-[0.875rem]'}`}
        style={{
          borderRadius: geometry.borderRadius,
          backgroundImage: isOneOff
            ? 'linear-gradient(135deg, transparent 0%, transparent 92%, rgba(251, 191, 36, 0.18) 92%)'
            : undefined,
        }}
      >
        {isOneOff ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-[0.625rem] left-[0.5rem] border-l border-dashed border-amber-400/60"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-[0.625rem] right-[0.5rem] border-r border-dashed border-amber-400/60"
            />
          </>
        ) : null}
        <div className={`${isRate ? 'mb-[0.1875rem]' : 'mb-[0.375rem]'} flex items-center justify-between gap-[0.25rem]`}>
          <div className="flex items-center gap-[0.375rem] flex-1 min-w-0">
            {isNorthStar
              ? <Sparkles className="size-[0.875rem] text-amber-500" />
              : behaviorIcon}
            <span className={`${isRate ? 'text-[0.75rem]' : 'text-[0.8125rem]'} text-foreground truncate`} style={{ fontWeight: 600 }}>
              {metric.name}
            </span>
          </div>
          {onDelete && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDelete(metric.id);
              }}
              className="flex items-center justify-center size-[1.25rem] rounded-[var(--radius-sm)] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
              title="Удалить метрику"
            >
              <Trash2 className="size-[0.625rem]" />
            </button>
          )}
        </div>

        <div className={`flex items-end gap-[0.5rem] ${isStock ? 'mt-auto' : ''}`}>
          <div className={`${isStock ? 'text-[2rem]' : isRate ? 'text-[1.125rem]' : 'text-[1.375rem]'} tracking-tight text-foreground`} style={{ fontWeight: 700, lineHeight: 1.2 }}>
            {fmt(metric.value, metric.unit)}
          </div>
          {hasDelta && impactActive && (
            <div
              className={`flex items-center gap-[0.125rem] rounded-full px-[0.375rem] py-[0.0625rem] text-[0.625rem] mb-[0.125rem] ${
                delta! >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}
              style={{ fontWeight: 600 }}
            >
              {delta! >= 0 ? <TrendingUp className="size-[0.5rem]" /> : <TrendingDown className="size-[0.5rem]" />}
              {delta! > 0 ? '+' : ''}{delta!.toFixed(1)}%
            </div>
          )}
        </div>

        <div className={`${isRate ? 'mt-[0.1875rem]' : 'mt-[0.375rem]'} flex items-center justify-between`}>
          <div className="flex items-center gap-[0.25rem]">
            <span
              className={`text-[0.5625rem] rounded-full px-[0.375rem] py-[0.0625rem] ${
                isInput ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
              }`}
              style={{ fontWeight: 500 }}
            >
              {isInput ? 'Input' : 'Derived'}
            </span>
            <span className={`rounded-full bg-secondary text-muted-foreground px-[0.375rem] py-[0.0625rem] ${isRate ? 'text-[0.5rem]' : 'text-[0.5625rem]'}`}>
              {behaviorLabel(metric.behavior)}
            </span>
            {metric.validationStatus !== 'valid' && (
              <span className={`text-[0.5625rem] rounded-full px-[0.375rem] py-[0.0625rem] ${
                metric.validationStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {metric.validationStatus}
              </span>
            )}
          </div>
          <span className="text-[0.5625rem] text-muted-foreground">{metric.unit.symbol}</span>
        </div>

        {metric.formula && formulaSource && !isRate && (
          <div
            title={`ƒ = ${formulaSource}`}
            className={`mt-[0.25rem] font-mono text-[0.5625rem] leading-[1.35] text-muted-foreground/60 ${
              isFlow ? 'whitespace-normal break-words' : 'truncate'
            }`}
          >
            ƒ = {formulaSource}
          </div>
        )}

        {onConnectionPointerDown
          ? METRIC_PORT_SIDES.map((side) => (
              <button
                key={side}
                type="button"
                aria-label={`Создать расчётную связь из метрики «${metric.name}» ${portLabels[side]}`}
                title={`Протянуть связь ${portLabels[side]}`}
                data-connection-source={metric.id}
                data-connection-side={side}
                className={`absolute size-[0.875rem] rounded-full border-[0.1875rem] border-card bg-primary opacity-0 shadow-sm transition-all hover:scale-125 group-hover:opacity-100 focus:opacity-100 cursor-crosshair ${portClasses[side]}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onConnectionPointerDown(metric.id, side, event);
                }}
                onClick={(event) => event.stopPropagation()}
              />
            ))
          : null}
      </div>
    </div>
  );
}
