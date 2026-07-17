import { useState, useMemo } from 'react';
import { type CatalogMetric, type MetricKind, type MetricDomain, type MetricRole, metricCatalog } from './metric-engine';
import { Search, Plus, X, Database, TrendingUp, Target, Shield, Sparkles, Activity, Eye, BookOpen, ChevronDown } from 'lucide-react';

interface MetricCatalogDialogProps {
  open: boolean;
  onClose: () => void;
  onAddFromCatalog: (metric: CatalogMetric) => void;
  onAddCustom: (metric: {
    name: string;
    kind: MetricKind;
    unit: string;
    description: string;
    domain: MetricDomain;
    role: MetricRole;
    defaultValue: number;
  }) => void;
  existingIds: Set<string>;
}

const categories = ['All', 'Acquisition', 'Monetization', 'Finance', 'Retention', 'Unit Economics', 'Growth', 'Marketplace'];

const roleIcons: Record<string, React.ReactNode> = {
  north_star: <Sparkles className="size-[0.75rem] text-amber-500" />,
  guardrail: <Shield className="size-[0.75rem] text-blue-500" />,
  output: <Target className="size-[0.75rem] text-emerald-600" />,
  driver: <Activity className="size-[0.75rem] text-violet-500" />,
  input: <Database className="size-[0.75rem] text-muted-foreground" />,
  diagnostic: <Eye className="size-[0.75rem] text-sky-500" />,
  intermediate: <TrendingUp className="size-[0.75rem] text-orange-500" />,
};

const kindLabels: Record<MetricKind, string> = {
  input: 'Input',
  derived: 'Derived',
  observed: 'Observed',
  assumption: 'Assumption',
  target: 'Target',
  benchmark: 'Benchmark',
};

const domainOptions: MetricDomain[] = ['monetization', 'finance', 'acquisition', 'retention', 'engagement', 'product', 'operations', 'growth'];
const roleOptions: MetricRole[] = ['north_star', 'driver', 'intermediate', 'output', 'guardrail', 'diagnostic', 'input'];
const unitOptions = [
  { value: '₽', label: '₽ (Currency)' },
  { value: '%', label: '% (Percent)' },
  { value: 'x', label: 'x (Ratio)' },
  { value: 'users', label: 'Users (Count)' },
  { value: 'mo', label: 'Months (Duration)' },
  { value: 'pts', label: 'Points (Score)' },
];

