import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Frame,
} from 'lucide-react';
import { memo, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import type { MetricDef } from './metric-engine';
import { getMetricCardSize } from './metric-geometry';

export interface ExecutableFrameView {
  id: string;
  name: string;
  color: string;
  metricIds: string[];
  collapsed?: boolean;
  mode: 'monthly_snapshot' | 'monthly_timeline';
  horizonMonths?: number;
}

export interface ExecutableFrameProps {
  frame: ExecutableFrameView;
  metrics: Record<string, MetricDef>;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  onStartDrag: (id: string, event: ReactPointerEvent) => void;
  onOpen: (id: string) => void;
}

const FRAME_PADDING = 38;
const FRAME_HEADER_HEIGHT = 38;

export const ExecutableFrame = memo(function ExecutableFrame({
  frame,
  metrics,
  selected,
  onSelect,
  onToggleCollapsed,
  onStartDrag,
  onOpen,
}: ExecutableFrameProps) {
  const geometry = useMemo(() => {
    const members = frame.metricIds.map((id) => metrics[id]).filter(Boolean);
    if (members.length === 0) return null;

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const metric of members) {
      const size = getMetricCardSize(metric.behavior);
      left = Math.min(left, metric.position.x);
      top = Math.min(top, metric.position.y);
      right = Math.max(right, metric.position.x + size.width);
      bottom = Math.max(bottom, metric.position.y + size.height);
    }

    return {
      memberCount: members.length,
      bounds: {
        left: left - FRAME_PADDING,
        top: top - FRAME_PADDING - FRAME_HEADER_HEIGHT,
        width: right - left + FRAME_PADDING * 2,
        height: bottom - top + FRAME_PADDING * 2 + FRAME_HEADER_HEIGHT,
      },
    };
  }, [frame.metricIds, metrics]);

  if (!geometry) return null;

  const isTimeline = frame.mode === 'monthly_timeline';
  const color = frame.color || (isTimeline ? '#7c3aed' : '#64748b');
  const horizonMonths = Math.max(1, Math.round(frame.horizonMonths ?? 60));
  const modeLabel = isTimeline ? `Timeline · ${horizonMonths} мес.` : 'Snapshot · 1 месяц';
  const ModeIcon = isTimeline ? CalendarDays : Frame;

  if (frame.collapsed) {
    return (
      <div
        data-canvas-interactive="true"
        data-executable-frame-id={frame.id}
        className={`pointer-events-auto absolute z-[1] flex h-[5rem] w-[16rem] select-none items-center gap-[0.625rem] rounded-[var(--radius-xl)] border-2 bg-card px-[0.75rem] shadow-md ${
          selected ? 'ring-2 ring-primary ring-offset-2' : ''
        }`}
        style={{
          left: geometry.bounds.left,
          top: geometry.bounds.top,
          borderColor: color,
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(frame.id);
          onStartDrag(frame.id, event);
        }}
      >
        <button
          type="button"
          className="flex size-[1.625rem] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent"
          style={{ color, backgroundColor: `${color}16` }}
          title="Развернуть модель"
          aria-label={`Развернуть модель «${frame.name}»`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(frame.id);
            onToggleCollapsed(frame.id);
          }}
        >
          <ChevronRight className="size-[0.875rem]" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.75rem] text-foreground" style={{ fontWeight: 650 }}>
            {frame.name}
          </div>
          <div
            className="mt-[0.25rem] inline-flex max-w-full items-center gap-[0.25rem] rounded-full px-[0.4375rem] py-[0.1875rem] text-[0.5625rem]"
            style={{ color, backgroundColor: `${color}12` }}
          >
            <ModeIcon className="size-[0.625rem] shrink-0" />
            <span className="truncate">{modeLabel}</span>
          </div>
        </div>

        <button
          type="button"
          className="flex size-[1.625rem] shrink-0 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Открыть модель"
          aria-label={`Открыть модель «${frame.name}»`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => {
            event.stopPropagation();
            onOpen(frame.id);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(frame.id);
          }}
        >
          <ExternalLink className="size-[0.75rem]" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-executable-frame-id={frame.id}
      className={`pointer-events-none absolute z-0 select-none rounded-[var(--radius-xl)] border-2 ${
        selected ? 'ring-2 ring-primary/60 ring-offset-2' : ''
      }`}
      style={{
        left: geometry.bounds.left,
        top: geometry.bounds.top,
        width: geometry.bounds.width,
        height: geometry.bounds.height,
        borderColor: color,
        backgroundColor: `${color}07`,
      }}
    >
      <div
        data-canvas-interactive="true"
        className="pointer-events-auto absolute left-[0.75rem] top-[0.5rem] flex h-[2rem] max-w-[calc(100%-1.5rem)] items-center gap-[0.375rem] rounded-[var(--radius-lg)] border bg-card px-[0.375rem] shadow-sm"
        style={{ borderColor: color }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(frame.id);
          onStartDrag(frame.id, event);
        }}
      >
        <button
          type="button"
          data-canvas-interactive="true"
          className="pointer-events-auto relative z-10 flex size-[1.25rem] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent"
          style={{ color, backgroundColor: `${color}16` }}
          title="Свернуть модель"
          aria-label={`Свернуть модель «${frame.name}»`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapsed(frame.id);
          }}
        >
          <ChevronDown className="size-[0.6875rem]" />
        </button>

        <span className="max-w-[14rem] truncate text-[0.625rem] text-foreground" style={{ fontWeight: 650 }}>
          {frame.name}
        </span>

        <span
          className="inline-flex shrink-0 items-center gap-[0.25rem] rounded-full px-[0.4375rem] py-[0.1875rem] text-[0.5625rem]"
          style={{ color, backgroundColor: `${color}12` }}
        >
          <ModeIcon className="size-[0.625rem]" />
          {modeLabel}
        </span>

        <span className="shrink-0 text-[0.5625rem] text-muted-foreground">
          {geometry.memberCount} метрик
        </span>

        <button
          type="button"
          data-canvas-interactive="true"
          className="pointer-events-auto relative z-10 flex size-[1.25rem] shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Открыть модель"
          aria-label={`Открыть модель «${frame.name}»`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => {
            event.stopPropagation();
            onOpen(frame.id);
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <ExternalLink className="size-[0.6875rem]" />
        </button>
      </div>
    </div>
  );
});
