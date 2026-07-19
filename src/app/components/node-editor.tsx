import { Braces, Check, Plus, Sparkles, X } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import type { BuilderMetricBehavior } from './metric-geometry';

export interface DomainOption {
  id: string;
  name: string;
  color?: string;
}

export type MetricValueMode = 'manual' | 'formula';

export interface MetricNodeDraft {
  name: string;
  alias: string;
  behavior: BuilderMetricBehavior;
  unitPreset: string;
  value: number;
  min: number;
  max: number;
  domainIds: string[];
  description: string;
  valueMode: MetricValueMode;
  formulaSource: string;
}

export interface UnitPresetOption {
  value: string;
  label: string;
}

export interface NodeEditorProps {
  open: boolean;
  mode: 'create' | 'edit';
  draft: MetricNodeDraft;
  domains: DomainOption[];
  onChange: (draft: MetricNodeDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onCreateDomain?: () => void;
  onOpenFormula?: () => void;
  aliasError?: string;
  formError?: string;
  saving?: boolean;
  unitOptions?: UnitPresetOption[];
}

const ALIAS_PATTERN = /^[a-z][a-z0-9_]*$/;

const DEFAULT_UNIT_OPTIONS: UnitPresetOption[] = [
  { value: 'rub', label: '₽ — рубли' },
  { value: 'rub_per_rental', label: '₽ / аренду' },
  { value: 'rub_per_powerbank', label: '₽ / батарею' },
  { value: 'percent', label: '% — проценты' },
  { value: 'rentals', label: 'Аренды' },
  { value: 'rentals_per_day', label: 'Аренды в день' },
  { value: 'powerbanks', label: 'Батареи' },
  { value: 'slots', label: 'Слоты' },
  { value: 'cycles', label: 'Циклы' },
  { value: 'cycles_per_rental', label: 'Циклы / аренду' },
  { value: 'cycles_per_powerbank', label: 'Циклы / батарею' },
  { value: 'months', label: 'Месяцы' },
  { value: 'days', label: 'Дни' },
  { value: 'ratio', label: 'Безразмерная' },
];

const BEHAVIOR_OPTIONS: Array<{
  value: BuilderMetricBehavior;
  label: string;
  description: string;
}> = [
  { value: 'stock', label: 'Stock', description: 'Накопленное состояние' },
  { value: 'flow', label: 'Flow', description: 'Значение за период' },
  { value: 'rate', label: 'Rate', description: 'Скорость или отношение' },
  { value: 'one_off', label: 'One-off', description: 'Разовая величина' },
];

const CYRILLIC_TRANSLITERATION: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function toMetricAlias(name: string): string {
  const transliterated = Array.from(name.toLowerCase(), (character) => (
    CYRILLIC_TRANSLITERATION[character] ?? character
  )).join('');

  const normalized = transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (!normalized) return '';
  return /^[a-z]/.test(normalized) ? normalized : `metric_${normalized}`;
}

export function isMetricAliasValid(alias: string): boolean {
  return ALIAS_PATTERN.test(alias);
}

export function NodeEditor({
  open,
  mode,
  draft,
  domains,
  onChange,
  onSave,
  onCancel,
  onCreateDomain,
  onOpenFormula,
  aliasError,
  formError,
  saving = false,
  unitOptions = DEFAULT_UNIT_OPTIONS,
}: NodeEditorProps) {
  if (!open) return null;

  const localAliasError = draft.alias.length > 0 && !isMetricAliasValid(draft.alias)
    ? 'Только строчные латинские буквы, цифры и _. Начните с буквы.'
    : undefined;
  const rangeError = draft.min >= draft.max
    ? 'Минимум должен быть меньше максимума.'
    : draft.valueMode === 'manual' && (draft.value < draft.min || draft.value > draft.max)
      ? 'Значение должно находиться между минимумом и максимумом.'
      : undefined;
  const blockingError = aliasError ?? localAliasError ?? rangeError;
  const canSave = Boolean(draft.name.trim() && draft.alias.trim() && !blockingError && !formError && !saving);

  const update = <Key extends keyof MetricNodeDraft>(key: Key, value: MetricNodeDraft[Key]) => {
    onChange({ ...draft, [key]: value });
  };

  const toggleDomain = (domainId: string) => {
    const selected = new Set(draft.domainIds);
    if (selected.has(domainId)) selected.delete(domainId);
    else selected.add(domainId);
    update('domainIds', Array.from(selected));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSave) onSave();
  };

