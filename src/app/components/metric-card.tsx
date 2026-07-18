import { useCallback, useRef } from 'react';
import {
  Activity,
  Database,
  Eye,
  Shield,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { fmt, type MetricDef } from './metric-engine';

const roleIcons: Record<string, React.ReactNode> = {
  north_star: <Sparkles className="size-[0.875rem] text-amber-500" />,
  guardrail: <Shield className="size-[0.875rem] text-blue-500" />,
  constraint: <Shield className="size-[0.875rem] text-blue-500" />,
  output: <Target className="size-[0.875rem] text-emerald-600" />,
  driver: <Activity className="size-[0.875rem] text-violet-500" />,
  input: <Database className="size-[0.875rem] text-muted-foreground" />,
  diagnostic: <Eye className="size-[0.875rem] text-sky-500" />,
  intermediate: <TrendingUp className="size-[0.875rem] text-orange-500" />,
};

const statusColors: Record<string, string> = {
  valid: 'border-border',
  warning: 'border-amber-400',
  error: 'border-red-400',
  incomplete: 'border-dashed border-muted-foreground/40',
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
}: MetricCardProps) {
  const isInput = metric.kind !== 'derived';
  const hasDelta = delta !== undefined && Math.abs(delta) > 0.0001;
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
      style={{ left: metric.position.x, top: metric.position.y, width: '17rem', zIndex: selected ? 10 : 1 }}
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
        className={`rounded-[var(--radius-xl)] border p-[0.875rem] transition-all duration-150 cursor-pointer group ${
          selected
            ? 'border-primary bg-card shadow-[0_0_0_2px_var(--primary)]'
            : relationHovered
              ? 'border-sky-400 bg-card shadow-[0_0_0_2px_rgba(14,165,233,0.22)]'
            : `${statusColors[metric.validationStatus] ?? 'border-border'} bg-card hover:border-muted-foreground/30 hover:shadow-md`
        }`}
      >
        <div className="mb-[0.375rem] flex items-center justify-between gap-[0.25rem]">
          <div className="flex items-center gap-[0.375rem] flex-1 min-w-0">
            {roleIcons[metric.role] ?? roleIcons.input}
            <span className="text-[0.8125rem] text-foreground truncate" style={{ fontWeight: 600 }}>
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

        <div className="flex items-end gap-[0.5rem]">
          <div className="text-[1.375rem] tracking-tight text-foreground" style={{ fontWeight: 700, lineHeight: 1.2 }}>
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

        <div className="mt-[0.375rem] flex items-center justify-between">
          <div className="flex items-center gap-[0.25rem]">
            <span
              className={`text-[0.5625rem] rounded-full px-[0.375rem] py-[0.0625rem] ${
                isInput ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
              }`}
              style={{ fontWeight: 500 }}
            >
              {isInput ? 'Input' : 'Derived'}
            </span>
            <span className="text-[0.5625rem] rounded-full bg-secondary text-muted-foreground px-[0.375rem] py-[0.0625rem] capitalize">
              {metric.behavior}
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

        {metric.formula && (
          <div className="mt-[0.25rem] text-[0.5625rem] text-muted-foreground/60 font-mono truncate">
            ƒ = {metric.formula.source}
          </div>
        )}
      </div>
    </div>
  );
}
