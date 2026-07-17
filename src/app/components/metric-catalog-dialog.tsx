import { useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { MetricBehavior, MetricDomain, MetricRole } from './metric-engine';

export interface CustomMetricDraft {
  name: string;
  description: string;
  behavior: MetricBehavior;
  unitPreset: string;
  domain: MetricDomain;
  role: MetricRole;
  value: number;
}

interface MetricCatalogDialogProps {
  open: boolean;
  onClose: () => void;
  onAddCustom: (metric: CustomMetricDraft) => void;
}

const behaviorOptions = [
  { value: 'stock', label: 'Stock — состояние' },
  { value: 'flow', label: 'Flow — за период' },
  { value: 'rate', label: 'Rate — скорость/отношение' },
  { value: 'event', label: 'Event — отдельный факт' },
];
const unitOptions = [
  { value: 'rub', label: '₽' },
  { value: 'percent', label: '%' },
  { value: 'rentals', label: 'Аренды' },
  { value: 'rentals_per_day', label: 'Аренды/день' },
  { value: 'powerbanks', label: 'Батареи' },
  { value: 'months', label: 'Месяцы' },
  { value: 'ratio', label: 'Безразмерная' },
];
const domainOptions: MetricDomain[] = ['demand', 'revenue', 'variable_costs', 'fixed_costs', 'capex', 'operations', 'results'];
const roleOptions: MetricRole[] = ['driver', 'input', 'diagnostic', 'guardrail', 'constraint', 'output'];

export function MetricCatalogDialog({ open, onClose, onAddCustom }: MetricCatalogDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [behavior, setBehavior] = useState<MetricBehavior>('rate');
  const [unitPreset, setUnitPreset] = useState('ratio');
  const [domain, setDomain] = useState<MetricDomain>('operations');
  const [role, setRole] = useState<MetricRole>('input');
  const [value, setValue] = useState(0);

  if (!open) return null;

  const handleCreate = () => {
    if (!name.trim()) return;
    onAddCustom({
      name: name.trim(),
      description: description.trim(),
      behavior,
      unitPreset,
      domain,
      role,
      value,
    });
    setName('');
    setDescription('');
    setValue(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-[34rem] bg-card rounded-[var(--radius-xl)] border border-border shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-[1.5rem] py-[1rem]">
          <div>
            <h2 className="text-[1rem] text-foreground" style={{ fontWeight: 600 }}>Новая метрика</h2>
            <p className="text-[0.75rem] text-muted-foreground mt-[0.125rem]">Без SaaS-шаблонов: добавляется типизированный узел текущей модели.</p>
          </div>
          <button onClick={onClose} className="flex items-center justify-center size-[2rem] rounded-[var(--radius-md)] text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer">
            <X className="size-[1rem]" />
          </button>
        </div>

        <div className="p-[1.5rem] space-y-[0.875rem]">
          <Field label="Название">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например, uptime станции"
              className="field-input"
            />
          </Field>
          <Field label="Описание">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Что означает метрика и как используется?"
              rows={2}
              className="field-input resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-[0.75rem]">
            <Field label="Поведение">
              <Select value={behavior} onChange={(next) => setBehavior(next as MetricBehavior)} options={behaviorOptions} />
            </Field>
            <Field label="Единица">
              <Select value={unitPreset} onChange={setUnitPreset} options={unitOptions} />
            </Field>
            <Field label="Домен">
              <Select value={domain} onChange={(next) => setDomain(next as MetricDomain)} options={domainOptions.map((item) => ({ value: item, label: item }))} />
            </Field>
            <Field label="Роль">
              <Select value={role} onChange={(next) => setRole(next as MetricRole)} options={roleOptions.map((item) => ({ value: item, label: item }))} />
            </Field>
            {behavior !== 'event' && (
              <Field label="Начальное значение">
                <input
                  type="number"
                  value={value}
                  onChange={(event) => setValue(Number(event.target.value))}
                  className="field-input"
                />
              </Field>
            )}
          </div>

          {behavior === 'event' && (
            <div className="rounded-[var(--radius-lg)] bg-secondary p-[0.625rem] text-[0.6875rem] text-muted-foreground">
              Event в Phase 1 можно описать и сохранить, но нельзя использовать в арифметике или загружать пачкой. Агрегация событий появится на следующем этапе.
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="w-full flex items-center justify-center gap-[0.375rem] rounded-[var(--radius-lg)] bg-primary text-primary-foreground py-[0.625rem] text-[0.8125rem] hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ fontWeight: 600 }}
          >
            <Plus className="size-[0.875rem]" />
            Создать метрику
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[0.6875rem] text-muted-foreground mb-[0.25rem] block">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-input appearance-none pr-[2rem] capitalize cursor-pointer"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown className="absolute right-[0.5rem] top-1/2 -translate-y-1/2 size-[0.75rem] text-muted-foreground pointer-events-none" />
    </div>
  );
}
