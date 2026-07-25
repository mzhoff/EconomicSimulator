import { Eye, Plus } from 'lucide-react';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  onCreateMetric: () => void;
  hiddenMetricCount?: number;
  onRevealHiddenMetrics?: () => void;
}

export function CanvasContextMenu({
  x,
  y,
  onCreateMetric,
  hiddenMetricCount = 0,
  onRevealHiddenMetrics,
}: CanvasContextMenuProps) {
  return (
    <div
      data-canvas-interactive="true"
      role="menu"
      aria-label="Действия с Canvas"
      className="fixed z-[80] w-[13rem] rounded-[var(--radius-lg)] border border-border bg-card p-[0.25rem] shadow-xl"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="context-action flex items-center gap-[0.5rem]"
        onClick={onCreateMetric}
      >
        <Plus className="size-[0.875rem] text-primary" />
        Создать метрику
      </button>
      {hiddenMetricCount > 0 && onRevealHiddenMetrics ? (
        <button
          type="button"
          role="menuitem"
          className="context-action flex items-center gap-[0.5rem]"
          onClick={onRevealHiddenMetrics}
        >
          <Eye className="size-[0.875rem] text-muted-foreground" />
          Показать скрытые ({hiddenMetricCount})
        </button>
      ) : null}
    </div>
  );
}
