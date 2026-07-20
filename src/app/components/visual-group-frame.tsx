import { ChevronDown, ChevronRight, Layers3, MoreHorizontal } from 'lucide-react';
import { memo, useMemo } from 'react';
import type { MetricDef } from './metric-engine';
import { getMetricCardSize } from './metric-geometry';

export interface VisualGroupView {
  id: string;
  name: string;
  color: string;
  metricIds: string[];
  collapsed?: boolean;
}

interface VisualGroupFrameProps {
  group: VisualGroupView;
  metrics: Record<string, MetricDef>;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  onStartDrag: (id: string, event: React.PointerEvent) => void;
  onOpenMenu: (id: string, event: React.MouseEvent) => void;
}

const GROUP_PADDING = 30;
const GROUP_HEADER_HEIGHT = 30;

export const VisualGroupFrame = memo(function VisualGroupFrame({
  group,
  metrics,
  selected,
  onSelect,
  onToggleCollapsed,
  onStartDrag,
  onOpenMenu,
}: VisualGroupFrameProps) {
  const bounds = useMemo(() => {
    const members = group.metricIds.map((id) => metrics[id]).filter(Boolean);
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
      left: left - GROUP_PADDING,
      top: top - GROUP_PADDING - GROUP_HEADER_HEIGHT,
      width: right - left + GROUP_PADDING * 2,
      height: bottom - top + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT,
    };
  }, [group.metricIds, metrics]);

  if (!bounds) return null;
  const color = group.color || '#64748b';

  if (group.collapsed) {
    return (
      <div
        data-canvas-interactive="true"
        data-visual-group-id={group.id}
        className={`absolute z-[2] flex h-[4rem] w-[14rem] select-none items-center gap-[0.5rem] rounded-[var(--radius-xl)] border bg-card px-[0.75rem] shadow-sm ${
          selected ? 'ring-2 ring-primary' : ''
        }`}
        style={{ left: bounds.left, top: bounds.top, borderColor: color }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(group.id);
          onStartDrag(group.id, event);
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapsed(group.id);
          }}
          className="flex size-[1.5rem] shrink-0 items-center justify-center rounded-full"
          style={{ color, backgroundColor: `${color}16` }}
          title="Развернуть группу"
        >
          <ChevronRight className="size-[0.75rem]" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.75rem] text-foreground" style={{ fontWeight: 650 }}>{group.name}</div>
          <div className="text-[0.5625rem] text-muted-foreground">{group.metricIds.length} метрик</div>
        </div>
        <Layers3 className="size-[0.875rem] shrink-0" style={{ color }} />
      </div>
    );
  }

  return (
    <div
      data-canvas-interactive="true"
      data-visual-group-id={group.id}
      className={`absolute z-0 select-none rounded-[var(--radius-xl)] border-2 border-dashed ${
        selected ? 'ring-2 ring-primary/60 ring-offset-2' : ''
      }`}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        borderColor: `${color}80`,
        backgroundColor: `${color}08`,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(group.id);
      }}
    >
      <div
        className="absolute left-[0.75rem] top-[0.5rem] flex h-[1.75rem] items-center gap-[0.375rem] rounded-[var(--radius-lg)] border bg-card px-[0.375rem] shadow-sm"
        style={{ borderColor: `${color}70` }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(group.id);
          onStartDrag(group.id, event);
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapsed(group.id);
          }}
          className="flex size-[1.125rem] items-center justify-center rounded-full"
          style={{ color, backgroundColor: `${color}16` }}
          title="Свернуть группу"
        >
          <ChevronDown className="size-[0.625rem]" />
        </button>
        <span className="max-w-[14rem] truncate text-[0.625rem] text-foreground" style={{ fontWeight: 650 }}>
          {group.name}
        </span>
        <span className="text-[0.5625rem] text-muted-foreground">{group.metricIds.length}</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenMenu(group.id, event);
          }}
          className="flex size-[1.125rem] items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Действия с группой"
        >
          <MoreHorizontal className="size-[0.625rem]" />
        </button>
      </div>
    </div>
  );
});
