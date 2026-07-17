import { type MetricDef, type ModelState, fmt } from './metric-engine';
import { Sliders, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface InputPanelProps {
  metrics: Record<string, MetricDef>;
  model: ModelState;
  inputOverrides: Record<string, number>;
  selectedId: string;
  onSelect: (id: string) => void;
  onChangeInput: (id: string, value: number) => void;
  onReset: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const sliderConfig: Record<string, { min: number; max: number; step: number }> = {
  price: { min: 100, max: 6000, step: 10 },
  cogs: { min: 0, max: 4000, step: 10 },
  churn: { min: 1, max: 40, step: 0.5 },
  cac: { min: 100, max: 6000, step: 10 },
  conversion: { min: 1, max: 40, step: 0.5 },
  traffic: { min: 1000, max: 50000, step: 100 },
};

function getSliderConfig(id: string, value: number) {
  if (sliderConfig[id]) return sliderConfig[id];
  // Auto-generate from value
  const magnitude = Math.max(Math.abs(value), 1);
  return { min: 0, max: magnitude * 3, step: magnitude / 100 };
}

export function InputPanel({ metrics, model, inputOverrides, selectedId, onSelect, onChangeInput, onReset, collapsed, onToggle }: InputPanelProps) {
  const inputs = Object.values(metrics).filter((m) => m.kind === 'input' || m.kind === 'assumption');

  return (
    <>
      {collapsed && (
        <button
          onClick={onToggle}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-[0.75rem] left-[0.75rem] z-30 flex items-center justify-center size-[2rem] rounded-[var(--radius-md)] border border-border bg-card text-muted-foreground hover:text-foreground shadow-md transition-all cursor-pointer"
          title="Show input panel"
        >
          <PanelLeftOpen className="size-[1rem]" />
        </button>
      )}

      <aside
        className={`absolute top-0 left-0 bottom-0 z-20 flex flex-col bg-card/95 backdrop-blur-sm border-r border-border transition-transform duration-300 ease-in-out ${
          collapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
        style={{ width: '18.75rem' }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-[1rem] py-[0.625rem]">
          <div className="flex items-center gap-[0.5rem]">
            <Sliders className="size-[0.875rem] text-muted-foreground" />
            <span className="text-[0.8125rem] text-foreground" style={{ fontWeight: 600 }}>Input Metrics</span>
            <span className="text-[0.625rem] text-muted-foreground">{inputs.length}</span>
          </div>
          <button onClick={onToggle} className="flex items-center justify-center size-[1.5rem] rounded-[var(--radius-sm)] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer" title="Collapse">
            <PanelLeftClose className="size-[0.875rem]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-[0.75rem] space-y-[0.5rem]">
          {inputs.map((metric) => {
            const value = inputOverrides[metric.id] ?? metric.value;
            const config = getSliderConfig(metric.id, model.metrics[metric.id]?.value ?? metric.value);
            const isSelected = selectedId === metric.id;
            const baseVal = model.metrics[metric.id]?.value ?? 0;
            const changed = inputOverrides[metric.id] !== undefined;

            return (
              <div
                key={metric.id}
                onClick={() => onSelect(metric.id)}
                className={`cursor-pointer rounded-[var(--radius-lg)] border p-[0.625rem] transition-all ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-center justify-between mb-[0.25rem]">
                  <span className="text-[0.8125rem] text-foreground" style={{ fontWeight: 500 }}>{metric.name}</span>
                  <span className="text-[0.6875rem] text-muted-foreground">{metric.unit}</span>
                </div>
                <input
                  type="range"
                  min={config.min}
                  max={config.max}
                  step={config.step}
                  value={value}
                  onChange={(e) => onChangeInput(metric.id, Number(e.target.value))}
                  className="w-full h-[0.25rem] accent-[var(--primary)] cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex items-center justify-between mt-[0.25rem]">
                  <span className="text-[0.8125rem] text-foreground" style={{ fontWeight: 600 }}>{fmt(value, metric.unit)}</span>
                  {changed && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onReset(metric.id); }}
                      className="text-[0.6875rem] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
