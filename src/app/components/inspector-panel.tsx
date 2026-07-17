import { useState } from 'react';
import { type MetricDef, type Scenario, type ModelState, type MetricDomain, type MetricRole, fmt } from './metric-engine';
import { Info, GitBranch, BarChart3, ChevronRight, PanelRightClose, PanelRightOpen, Pencil, Check, X } from 'lucide-react';

interface InspectorPanelProps {
  metrics: Record<string, MetricDef>;
  model: ModelState;
  selectedId: string;
  scenarioKey: string;
  scenarios: Record<string, Scenario>;
  collapsed: boolean;
  onToggle: () => void;
  onUpdateMetric?: (id: string, updates: Partial<Pick<MetricDef, 'name' | 'description' | 'domain' | 'role'>>) => void;
  onSelect: (id: string) => void;
}

function getHealthLabel(value: number): { text: string; color: string } {
  if (value >= 75) return { text: 'Strong', color: 'text-emerald-600' };
  if (value >= 50) return { text: 'Moderate', color: 'text-amber-600' };
  return { text: 'Needs work', color: 'text-red-600' };
}

function getStatusBadge(id: string, value: number): { text: string; color: string } | null {
  if (id === 'ltvCac') return value >= 3 ? { text: 'Healthy', color: 'bg-emerald-100 text-emerald-700' } : { text: 'Risk', color: 'bg-red-100 text-red-700' };
  if (id === 'payback') return value <= 12 ? { text: 'OK', color: 'bg-emerald-100 text-emerald-700' } : { text: 'Long', color: 'bg-amber-100 text-amber-700' };
  if (id === 'grossMargin') return value >= 50 ? { text: 'Healthy', color: 'bg-emerald-100 text-emerald-700' } : { text: 'Low', color: 'bg-amber-100 text-amber-700' };
  return null;
}

