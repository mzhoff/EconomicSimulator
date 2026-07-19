import { AlertCircle, Check, CornerDownLeft, X } from 'lucide-react';
import { useMemo, useRef, type KeyboardEvent } from 'react';
import type { BuilderMetricBehavior } from './metric-geometry';

export interface FormulaMetricOption {
  id: string;
  alias: string;
  name: string;
  unitSymbol?: string;
}

export interface FormulaPreview {
  value?: number | null;
  formattedValue?: string;
  unitSymbol?: string;
  behavior?: BuilderMetricBehavior;
  dependencies?: string[];
  errors: string[];
}

export interface FormulaComposerProps {
  open: boolean;
  metricName: string;
  metricAlias?: string;
  source: string;
  aliases: FormulaMetricOption[];
  preview: FormulaPreview;
  onSourceChange: (source: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}

const OPERATOR_TOKENS = ['+', '−', '×', '÷', '(', ')'] as const;
const OPERATOR_SOURCE: Record<(typeof OPERATOR_TOKENS)[number], string> = {
  '+': ' + ',
  '−': ' - ',
  '×': ' * ',
  '÷': ' / ',
  '(': '(',
  ')': ')',
};
const TRAILING_ALIAS = /[a-zA-Z_][a-zA-Z0-9_]*$/;

export function FormulaComposer({
  open,
  metricName,
  metricAlias,
  source,
  aliases,
  preview,
  onSourceChange,
  onSave,
  onCancel,
  saving = false,
}: FormulaComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const activeToken = source.match(TRAILING_ALIAS)?.[0]?.toLowerCase() ?? '';
  const suggestions = useMemo(() => {
    if (aliases.length === 0) return [];
    const candidates = activeToken
      ? aliases.filter((metric) => (
          metric.alias.toLowerCase().includes(activeToken)
          || metric.name.toLowerCase().includes(activeToken)
        ))
      : aliases;
    return candidates.slice(0, 6);
  }, [activeToken, aliases]);

  if (!open) return null;

  const insertText = (text: string, replaceTrailingAlias = false) => {
    const input = inputRef.current;
    const selectionStart = input?.selectionStart ?? source.length;
    const selectionEnd = input?.selectionEnd ?? source.length;
    const beforeSelection = source.slice(0, selectionStart);
    const aliasMatch = replaceTrailingAlias ? beforeSelection.match(TRAILING_ALIAS) : null;
    const replacementStart = aliasMatch ? selectionStart - aliasMatch[0].length : selectionStart;
    const next = `${source.slice(0, replacementStart)}${text}${source.slice(selectionEnd)}`;
    const nextCursor = replacementStart + text.length;
    onSourceChange(next);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      (event.metaKey || event.ctrlKey)
      && event.key === 'Enter'
      && source.trim().length > 0
      && preview.errors.length === 0
    ) {
      event.preventDefault();
      onSave();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const formattedPreview = preview.formattedValue
    ?? (preview.value === null || preview.value === undefined ? '—' : String(preview.value));
  const canSave = source.trim().length > 0 && preview.errors.length === 0 && !saving;

  return (
    <section
      data-canvas-interactive="true"
      role="dialog"
      aria-modal="true"
      aria-label={`Формула метрики «${metricName}»`}
      className="absolute bottom-[1rem] left-1/2 z-[90] w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card shadow-2xl"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-[1rem] border-b border-border px-[1rem] py-[0.75rem]">
        <div>
          <div className="flex items-center gap-[0.375rem]">
            <span className="font-mono text-[0.75rem] text-violet-600">ƒ</span>
            <h2 className="text-[0.8125rem] text-foreground" style={{ fontWeight: 650 }}>
              {metricName}
            </h2>
            {metricAlias ? (
              <code className="rounded bg-secondary px-[0.3125rem] py-[0.0625rem] text-[0.5625rem] text-muted-foreground">
                {metricAlias}
              </code>
            ) : null}
          </div>
          <p className="mt-[0.125rem] text-[0.625rem] text-muted-foreground">
            Упоминание alias автоматически создаёт Calculation-связь.
          </p>
        </div>
        <button
          type="button"
          aria-label="Закрыть Formula Composer"
          onClick={onCancel}
          className="flex size-[1.75rem] items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <X className="size-[0.875rem]" />
        </button>
      </header>

      <div className="space-y-[0.625rem] p-[1rem]">
        <div className="flex gap-[0.5rem]">
          <span className="flex h-[2.5rem] min-w-[1.75rem] items-center justify-center font-mono text-[0.875rem] text-muted-foreground">
            =
          </span>
          <input
            ref={inputRef}
            autoFocus
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="rentals_per_month * average_check"
            className={`h-[2.5rem] min-w-0 flex-1 rounded-[var(--radius-lg)] border bg-background px-[0.75rem] font-mono text-[0.8125rem] outline-none transition-colors ${
              preview.errors.length > 0 ? 'border-red-300 focus:border-red-500' : 'border-border focus:border-primary'
            }`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-[0.375rem] pl-[2.25rem]">
          <span className="mr-[0.125rem] text-[0.5625rem] uppercase tracking-wide text-muted-foreground">Операторы</span>
          {OPERATOR_TOKENS.map((operator) => (
            <button
              key={operator}
              type="button"
              onClick={() => insertText(OPERATOR_SOURCE[operator])}
              className="flex size-[1.625rem] items-center justify-center rounded-[var(--radius-md)] border border-border bg-card font-mono text-[0.6875rem] text-foreground transition-colors hover:border-muted-foreground/40 hover:bg-accent cursor-pointer"
            >
              {operator}
            </button>
          ))}
        </div>

        {suggestions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-[0.375rem] rounded-[var(--radius-lg)] bg-secondary/70 px-[0.625rem] py-[0.5rem]">
            <span className="mr-[0.125rem] text-[0.5625rem] uppercase tracking-wide text-muted-foreground">
              Метрики
            </span>
            {suggestions.map((metric) => (
              <button
                key={metric.id}
                type="button"
                onClick={() => insertText(metric.alias, Boolean(activeToken))}
                title={`${metric.name}${metric.unitSymbol ? ` · ${metric.unitSymbol}` : ''}`}
                className="flex items-center gap-[0.25rem] rounded-full border border-border bg-card px-[0.5rem] py-[0.1875rem] text-[0.625rem] text-foreground transition-colors hover:border-violet-300 hover:text-violet-700 cursor-pointer"
              >
                <code>{metric.alias}</code>
                <span className="max-w-[7rem] truncate text-muted-foreground">{metric.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className={`grid gap-[0.625rem] ${preview.errors.length > 0 ? 'grid-cols-1' : 'grid-cols-[1fr_auto]'}`}>
          {preview.errors.length > 0 ? (
            <div role="alert" className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-[0.75rem] py-[0.5rem]">
              {preview.errors.map((error) => (
                <div key={error} className="flex items-start gap-[0.375rem] text-[0.625rem] leading-[1.45] text-red-700">
                  <AlertCircle className="mt-[0.0625rem] size-[0.75rem] shrink-0" />
                  {error}
                </div>
              ))}
            </div>
          ) : source.trim().length > 0 ? (
            <div className="flex min-w-0 items-center gap-[0.75rem] rounded-[var(--radius-lg)] border border-emerald-200 bg-emerald-50/60 px-[0.75rem] py-[0.5rem]">
              <Check className="size-[0.875rem] shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <div className="text-[0.5625rem] uppercase tracking-wide text-emerald-700">
                  Предпросмотр
                </div>
                <div className="flex items-baseline gap-[0.375rem]">
                  <span className="truncate text-[0.8125rem] text-emerald-950" style={{ fontWeight: 650 }}>
                    {formattedPreview}{preview.unitSymbol ? ` ${preview.unitSymbol}` : ''}
                  </span>
                  {preview.behavior ? (
                    <span className="text-[0.5625rem] capitalize text-emerald-700">{preview.behavior}</span>
                  ) : null}
                  {preview.dependencies?.length ? (
                    <span className="truncate text-[0.5625rem] text-emerald-700">
                      · {preview.dependencies.length} связ.
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center rounded-[var(--radius-lg)] border border-border bg-secondary/50 px-[0.75rem] py-[0.5rem] text-[0.625rem] text-muted-foreground">
              Введите выражение или выберите alias метрики
            </div>
          )}

          <div className="flex items-center justify-end gap-[0.5rem]">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[var(--radius-lg)] border border-border px-[0.75rem] py-[0.5rem] text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={onSave}
              className="flex items-center gap-[0.375rem] rounded-[var(--radius-lg)] bg-primary px-[0.875rem] py-[0.5rem] text-[0.6875rem] text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              style={{ fontWeight: 600 }}
            >
              <CornerDownLeft className="size-[0.75rem]" />
              {saving ? 'Сохраняю…' : 'Применить формулу'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