  return (
    <aside
      data-canvas-interactive="true"
      aria-label={mode === 'create' ? 'Создание метрики' : 'Редактирование метрики'}
      className="absolute inset-y-0 right-0 z-40 flex w-[25rem] max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-card/98 shadow-2xl backdrop-blur-sm"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-[1rem] border-b border-border px-[1.25rem] py-[1rem]">
        <div>
          <h2 className="text-[0.9375rem] text-foreground" style={{ fontWeight: 650 }}>
            {mode === 'create' ? 'Новая метрика' : 'Свойства метрики'}
          </h2>
          <p className="mt-[0.125rem] text-[0.6875rem] text-muted-foreground">
            Один узел, один alias и понятные пределы моделирования.
          </p>
        </div>
        <button
          type="button"
          aria-label="Закрыть редактор"
          onClick={onCancel}
          className="flex size-[2rem] shrink-0 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <X className="size-[1rem]" />
        </button>
      </header>

      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={handleSubmit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="flex-1 space-y-[1rem] overflow-y-auto px-[1.25rem] py-[1rem]">
          <fieldset>
            <legend className="mb-[0.5rem] text-[0.6875rem] text-muted-foreground">
              Тип метрики
            </legend>
            <div className="grid grid-cols-2 gap-[0.5rem]">
              {BEHAVIOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draft.behavior === option.value}
                  onClick={() => update('behavior', option.value)}
                  className={`flex min-h-[6.25rem] flex-col items-center justify-between rounded-[var(--radius-lg)] border p-[0.625rem] text-center transition-all cursor-pointer ${
                    draft.behavior === option.value
                      ? 'border-primary bg-primary/[0.04] shadow-[0_0_0_1px_var(--primary)]'
                      : 'border-border hover:border-muted-foreground/40 hover:bg-accent/50'
                  }`}
                >
                  <BehaviorShape behavior={option.value} selected={draft.behavior === option.value} />
                  <span>
                    <span className="block text-[0.75rem] text-foreground" style={{ fontWeight: 650 }}>
                      {option.label}
                    </span>
                    <span className="mt-[0.0625rem] block text-[0.5625rem] leading-[1.3] text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <Field label="Название" required>
            <input
              autoFocus={mode === 'create'}
              value={draft.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Например, Средний чек"
              className="field-input"
            />
          </Field>

          <Field
            label="Технический alias"
            required
            hint="Используется в формулах и остаётся уникальным внутри модели."
            error={aliasError ?? localAliasError}
          >
            <div className="flex gap-[0.375rem]">
              <input
                value={draft.alias}
                onChange={(event) => update('alias', event.target.value.toLowerCase())}
                placeholder="average_check"
                spellCheck={false}
                autoCapitalize="none"
                className="field-input font-mono"
              />
              <button
                type="button"
                title="Сформировать alias из названия"
                aria-label="Сформировать alias из названия"
                onClick={() => update('alias', toMetricAlias(draft.name))}
                disabled={!draft.name.trim()}
                className="flex size-[2.375rem] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground disabled:opacity-40 cursor-pointer"
              >
                <Sparkles className="size-[0.875rem]" />
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-[0.75rem]">
            <Field label="Единица измерения" required>
              <select
                value={draft.unitPreset}
                onChange={(event) => update('unitPreset', event.target.value)}
                className="field-input cursor-pointer"
              >
                {unitOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            {draft.valueMode === 'manual' ? (
              <Field label="Текущее значение" required>
                <NumberInput value={draft.value} onChange={(value) => update('value', value)} />
              </Field>
            ) : (
              <div className="rounded-[var(--radius-lg)] border border-violet-200 bg-violet-50/60 px-[0.75rem] py-[0.5rem]">
                <div className="text-[0.625rem] text-violet-700">Рассчитывается</div>
                <div className="mt-[0.125rem] truncate font-mono text-[0.6875rem] text-violet-950">
                  {draft.formulaSource || 'Формула не задана'}
                </div>
              </div>
            )}
          </div>

          <fieldset>
            <legend className="mb-[0.375rem] text-[0.6875rem] text-muted-foreground">
              Значение
            </legend>
            <div className="grid grid-cols-2 gap-[0.375rem] rounded-[var(--radius-lg)] bg-secondary p-[0.25rem]">
              <ValueModeButton
                active={draft.valueMode === 'manual'}
                icon={<Check className="size-[0.75rem]" />}
                label="Ввод вручную"
                onClick={() => update('valueMode', 'manual')}
              />
              <ValueModeButton
                active={draft.valueMode === 'formula'}
                icon={<Braces className="size-[0.75rem]" />}
                label="Формула"
                onClick={() => {
                  update('valueMode', 'formula');
                  onOpenFormula?.();
                }}
              />
            </div>
          </fieldset>

          {draft.valueMode === 'manual' ? (
            <div>
              <div className="grid grid-cols-2 gap-[0.75rem]">
                <Field label="Минимум" required>
                  <NumberInput value={draft.min} onChange={(value) => update('min', value)} />
                </Field>
                <Field label="Максимум" required>
                  <NumberInput value={draft.max} onChange={(value) => update('max', value)} />
                </Field>
              </div>
              {rangeError ? <p className="mt-[0.25rem] text-[0.625rem] text-red-600">{rangeError}</p> : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenFormula}
              className="flex w-full items-center justify-between rounded-[var(--radius-lg)] border border-violet-200 bg-violet-50/50 px-[0.75rem] py-[0.625rem] text-left transition-colors hover:bg-violet-50 cursor-pointer"
            >
              <span>
                <span className="block text-[0.75rem] text-violet-950" style={{ fontWeight: 600 }}>
                  Открыть Formula Composer
                </span>
                <span className="block text-[0.625rem] text-violet-700">
                  Формула создаст Calculation-связи автоматически
                </span>
              </span>
              <Braces className="size-[1rem] text-violet-600" />
            </button>
          )}

          <Field label="Домены" hint="Метрика может находиться сразу в нескольких смысловых доменах.">
            <div className="flex flex-wrap gap-[0.375rem]">
              {domains.map((domain) => {
                const selected = draft.domainIds.includes(domain.id);
                return (
                  <button
                    key={domain.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDomain(domain.id)}
                    className={`flex items-center gap-[0.3125rem] rounded-full border px-[0.5rem] py-[0.25rem] text-[0.625rem] transition-all cursor-pointer ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                    }`}
                  >
                    {domain.color ? (
                      <span
                        className="size-[0.4375rem] rounded-full border border-black/10"
                        style={{ backgroundColor: domain.color }}
                      />
                    ) : null}
                    {domain.name}
                    {selected ? <Check className="size-[0.625rem]" /> : null}
                  </button>
                );
              })}
              {onCreateDomain ? (
                <button
                  type="button"
                  onClick={onCreateDomain}
                  className="flex items-center gap-[0.25rem] rounded-full border border-dashed border-border px-[0.5rem] py-[0.25rem] text-[0.625rem] text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground cursor-pointer"
                >
                  <Plus className="size-[0.625rem]" />
                  Новый домен
                </button>
              ) : null}
            </div>
          </Field>

          <Field label="Описание" hint="Необязательно. Коротко объясните смысл метрики.">
            <textarea
              value={draft.description}
              onChange={(event) => update('description', event.target.value)}
              rows={3}
              placeholder="Что измеряет эта метрика?"
              className="field-input resize-none"
            />
          </Field>

          {formError ? (
            <div role="alert" className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-[0.75rem] py-[0.625rem] text-[0.6875rem] text-red-700">
              {formError}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-[0.5rem] border-t border-border px-[1.25rem] py-[0.875rem]">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[var(--radius-lg)] border border-border px-[0.875rem] py-[0.5rem] text-[0.75rem] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-[var(--radius-lg)] bg-primary px-[1rem] py-[0.5rem] text-[0.75rem] text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            style={{ fontWeight: 600 }}
          >
            {saving ? 'Сохраняю…' : mode === 'create' ? 'Создать метрику' : 'Сохранить'}
          </button>
        </footer>
      </form>
    </aside>
  );
}

function BehaviorShape({
  behavior,
  selected,
}: {
  behavior: BuilderMetricBehavior;
  selected: boolean;
}) {
  const shape = behavior === 'stock'
    ? 'h-[2.5rem] w-[2.5rem] rounded-[0.375rem]'
    : behavior === 'flow'
      ? 'h-[1.5rem] w-[3.5rem] rounded-[0.375rem]'
      : behavior === 'rate'
        ? 'h-[1.25rem] w-[2.875rem] rounded-[0.625rem]'
        : 'h-[1.5rem] w-[3.25rem] rounded-[0.375rem] border-dashed';

  return (
    <span className={`flex h-[2.75rem] items-center justify-center`}>
      <span
        className={`${shape} relative border transition-colors ${
          selected ? 'border-primary bg-primary/10' : 'border-muted-foreground/35 bg-secondary'
        }`}
      >
        {behavior === 'one_off' ? (
          <span
            aria-hidden="true"
            className={`absolute right-0 top-0 size-[0.625rem] ${
              selected ? 'bg-primary/20' : 'bg-amber-200/70'
            }`}
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
          />
        ) : null}
      </span>
    </span>
  );
}

function ValueModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center justify-center gap-[0.3125rem] rounded-[calc(var(--radius-lg)-2px)] px-[0.625rem] py-[0.4375rem] text-[0.6875rem] transition-all cursor-pointer ${
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => {
        const next = event.currentTarget.valueAsNumber;
        if (Number.isFinite(next)) onChange(next);
      }}
      className="field-input tabular-nums"
    />
  );
}

function Field({
  label,
  hint,
  error,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-[0.25rem] flex items-center gap-[0.25rem] text-[0.6875rem] text-muted-foreground">
        {label}
        {required ? <span className="text-red-500">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-[0.25rem] block text-[0.625rem] text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-[0.25rem] block text-[0.5625rem] leading-[1.4] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}