export function InspectorPanel({ metrics, model, selectedId, scenarioKey, scenarios, collapsed, onToggle, onUpdateMetric, onSelect }: InspectorPanelProps) {
  const selected = metrics[selectedId];
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  if (!selected) return null;

  const parents = model.edges.filter(e => e.to === selectedId).map(e => metrics[e.from]).filter(Boolean);
  const children = model.edges.filter(e => e.from === selectedId).map(e => metrics[e.to]).filter(Boolean);
  const badge = getStatusBadge(selectedId, selected.value);

  const summaryMetrics = [
    { id: 'ltvCac', label: 'LTV / CAC' },
    { id: 'payback', label: 'CAC Payback' },
    { id: 'grossMargin', label: 'Gross Margin' },
    { id: 'health', label: 'Health Score' },
  ];

  const healthStatus = getHealthLabel(metrics.health?.value ?? 0);

  const startEdit = () => {
    setEditName(selected.name);
    setEditDesc(selected.description);
    setEditing(true);
  };

  const saveEdit = () => {
    onUpdateMetric?.(selectedId, { name: editName, description: editDesc });
    setEditing(false);
  };

  return (
    <>
      {collapsed && (
        <button
          onClick={onToggle}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-[0.75rem] right-[0.75rem] z-30 flex items-center justify-center size-[2rem] rounded-[var(--radius-md)] border border-border bg-card text-muted-foreground hover:text-foreground shadow-md transition-all cursor-pointer"
          title="Show inspector"
        >
          <PanelRightOpen className="size-[1rem]" />
        </button>
      )}

      <aside
        className={`absolute top-0 right-0 bottom-0 z-20 flex flex-col bg-card/95 backdrop-blur-sm border-l border-border transition-transform duration-300 ease-in-out ${
          collapsed ? 'translate-x-full' : 'translate-x-0'
        }`}
        style={{ width: '19rem' }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-[1rem] py-[0.625rem]">
          <div className="flex items-center gap-[0.5rem]">
            <Info className="size-[0.875rem] text-muted-foreground" />
            <span className="text-[0.8125rem] text-foreground" style={{ fontWeight: 600 }}>Inspector</span>
          </div>
          <button onClick={onToggle} className="flex items-center justify-center size-[1.5rem] rounded-[var(--radius-sm)] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer" title="Collapse">
            <PanelRightClose className="size-[0.875rem]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Selected metric detail */}
          <div className="border-b border-border p-[1rem]">
            <div className="flex items-center justify-between mb-[0.125rem]">
              <span className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">Selected</span>
              <div className="flex items-center gap-[0.25rem]">
                {badge && (
                  <span className={`text-[0.5625rem] px-[0.375rem] py-[0.0625rem] rounded-full ${badge.color}`} style={{ fontWeight: 600 }}>{badge.text}</span>
                )}
                {!editing && onUpdateMetric && (
                  <button onClick={startEdit} className="flex items-center justify-center size-[1.25rem] rounded-[var(--radius-sm)] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer" title="Edit">
                    <Pencil className="size-[0.625rem]" />
                  </button>
                )}
              </div>
            </div>

            {editing ? (
              <div className="space-y-[0.375rem] mt-[0.25rem]">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-border bg-background px-[0.5rem] py-[0.25rem] text-[0.875rem] text-foreground outline-none focus:border-primary"
                  style={{ fontWeight: 600 }}
                />
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-border bg-background px-[0.5rem] py-[0.25rem] text-[0.6875rem] text-foreground outline-none focus:border-primary"
                />
                <div className="flex gap-[0.25rem]">
                  <button onClick={saveEdit} className="flex items-center gap-[0.125rem] rounded-[var(--radius-md)] bg-primary text-primary-foreground px-[0.5rem] py-[0.25rem] text-[0.6875rem] cursor-pointer" style={{ fontWeight: 500 }}>
                    <Check className="size-[0.625rem]" /> Save
                  </button>
                  <button onClick={() => setEditing(false)} className="flex items-center gap-[0.125rem] rounded-[var(--radius-md)] border border-border px-[0.5rem] py-[0.25rem] text-[0.6875rem] text-muted-foreground cursor-pointer" style={{ fontWeight: 500 }}>
                    <X className="size-[0.625rem]" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-[1rem] text-foreground mt-[0.125rem]" style={{ fontWeight: 600, lineHeight: 1.3 }}>{selected.name}</h3>
                <p className="text-[0.6875rem] text-muted-foreground mt-[0.125rem]" style={{ lineHeight: 1.4 }}>{selected.description}</p>
              </>
            )}

            <div className="text-[1.5rem] text-foreground mt-[0.5rem]" style={{ fontWeight: 700 }}>{fmt(selected.value, selected.unit)}</div>

            {selected.formulaDisplay && (
              <div className="mt-[0.25rem] rounded-[var(--radius-md)] bg-secondary/50 px-[0.5rem] py-[0.25rem] text-[0.625rem] font-mono text-muted-foreground">
                ƒ = {selected.formulaDisplay}
              </div>
            )}

            <div className="mt-[0.5rem] space-y-[0.25rem]">
              <Row label="Type" value={selected.kind} />
              <Row label="Domain" value={selected.domain} capitalize />
              <Row label="Role" value={selected.role.replace('_', ' ')} capitalize />
              <Row label="Unit" value={selected.unit} />
              <Row label="Status" value={selected.status} capitalize />
              <Row label="Scenario" value={scenarios[scenarioKey].label} />
            </div>
          </div>

          {/* Dependencies */}
          {(parents.length > 0 || children.length > 0) && (
            <div className="border-b border-border p-[1rem]">
              <div className="flex items-center gap-[0.25rem] mb-[0.5rem]">
                <GitBranch className="size-[0.75rem] text-muted-foreground" />
                <span className="text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>Dependencies</span>
              </div>
              {parents.length > 0 && (
                <div className="mb-[0.375rem]">
                  <span className="text-[0.625rem] text-muted-foreground">Depends on</span>
                  <div className="mt-[0.125rem] flex flex-wrap gap-[0.25rem]">
                    {parents.map(p => (
                      <button key={p.id} onClick={() => onSelect(p.id)} className="bg-secondary text-secondary-foreground rounded-full px-[0.375rem] py-[0.0625rem] text-[0.625rem] hover:bg-accent transition-colors cursor-pointer">{p.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {children.length > 0 && (
                <div>
                  <span className="text-[0.625rem] text-muted-foreground">Drives</span>
                  <div className="mt-[0.125rem] flex flex-wrap gap-[0.25rem]">
                    {children.map(c => (
                      <button key={c.id} onClick={() => onSelect(c.id)} className="inline-flex items-center gap-[0.0625rem] bg-secondary text-secondary-foreground rounded-full px-[0.375rem] py-[0.0625rem] text-[0.625rem] hover:bg-accent transition-colors cursor-pointer">
                        <ChevronRight className="size-[0.5rem]" />{c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Model Summary */}
          <div className="p-[1rem]">
            <div className="flex items-center gap-[0.25rem] mb-[0.5rem]">
              <BarChart3 className="size-[0.75rem] text-muted-foreground" />
              <span className="text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>Model Summary</span>
            </div>
            <div className="space-y-[0.375rem]">
              {summaryMetrics.map(({ id, label }) => {
                const m = metrics[id];
                if (!m) return null;
                const sb = getStatusBadge(id, m.value);
                return (
                  <div key={id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-border p-[0.5rem]">
                    <div>
                      <div className="text-[0.625rem] text-muted-foreground">{label}</div>
                      <div className="text-[0.875rem] text-foreground" style={{ fontWeight: 600 }}>{fmt(m.value, m.unit)}</div>
                    </div>
                    {sb && (
                      <span className={`text-[0.5625rem] px-[0.25rem] py-[0.0625rem] rounded-full ${sb.color}`} style={{ fontWeight: 500 }}>{sb.text}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-[0.75rem] rounded-[var(--radius-lg)] bg-secondary p-[0.625rem]">
              <div className="flex items-center justify-between">
                <span className="text-[0.6875rem] text-muted-foreground">Overall Health</span>
                <span className={`text-[0.6875rem] ${healthStatus.color}`} style={{ fontWeight: 600 }}>{healthStatus.text}</span>
              </div>
              <div className="mt-[0.25rem] h-[0.25rem] rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(metrics.health?.value ?? 0, 100)}%`,
                    backgroundColor: (metrics.health?.value ?? 0) >= 75 ? '#16a34a' : (metrics.health?.value ?? 0) >= 50 ? '#d97706' : '#dc2626'
                  }}
                />
              </div>
              <div className="mt-[0.125rem] text-[1rem] text-foreground" style={{ fontWeight: 700 }}>{(metrics.health?.value ?? 0).toFixed(0)} / 100</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex justify-between text-[0.6875rem]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${capitalize ? 'capitalize' : ''}`} style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
