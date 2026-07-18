import {
  Eye,
  Focus,
  FolderTree,
  Hand,
  Layers,
  LayoutGrid,
  Maximize2,
  Minimize2,
  MousePointer2,
  Plus,
  Redo2,
  Spline,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

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
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  scale: number;
  onToggleConnectionMode?: () => void;
  connectionModeActive?: boolean;
  onGroupSelected?: () => void;
  canGroup?: boolean;
  onManageDomains?: () => void;
}

export function BottomToolbar({
  allCollapsed,
  onToggleAll,
  impactActive,
  onToggleImpact,
  onZoomIn,
  onZoomOut,
  onFitToView,
  onAutoLayout,
  onAddMetric,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  scale,
  onToggleConnectionMode,
  connectionModeActive = false,
  onGroupSelected,
  canGroup = false,
  onManageDomains,
}: BottomToolbarProps) {
  return (
    <div
      data-canvas-interactive="true"
      className="absolute bottom-[1rem] left-1/2 -translate-x-1/2 z-30 flex items-center gap-[0.25rem] rounded-[var(--radius-xl)] border border-border bg-card px-[0.375rem] py-[0.375rem] shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ToolBtn icon={<Plus />} tooltip="Добавить метрику" onClick={onAddMetric} highlight />
      <Divider />
      <ToolBtn icon={<MousePointer2 />} tooltip="Выделение: клик, Shift и рамка" active />
      <ToolBtn icon={<Hand />} tooltip="Панорамирование: средняя кнопка или колесо" />
      <ToolBtn
        icon={<Spline />}
        tooltip={onToggleConnectionMode ? 'Соединить метрики формулой' : 'Режим соединения пока недоступен'}
        active={connectionModeActive}
        onClick={onToggleConnectionMode}
        disabled={!onToggleConnectionMode}
      />
      <ToolBtn
        icon={<Layers />}
        tooltip={canGroup ? 'Сгруппировать выбранные метрики (⌘G)' : 'Выберите несколько метрик для группировки'}
        onClick={onGroupSelected}
        disabled={!onGroupSelected || !canGroup}
      />
      <ToolBtn
        icon={<FolderTree />}
        tooltip="Управление смысловыми доменами"
        onClick={onManageDomains}
        disabled={!onManageDomains}
      />
      <Divider />
      <ToolBtn icon={<Eye />} tooltip="What-if impact до North Star" active={impactActive} onClick={onToggleImpact} />
      <Divider />
      <ToolBtn icon={<Undo2 />} tooltip="Отменить (⌘Z)" onClick={onUndo} disabled={!canUndo} />
      <ToolBtn icon={<Redo2 />} tooltip="Повторить (⇧⌘Z)" onClick={onRedo} disabled={!canRedo} />
      <Divider />
      <ToolBtn icon={<LayoutGrid />} tooltip="Автоматически разложить DAG" onClick={onAutoLayout} />
      <ToolBtn icon={<Focus />} tooltip="Показать всю модель" onClick={onFitToView} />
      <Divider />
      <ToolBtn icon={<ZoomOut />} tooltip="Уменьшить масштаб" onClick={onZoomOut} />
      <span className="text-[0.625rem] text-muted-foreground min-w-[2.5rem] text-center select-none" style={{ fontWeight: 500 }}>
        {Math.round(scale * 100)}%
      </span>
      <ToolBtn icon={<ZoomIn />} tooltip="Увеличить масштаб" onClick={onZoomIn} />
      <Divider />
      <ToolBtn
        icon={allCollapsed ? <Minimize2 /> : <Maximize2 />}
        tooltip={allCollapsed ? 'Показать панели' : 'Скрыть панели'}
        onClick={onToggleAll}
      />
    </div>
  );
}

function ToolBtn({
  icon,
  tooltip,
  active,
  disabled,
  onClick,
  highlight,
}: {
  icon: React.ReactNode;
  tooltip: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  highlight?: boolean;
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
