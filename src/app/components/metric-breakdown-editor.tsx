import { Calculator, Plus, TableProperties, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { convertMetricBreakdownTemplate } from './metric-engine';
import type {
  MetricBreakdownDef,
  MetricDef,
} from './metric-engine';
import type {
  MetricBreakdownInput,
  MetricBreakdownRowInput,
} from './metric-engine';

interface MetricBreakdownEditorProps {
  open: boolean;
  metric: MetricDef | null;
  breakdown?: MetricBreakdownDef;
  metrics: Record<string, MetricDef>;
  onSave: (input: MetricBreakdownInput) => void;
  onRemove?: () => void;
  onClose: () => void;
}

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
});

function nextRowId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowFromBreakdown(
  row: MetricBreakdownDef['rows'][number],
  metrics: Record<string, MetricDef>,
): MetricBreakdownRowInput {
  return {
    id: row.id,
    name: row.name,
    comment: row.comment,
    amount: row.amountMetricId ? metrics[row.amountMetricId]?.value ?? 0 : undefined,
    quantity: row.quantityMetricId ? metrics[row.quantityMetricId]?.value ?? 0 : undefined,
    rate: row.rateMetricId ? metrics[row.rateMetricId]?.value ?? 0 : undefined,
  };
}

function initialInput(
  metric: MetricDef,
  breakdown: MetricBreakdownDef | undefined,
  metrics: Record<string, MetricDef>,
): MetricBreakdownInput {
  if (breakdown) {
    return {
      template: breakdown.template,
      rows: breakdown.rows.map((row) => rowFromBreakdown(row, metrics)),
    };
  }

  return {
    template: 'amount_list',
    rows: [{
      id: nextRowId(),
      name: 'Позиция 1',
      comment: '',
      amount: metric.value ?? 0,
    }],
  };
}

function rowTotal(row: MetricBreakdownRowInput, template: MetricBreakdownInput['template']): number {
  return template === 'amount_list'
    ? row.amount ?? 0
    : (row.quantity ?? 0) * (row.rate ?? 0);
}

