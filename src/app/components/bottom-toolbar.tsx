import { Undo2, Redo2, LayoutGrid, Maximize2, Minimize2, ZoomIn, ZoomOut, Focus, MousePointer2, Hand, Spline, Eye, Plus } from 'lucide-react';

interface BottomToolbarProps {
  allCollapsed: boolean;
  onToggleAll: () => void;
  impactActive: boolean;
  onToggleImpact: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToView: () => void;
  onAutoLayout: () => void;
  onAddMetric: () => void;
  scale: number;
}

export function BottomToolbar({ allCollapsed, onToggleAll, impactActive, onToggleImpact, onZoomIn, onZoomOut, onFitToView, onAutoLayout, onAddMetric, scale }: BottomToolbarProps) {
  return (
    <div
      className="absolute bottom-[1rem] left-1/2 -translate-x-1/2 z-30 flex items-center gap-[0.25rem] rounded-[var(--radius-xl)] border border-border bg-card px-[0.375rem] py-[0.375rem] shadow-lg"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Add metric */}
      <ToolBtn icon={<Plus />} tooltip="Add Metric" onClick={onAddMetric} highlight />

      <Divider />

      <ToolBtn icon={<MousePointer2 />} tooltip="Select" active />
      <ToolBtn icon={<Hand />} tooltip="Pan (middle mouse)" />
      <ToolBtn icon={<Spline />} tooltip="Connect" />

      <Divider />

      <ToolBtn icon={<Eye />} tooltip="Impact +10%" active={impactActive} onClick={onToggleImpact} />

      <Divider />

      <ToolBtn icon={<LayoutGrid />} tooltip="Auto-layout" onClick={onAutoLayout} />
      <ToolBtn icon={<Focus />} tooltip="Fit to view" onClick={onFitToView} />

      <Divider />

      <ToolBtn icon={<ZoomOut />} tooltip="Zoom out" onClick={onZoomOut} />
      <span className="text-[0.625rem] text-muted-foreground min-w-[2.5rem] text-center select-none" style={{ fontWeight: 500 }}>
        {Math.round(scale * 100)}%
      </span>
      <ToolBtn icon={<ZoomIn />} tooltip="Zoom in" onClick={onZoomIn} />

      <Divider />

      <ToolBtn
        icon={allCollapsed ? <Minimize2 /> : <Maximize2 />}
        tooltip={allCollapsed ? 'Show panels' : 'Hide panels'}
        onClick={onToggleAll}
      />
    </div>
  );
}

function ToolBtn({ icon, tooltip, active, disabled, onClick, highlight }: {
  icon: React.ReactNode; tooltip: string; active?: boolean; disabled?: boolean; onClick?: () => void; highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={`flex items-center justify-center size-[2rem] rounded-[var(--radius-md)] transition-all
        ${highlight ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
        ${!highlight && active ? 'bg-primary text-primary-foreground' : ''}
        ${!highlight && !active ? 'text-muted-foreground hover:text-foreground hover:bg-accent' : ''}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span className="[&_svg]:size-[1rem]">{icon}</span>
    </button>
  );
}

function Divider() {
  return <div className="w-px h-[1.25rem] bg-border mx-[0.125rem]" />;
}
