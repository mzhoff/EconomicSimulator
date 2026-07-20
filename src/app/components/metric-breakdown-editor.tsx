import {
  Calculator,
  Link2,
  Plus,
  Search,
  TableProperties,
  Trash2,
  X,
} from 'lucide-react';
import {
  Fragment,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  convertMetricBreakdownTemplate,
  metricBreakdownInputFromFormula,
} from './metric-engine';
import type {
  MetricBreakdownDef,
  MetricDef,
} from './metric-engine';
import type {
  MetricBreakdownInput,
  MetricBreakdownRowInput,
} from './metric-engine';
import {
  PERSON,
  RUB,
  RUB_PER_PERSON_MONTH,
  unitsEqual,
} from '../../core/units';

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
const numberFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
});
const MONEY_INPUT_STEP = 0.01;
type ReferenceField = 'amount' | 'quantity' | 'rate';

interface ActiveReferencePicker {
  rowId: string;
  field: ReferenceField;
  query: string;
}

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
  const amountMetricId = row.amountSourceMetricId ?? row.amountMetricId;
  const quantityMetricId = row.quantitySourceMetricId ?? row.quantityMetricId;
  const rateMetricId = row.rateSourceMetricId ?? row.rateMetricId;
  return {
    id: row.id,
    name: row.name,
    comment: row.comment,
    amount: amountMetricId ? metrics[amountMetricId]?.value ?? 0 : undefined,
    amountSourceMetricId: row.amountSourceMetricId,
    quantity: quantityMetricId ? metrics[quantityMetricId]?.value ?? 0 : undefined,
    quantitySourceMetricId: row.quantitySourceMetricId,
    rate: rateMetricId ? metrics[rateMetricId]?.value ?? 0 : undefined,
    rateSourceMetricId: row.rateSourceMetricId,
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

  const formulaInput = metricBreakdownInputFromFormula(metric, metrics);
  if (formulaInput) return formulaInput;

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

function referencedValue(
  fallback: number | undefined,
  sourceMetricId: string | undefined,
  metrics: Record<string, MetricDef>,
): number {
  if (!sourceMetricId) return fallback ?? 0;
  return metrics[sourceMetricId]?.value ?? 0;
}

function rowTotal(
  row: MetricBreakdownRowInput,
  template: MetricBreakdownInput['template'],
  metrics: Record<string, MetricDef>,
): number {
  return template === 'amount_list'
    ? referencedValue(row.amount, row.amountSourceMetricId, metrics)
    : referencedValue(row.quantity, row.quantitySourceMetricId, metrics)
      * referencedValue(row.rate, row.rateSourceMetricId, metrics);
}

function formatMetricValue(value: number, metric: MetricDef): string {
  if (metric.unit.symbol === '%') return `${numberFormatter.format(value * 100)}%`;
  if (metric.unit.symbol === 'x') return `${numberFormatter.format(value)}×`;
  return unitsEqual(metric.unit, RUB)
    ? moneyFormatter.format(value)
    : `${numberFormatter.format(value)}${metric.unit.symbol ? ` ${metric.unit.symbol}` : ''}`;
}

function matchesReferenceField(
  candidate: MetricDef,
  field: ReferenceField,
  resultMetric: MetricDef,
): boolean {
  if (field === 'amount') {
    return candidate.behavior === resultMetric.behavior
      && unitsEqual(candidate.unit, resultMetric.unit);
  }
  if (field === 'quantity') {
    return candidate.behavior === 'stock' && unitsEqual(candidate.unit, PERSON);
  }
  return candidate.behavior === 'rate' && unitsEqual(candidate.unit, RUB_PER_PERSON_MONTH);
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
  const [referencePicker, setReferencePicker] = useState<ActiveReferencePicker | null>(null);
  const ownedMetricIds = useMemo(
    () => new Set(
      breakdown?.rows.flatMap((row) => [
        row.amountMetricId,
        row.quantityMetricId,
        row.rateMetricId,
      ].filter((metricId): metricId is string => Boolean(metricId))) ?? [],
    ),
    [breakdown],
  );
  const referenceCandidates = useMemo(
    () => Object.values(metrics)
      .filter((candidate) => candidate.id !== metric.id && !ownedMetricIds.has(candidate.id))
      .sort((left, right) => left.name.localeCompare(right.name, 'ru')),
    [metric.id, metrics, ownedMetricIds],
  );
  const supportsQuantityRate = metric.behavior === 'flow' && unitsEqual(metric.unit, RUB);
  const total = useMemo(
    () => draft.rows.reduce((sum, row) => sum + rowTotal(row, draft.template, metrics), 0),
    [draft, metrics],
  );
  const invalid = draft.rows.length === 0 || draft.rows.some((row) => (
    !row.name.trim()
    || (draft.template === 'amount_list'
      ? row.amountSourceMetricId
        ? !metrics[row.amountSourceMetricId]
        : !Number.isFinite(row.amount) || (row.amount ?? 0) < 0
      : (
        row.quantitySourceMetricId
          ? !metrics[row.quantitySourceMetricId]
          : !Number.isFinite(row.quantity) || (row.quantity ?? 0) < 0
      ) || (
        row.rateSourceMetricId
          ? !metrics[row.rateSourceMetricId]
          : !Number.isFinite(row.rate) || (row.rate ?? 0) < 0
      ))
  ));

  const updateRow = (id: string, patch: Partial<MetricBreakdownRowInput>) => {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => row.id === id ? { ...row, ...patch } : row),
    }));
  };

  const changeTemplate = (template: MetricBreakdownInput['template']) => {
    if (template === 'quantity_rate' && !supportsQuantityRate) return;
    setDraft((current) => convertMetricBreakdownTemplate(current, template));
    setReferencePicker(null);
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

  const openReferencePicker = (rowId: string, field: ReferenceField) => {
    setReferencePicker({ rowId, field, query: '' });
  };

  const selectReference = (rowId: string, field: ReferenceField, source: MetricDef) => {
    const sourceValue = source.value ?? 0;
    if (field === 'amount') {
      updateRow(rowId, { amount: sourceValue, amountSourceMetricId: source.id });
    } else if (field === 'quantity') {
      updateRow(rowId, { quantity: sourceValue, quantitySourceMetricId: source.id });
    } else {
      updateRow(rowId, { rate: sourceValue, rateSourceMetricId: source.id });
    }
    setReferencePicker(null);
  };

  const clearReference = (rowId: string, field: ReferenceField) => {
    if (field === 'amount') {
      updateRow(rowId, { amountSourceMetricId: undefined });
    } else if (field === 'quantity') {
      updateRow(rowId, { quantitySourceMetricId: undefined });
    } else {
      updateRow(rowId, { rateSourceMetricId: undefined });
    }
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
            <div className={`grid max-w-[35rem] gap-[0.5rem] ${supportsQuantityRate ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <TemplateButton
                active={draft.template === 'amount_list'}
                title="Список сумм"
                description="Числа или ссылки на существующие метрики"
                onClick={() => changeTemplate('amount_list')}
              />
              {supportsQuantityRate ? (
                <TemplateButton
                  active={draft.template === 'quantity_rate'}
                  title="Количество × ставка"
                  description="Каждый множитель можно связать с метрикой"
                  onClick={() => changeTemplate('quantity_rate')}
                />
              ) : null}
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
              {draft.rows.map((row) => {
                const amountSource = row.amountSourceMetricId
                  ? metrics[row.amountSourceMetricId]
                  : undefined;
                const quantitySource = row.quantitySourceMetricId
                  ? metrics[row.quantitySourceMetricId]
                  : undefined;
                const rateSource = row.rateSourceMetricId
                  ? metrics[row.rateSourceMetricId]
                  : undefined;
                return (
                  <Fragment key={row.id}>
                    <div
                      className={`grid items-center gap-[0.5rem] px-[0.75rem] py-[0.625rem] ${
                        draft.template === 'amount_list'
                          ? 'grid-cols-[minmax(12rem,1.2fr)_12rem_minmax(12rem,1fr)_2rem]'
                          : 'grid-cols-[minmax(11rem,1.2fr)_8rem_11rem_9rem_minmax(10rem,1fr)_2rem]'
                      }`}
                    >
                      <input
                        value={row.name}
                        onChange={(event) => updateRow(row.id, { name: event.target.value })}
                        aria-label="Название позиции"
                        className="field-input"
                      />
                      {draft.template === 'quantity_rate' ? (
                        <MetricValueCell
                          label={`Количество для ${row.name}`}
                          sourceMetric={quantitySource}
                          onOpenPicker={() => openReferencePicker(row.id, 'quantity')}
                          onClearReference={() => clearReference(row.id, 'quantity')}
                        >
                          <NumberCell
                            label={`Количество для ${row.name}`}
                            value={row.quantity ?? 0}
                            step={1}
                            onChange={(quantity) => updateRow(row.id, { quantity })}
                          />
                        </MetricValueCell>
                      ) : null}
                      <MetricValueCell
                        label={`${draft.template === 'amount_list' ? 'Сумма' : 'Ставка'} для ${row.name}`}
                        sourceMetric={draft.template === 'amount_list' ? amountSource : rateSource}
                        onOpenPicker={() => openReferencePicker(
                          row.id,
                          draft.template === 'amount_list' ? 'amount' : 'rate',
                        )}
                        onClearReference={() => clearReference(
                          row.id,
                          draft.template === 'amount_list' ? 'amount' : 'rate',
                        )}
                      >
                        <NumberCell
                          label={`${draft.template === 'amount_list' ? 'Сумма' : 'Ставка'} для ${row.name}`}
                          value={draft.template === 'amount_list' ? row.amount ?? 0 : row.rate ?? 0}
                          step={draft.template === 'amount_list'
                            ? metric.inputConfig?.step ?? MONEY_INPUT_STEP
                            : MONEY_INPUT_STEP}
                          onChange={(value) => updateRow(
                            row.id,
                            draft.template === 'amount_list' ? { amount: value } : { rate: value },
                          )}
                        />
                      </MetricValueCell>
                      {draft.template === 'quantity_rate' ? (
                        <output className="block text-right text-[0.75rem] tabular-nums text-foreground" style={{ fontWeight: 600 }}>
                          {formatMetricValue(rowTotal(row, draft.template, metrics), metric)}
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
                    {referencePicker?.rowId === row.id ? (
                      <MetricReferencePicker
                        field={referencePicker.field}
                        query={referencePicker.query}
                        candidates={referenceCandidates.filter((candidate) => (
                          matchesReferenceField(candidate, referencePicker.field, metric)
                        ))}
                        onQueryChange={(query) => setReferencePicker((current) => (
                          current ? { ...current, query } : current
                        ))}
                        onSelect={(source) => selectReference(
                          row.id,
                          referencePicker.field,
                          source,
                        )}
                        onClose={() => setReferencePicker(null)}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
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
                  {formatMetricValue(total, metric)}
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

function MetricValueCell({
  label,
  sourceMetric,
  children,
  onOpenPicker,
  onClearReference,
}: {
  label: string;
  sourceMetric?: MetricDef;
  children: ReactNode;
  onOpenPicker: () => void;
  onClearReference: () => void;
}) {
  if (sourceMetric) {
    return (
      <div className="flex min-w-0 items-center gap-[0.25rem]">
        <button
          type="button"
          aria-label={`Изменить источник: ${label}`}
          title={`${sourceMetric.name} · @${sourceMetric.alias}`}
          onClick={onOpenPicker}
          className="flex h-[2rem] min-w-0 flex-1 cursor-pointer items-center gap-[0.3125rem] rounded-[var(--radius-md)] border border-violet-200 bg-violet-50 px-[0.5rem] text-left text-[0.6875rem] text-violet-800 hover:border-violet-400"
        >
          <Link2 className="size-[0.6875rem] shrink-0" />
          <span className="truncate">@{sourceMetric.alias}</span>
        </button>
        <button
          type="button"
          aria-label={`Вернуть ручной ввод: ${label}`}
          title="Вернуть ручной ввод"
          onClick={onClearReference}
          className="flex size-[1.75rem] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-red-50 hover:text-red-600"
        >
          <X className="size-[0.6875rem]" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-[0.25rem]">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        aria-label={`Связать с метрикой: ${label}`}
        title="Использовать значение существующей метрики"
        onClick={onOpenPicker}
        className="flex size-[1.75rem] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-border text-muted-foreground hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
      >
        <Link2 className="size-[0.6875rem]" />
      </button>
    </div>
  );
}

function referenceFieldLabel(field: ReferenceField): string {
  if (field === 'quantity') return 'Количество';
  if (field === 'rate') return 'Ставка';
  return 'Сумма';
}

function MetricReferencePicker({
  field,
  query,
  candidates,
  onQueryChange,
  onSelect,
  onClose,
}: {
  field: ReferenceField;
  query: string;
  candidates: MetricDef[];
  onQueryChange: (query: string) => void;
  onSelect: (metric: MetricDef) => void;
  onClose: () => void;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const filteredCandidates = normalizedQuery
    ? candidates.filter((candidate) => (
      candidate.name.toLocaleLowerCase('ru').includes(normalizedQuery)
      || candidate.alias.toLocaleLowerCase('en-US').includes(normalizedQuery)
    ))
    : candidates;

  return (
    <div className="bg-violet-50/55 px-[0.75rem] py-[0.75rem]">
      <div className="flex items-center justify-between gap-[1rem]">
        <div>
          <div className="flex items-center gap-[0.375rem] text-[0.75rem] text-foreground" style={{ fontWeight: 650 }}>
            <Link2 className="size-[0.75rem] text-violet-600" />
            Источник поля «{referenceFieldLabel(field)}»
          </div>
          <p className="mt-[0.125rem] text-[0.625rem] text-muted-foreground">
            Выберите метрику — таблица сохранит ссылку на неё, а не копию значения.
          </p>
        </div>
        <button
          type="button"
          aria-label="Закрыть выбор метрики"
          onClick={onClose}
          className="flex size-[1.75rem] cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-card hover:text-foreground"
        >
          <X className="size-[0.75rem]" />
        </button>
      </div>

      <label className="relative mt-[0.625rem] block">
        <Search className="pointer-events-none absolute left-[0.625rem] top-1/2 size-[0.75rem] -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Поиск метрики по названию или alias"
          placeholder="Название или alias, например «разработчики»"
          className="field-input pl-[1.875rem]"
        />
      </label>

      <div className="mt-[0.5rem] max-h-[10rem] overflow-auto rounded-[var(--radius-md)] border border-violet-100 bg-card">
        {filteredCandidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onSelect(candidate)}
            className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-[1rem] border-b border-border px-[0.625rem] py-[0.5rem] text-left last:border-b-0 hover:bg-violet-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-[0.75rem] text-foreground" style={{ fontWeight: 600 }}>
                {candidate.name}
              </span>
              <span className="block truncate text-[0.625rem] text-muted-foreground">
                @{candidate.alias} · {candidate.behavior} · {candidate.unit.symbol}
              </span>
            </span>
            <span className="text-[0.6875rem] tabular-nums text-foreground" style={{ fontWeight: 600 }}>
              {formatMetricValue(candidate.value ?? 0, candidate)}
            </span>
          </button>
        ))}
        {filteredCandidates.length === 0 ? (
          <div className="px-[0.75rem] py-[1.25rem] text-center text-[0.6875rem] text-muted-foreground">
            Совместимых метрик не найдено. Создайте её на Canvas и вернитесь к таблице.
          </div>
        ) : null}
      </div>
    </div>
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