function MetricBreakdownEditorContent({
  metric,
  breakdown,
  metrics,
  onSave,
  onRemove,
  onClose,
}: Omit<MetricBreakdownEditorProps, 'open'> & { metric: MetricDef }) {
  const [draft, setDraft] = useState(() => initialInput(metric, breakdown, metrics));
  const total = useMemo(
    () => draft.rows.reduce((sum, row) => sum + rowTotal(row, draft.template), 0),
    [draft],
  );
  const invalid = draft.rows.length === 0 || draft.rows.some((row) => (
    !row.name.trim()
    || (draft.template === 'amount_list'
      ? !Number.isFinite(row.amount) || (row.amount ?? 0) < 0
      : !Number.isFinite(row.quantity)
        || !Number.isFinite(row.rate)
        || (row.quantity ?? 0) < 0
        || (row.rate ?? 0) < 0)
  ));

  const updateRow = (id: string, patch: Partial<MetricBreakdownRowInput>) => {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => row.id === id ? { ...row, ...patch } : row),
    }));
  };

  const changeTemplate = (template: MetricBreakdownInput['template']) => {
    setDraft((current) => convertMetricBreakdownTemplate(current, template));
  };

  const addRow = () => {
    setDraft((current) => ({
      ...current,
      rows: [
        ...current.rows,
        {
          id: nextRowId(),
          name: `Позиция ${current.rows.length + 1}`,
          comment: '',
          ...(current.template === 'amount_list'
            ? { amount: 0 }
            : { quantity: 1, rate: 0 }),
        },
      ],
    }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!invalid) onSave(draft);
  };

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`Состав метрики ${metric.name}`}
      className="flex max-h-[calc(100vh-2rem)] w-[min(68rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card shadow-2xl"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-[1rem] border-b border-border px-[1.25rem] py-[0.875rem]">
        <div className="min-w-0">
          <div className="flex items-center gap-[0.5rem]">
            <TableProperties className="size-[1rem] text-violet-600" />
            <h2 className="truncate text-[0.9375rem] text-foreground" style={{ fontWeight: 650 }}>
              Состав метрики «{metric.name}»
            </h2>
          </div>
          <p className="mt-[0.1875rem] text-[0.6875rem] text-muted-foreground">
            Каждая ячейка хранится как настоящая метрика; итог рассчитывается формулой и может быть развёрнут на Canvas.
          </p>
        </div>
        <button
          type="button"
          aria-label="Закрыть состав метрики"
          onClick={onClose}
          className="flex size-[2rem] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-[1rem]" />
        </button>
      </header>

      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="min-h-0 flex-1 overflow-auto px-[1.25rem] py-[1rem]">
          <fieldset>
            <legend className="mb-[0.5rem] text-[0.6875rem] text-muted-foreground">Структура расчёта</legend>
            <div className="grid max-w-[35rem] grid-cols-2 gap-[0.5rem]">
              <TemplateButton
                active={draft.template === 'amount_list'}
                title="Список сумм"
                description="Сервисы, подписки и другие готовые суммы"
                onClick={() => changeTemplate('amount_list')}
              />
              <TemplateButton
                active={draft.template === 'quantity_rate'}
                title="Количество × ставка"
                description="Роли, лицензии или ресурсы с ценой за единицу"
                onClick={() => changeTemplate('quantity_rate')}
              />
            </div>
          </fieldset>

          <div className="mt-[1rem] overflow-hidden rounded-[var(--radius-lg)] border border-border">
            <div className={`grid items-center gap-[0.5rem] border-b border-border bg-secondary/70 px-[0.75rem] py-[0.5rem] text-[0.625rem] text-muted-foreground ${
              draft.template === 'amount_list'
                ? 'grid-cols-[minmax(12rem,1.2fr)_10rem_minmax(12rem,1fr)_2rem]'
                : 'grid-cols-[minmax(11rem,1.2fr)_7rem_10rem_10rem_minmax(10rem,1fr)_2rem]'
            }`}>
              <span>Позиция</span>
              {draft.template === 'quantity_rate' ? <span className="text-right">Количество</span> : null}
              <span className="text-right">{draft.template === 'amount_list' ? 'Сумма' : 'Ставка в месяц'}</span>
              {draft.template === 'quantity_rate' ? <span className="text-right">Сумма</span> : null}
              <span>Комментарий</span>
              <span />
            </div>

            <div className="divide-y divide-border">
              {draft.rows.map((row) => (
                <div
                  key={row.id}
                  className={`grid items-center gap-[0.5rem] px-[0.75rem] py-[0.625rem] ${
                    draft.template === 'amount_list'
                      ? 'grid-cols-[minmax(12rem,1.2fr)_10rem_minmax(12rem,1fr)_2rem]'
                      : 'grid-cols-[minmax(11rem,1.2fr)_7rem_10rem_10rem_minmax(10rem,1fr)_2rem]'
                  }`}
                >
                  <input
                    value={row.name}
                    onChange={(event) => updateRow(row.id, { name: event.target.value })}
                    aria-label="Название позиции"
                    className="field-input"
                  />
                  {draft.template === 'quantity_rate' ? (
                    <NumberCell
                      label={`Количество для ${row.name}`}
                      value={row.quantity ?? 0}
                      step={1}
                      onChange={(quantity) => updateRow(row.id, { quantity })}
                    />
                  ) : null}
                  <NumberCell
                    label={`${draft.template === 'amount_list' ? 'Сумма' : 'Ставка'} для ${row.name}`}
                    value={draft.template === 'amount_list' ? row.amount ?? 0 : row.rate ?? 0}
                    step={draft.template === 'amount_list' ? 100 : 1000}
                    onChange={(value) => updateRow(
                      row.id,
                      draft.template === 'amount_list' ? { amount: value } : { rate: value },
                    )}
                  />
                  {draft.template === 'quantity_rate' ? (
                    <output className="block text-right text-[0.75rem] tabular-nums text-foreground" style={{ fontWeight: 600 }}>
                      {moneyFormatter.format(rowTotal(row, draft.template))}
                    </output>
                  ) : null}
                  <input
                    value={row.comment}
                    onChange={(event) => updateRow(row.id, { comment: event.target.value })}
                    aria-label={`Комментарий для ${row.name}`}
                    placeholder="Необязательно"
                    className="field-input"
                  />
                  <button
                    type="button"
                    aria-label={`Удалить позицию ${row.name}`}
                    title="Удалить позицию"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      rows: current.rows.filter((item) => item.id !== row.id),
                    }))}
                    className="flex size-[2rem] cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-[0.75rem]" />
                  </button>
                </div>
              ))}
            </div>

            {draft.rows.length === 0 ? (
              <div className="px-[1rem] py-[2rem] text-center text-[0.75rem] text-muted-foreground">
                Добавьте хотя бы одну позицию.
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-[1rem] border-t border-border bg-secondary/35 px-[0.75rem] py-[0.625rem]">
              <button
                type="button"
                onClick={addRow}
                className="flex cursor-pointer items-center gap-[0.375rem] rounded-[var(--radius-md)] border border-dashed border-border px-[0.625rem] py-[0.375rem] text-[0.6875rem] text-muted-foreground hover:border-violet-400 hover:text-violet-700"
              >
                <Plus className="size-[0.75rem]" />
                Добавить позицию
              </button>
              <div className="flex items-center gap-[0.75rem]">
                <span className="text-[0.6875rem] text-muted-foreground">Итого по {draft.rows.length} поз.</span>
                <output className="text-[1rem] tabular-nums text-foreground" style={{ fontWeight: 700 }}>
                  {moneyFormatter.format(total)}
                </output>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-[1rem] border-t border-border px-[1.25rem] py-[0.875rem]">
          <div>
            {breakdown && onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                className="cursor-pointer rounded-[var(--radius-lg)] px-[0.75rem] py-[0.5rem] text-[0.6875rem] text-red-600 hover:bg-red-50"
              >
                Удалить состав
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-[0.5rem]">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-[var(--radius-lg)] border border-border px-[0.875rem] py-[0.5rem] text-[0.75rem] text-muted-foreground hover:text-foreground"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={invalid}
              className="flex cursor-pointer items-center gap-[0.375rem] rounded-[var(--radius-lg)] bg-primary px-[1rem] py-[0.5rem] text-[0.75rem] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              style={{ fontWeight: 600 }}
            >
              <Calculator className="size-[0.75rem]" />
              Сохранить и пересчитать
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}

export function MetricBreakdownEditor(props: MetricBreakdownEditorProps) {
  if (!props.open || !props.metric) return null;
  const resetKey = `${props.metric.id}:${props.breakdown?.id ?? 'new'}:${props.breakdown?.template ?? 'new'}`;
  return (
    <div
      data-canvas-interactive="true"
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/20 p-[1rem] backdrop-blur-[1px]"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <MetricBreakdownEditorContent
        key={resetKey}
        metric={props.metric}
        breakdown={props.breakdown}
        metrics={props.metrics}
        onSave={props.onSave}
        onRemove={props.onRemove}
        onClose={props.onClose}
      />
    </div>
  );
}

function TemplateButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`cursor-pointer rounded-[var(--radius-lg)] border px-[0.75rem] py-[0.625rem] text-left transition-all ${
        active
          ? 'border-primary bg-primary/[0.04] shadow-[0_0_0_1px_var(--primary)]'
          : 'border-border hover:border-muted-foreground/40 hover:bg-accent/50'
      }`}
    >
      <span className="block text-[0.75rem] text-foreground" style={{ fontWeight: 650 }}>{title}</span>
      <span className="mt-[0.125rem] block text-[0.5625rem] text-muted-foreground">{description}</span>
    </button>
  );
}

function NumberCell({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      aria-label={label}
      onChange={(event) => {
        const next = event.currentTarget.valueAsNumber;
        if (Number.isFinite(next)) onChange(next);
      }}
      className="field-input text-right tabular-nums"
    />
  );
}