export function MetricCatalogDialog({ open, onClose, onAddFromCatalog, onAddCustom, existingIds }: MetricCatalogDialogProps) {
  const [tab, setTab] = useState<'catalog' | 'custom'>('catalog');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  // Custom metric form
  const [customName, setCustomName] = useState('');
  const [customKind, setCustomKind] = useState<MetricKind>('input');
  const [customUnit, setCustomUnit] = useState('₽');
  const [customDesc, setCustomDesc] = useState('');
  const [customDomain, setCustomDomain] = useState<MetricDomain>('finance');
  const [customRole, setCustomRole] = useState<MetricRole>('input');
  const [customValue, setCustomValue] = useState(0);

  const filteredCatalog = useMemo(() => {
    let items = metricCatalog;
    if (category !== 'All') items = items.filter(m => m.category === category);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(m => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q));
    }
    return items;
  }, [search, category]);

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    onAddCustom({
      name: customName.trim(),
      kind: customKind,
      unit: customUnit,
      description: customDesc,
      domain: customDomain,
      role: customRole,
      defaultValue: customValue,
    });
    setCustomName('');
    setCustomDesc('');
    setCustomValue(0);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-[42rem] max-h-[85vh] bg-card rounded-[var(--radius-xl)] border border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-[1.5rem] py-[1rem]">
          <div>
            <h2 className="text-[1rem] text-foreground" style={{ fontWeight: 600 }}>Add Metric</h2>
            <p className="text-[0.75rem] text-muted-foreground mt-[0.125rem]">Choose from the catalog or create a custom metric</p>
          </div>
          <button onClick={onClose} className="flex items-center justify-center size-[2rem] rounded-[var(--radius-md)] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer">
            <X className="size-[1rem]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-[1.5rem]">
          <button
            onClick={() => setTab('catalog')}
            className={`px-[1rem] py-[0.625rem] text-[0.8125rem] border-b-2 transition-all cursor-pointer ${
              tab === 'catalog' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            style={{ fontWeight: 500 }}
          >
            <span className="flex items-center gap-[0.375rem]">
              <BookOpen className="size-[0.75rem]" />
              Metric Library
            </span>
          </button>
          <button
            onClick={() => setTab('custom')}
            className={`px-[1rem] py-[0.625rem] text-[0.8125rem] border-b-2 transition-all cursor-pointer ${
              tab === 'custom' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            style={{ fontWeight: 500 }}
          >
            <span className="flex items-center gap-[0.375rem]">
              <Plus className="size-[0.75rem]" />
              Custom Metric
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'catalog' && (
            <div className="p-[1.5rem]">
              {/* Search */}
              <div className="relative mb-[0.75rem]">
                <Search className="absolute left-[0.75rem] top-1/2 -translate-y-1/2 size-[0.875rem] text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search metrics..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-[var(--radius-lg)] border border-border bg-background pl-[2.25rem] pr-[0.75rem] py-[0.5rem] text-[0.8125rem] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
              </div>

              {/* Category pills */}
              <div className="flex flex-wrap gap-[0.25rem] mb-[1rem]">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`rounded-full px-[0.625rem] py-[0.25rem] text-[0.6875rem] transition-all cursor-pointer ${
                      category === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                    style={{ fontWeight: 500 }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Metric list */}
              <div className="space-y-[0.375rem]">
                {filteredCatalog.map(metric => {
                  const exists = existingIds.has(metric.id);
                  return (
                    <div
                      key={metric.id}
                      className={`flex items-center justify-between rounded-[var(--radius-lg)] border border-border p-[0.75rem] transition-all ${
                        exists ? 'opacity-50' : 'hover:border-primary/40 hover:bg-accent/30'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-[0.375rem]">
                          {roleIcons[metric.role] || roleIcons.input}
                          <span className="text-[0.8125rem] text-foreground" style={{ fontWeight: 600 }}>{metric.name}</span>
                          <span className={`text-[0.5625rem] rounded-full px-[0.375rem] py-[0.0625rem] ${
                            metric.kind === 'input' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                          }`} style={{ fontWeight: 500 }}>
                            {kindLabels[metric.kind]}
                          </span>
                          <span className="text-[0.5625rem] text-muted-foreground">{metric.unit}</span>
                        </div>
                        <p className="text-[0.6875rem] text-muted-foreground mt-[0.125rem] truncate">{metric.description}</p>
                        {metric.formulaDisplay && (
                          <p className="text-[0.625rem] text-muted-foreground/70 mt-[0.125rem] font-mono">ƒ = {metric.formulaDisplay}</p>
                        )}
                      </div>
                      <button
                        onClick={() => !exists && onAddFromCatalog(metric)}
                        disabled={exists}
                        className={`ml-[0.75rem] flex items-center gap-[0.25rem] rounded-[var(--radius-md)] px-[0.625rem] py-[0.375rem] text-[0.6875rem] transition-all ${
                          exists
                            ? 'text-muted-foreground cursor-not-allowed'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer'
                        }`}
                        style={{ fontWeight: 500 }}
                      >
                        {exists ? 'Added' : <><Plus className="size-[0.75rem]" /> Add</>}
                      </button>
                    </div>
                  );
                })}
                {filteredCatalog.length === 0 && (
                  <div className="text-center py-[2rem] text-[0.8125rem] text-muted-foreground">
                    No metrics found
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'custom' && (
            <div className="p-[1.5rem] space-y-[1rem]">
              <p className="text-[0.75rem] text-muted-foreground">Define a new custom metric. All fields are required.</p>

              <div className="grid grid-cols-2 gap-[0.75rem]">
                <div className="col-span-2">
                  <label className="text-[0.6875rem] text-muted-foreground mb-[0.25rem] block">Name *</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Active Users"
                    className="w-full rounded-[var(--radius-md)] border border-border bg-background px-[0.75rem] py-[0.5rem] text-[0.8125rem] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[0.6875rem] text-muted-foreground mb-[0.25rem] block">Description</label>
                  <input
                    type="text"
                    value={customDesc}
                    onChange={(e) => setCustomDesc(e.target.value)}
                    placeholder="What does this metric represent?"
                    className="w-full rounded-[var(--radius-md)] border border-border bg-background px-[0.75rem] py-[0.5rem] text-[0.8125rem] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-[0.6875rem] text-muted-foreground mb-[0.25rem] block">Type *</label>
                  <SelectField value={customKind} onChange={(v) => setCustomKind(v as MetricKind)} options={Object.entries(kindLabels).map(([v, l]) => ({ value: v, label: l }))} />
                </div>

                <div>
                  <label className="text-[0.6875rem] text-muted-foreground mb-[0.25rem] block">Unit *</label>
                  <SelectField value={customUnit} onChange={setCustomUnit} options={unitOptions} />
                </div>

                <div>
                  <label className="text-[0.6875rem] text-muted-foreground mb-[0.25rem] block">Domain *</label>
                  <SelectField value={customDomain} onChange={(v) => setCustomDomain(v as MetricDomain)} options={domainOptions.map(d => ({ value: d, label: d }))} />
                </div>

                <div>
                  <label className="text-[0.6875rem] text-muted-foreground mb-[0.25rem] block">Role *</label>
                  <SelectField value={customRole} onChange={(v) => setCustomRole(v as MetricRole)} options={roleOptions.map(r => ({ value: r, label: r.replace('_', ' ') }))} />
                </div>

                <div>
                  <label className="text-[0.6875rem] text-muted-foreground mb-[0.25rem] block">Default Value</label>
                  <input
                    type="number"
                    value={customValue}
                    onChange={(e) => setCustomValue(Number(e.target.value))}
                    className="w-full rounded-[var(--radius-md)] border border-border bg-background px-[0.75rem] py-[0.5rem] text-[0.8125rem] text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>

              <button
                onClick={handleAddCustom}
                disabled={!customName.trim()}
                className="w-full rounded-[var(--radius-lg)] bg-primary text-primary-foreground py-[0.625rem] text-[0.8125rem] transition-all hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                style={{ fontWeight: 600 }}
              >
                Create Metric
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectField({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-[var(--radius-md)] border border-border bg-background px-[0.75rem] py-[0.5rem] pr-[2rem] text-[0.8125rem] text-foreground outline-none focus:border-primary capitalize cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-[0.5rem] top-1/2 -translate-y-1/2 size-[0.75rem] text-muted-foreground pointer-events-none" />
    </div>
  );
}
