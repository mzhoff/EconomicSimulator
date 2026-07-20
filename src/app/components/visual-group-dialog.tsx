import { Check, Layers, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

export interface VisualGroupDraft {
  name: string;
  color: string;
}

export interface VisualGroupDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialName?: string;
  initialColor?: string;
  onSave: (draft: VisualGroupDraft) => void;
  onClose: () => void;
}

const GROUP_COLORS = [
  '#64748b',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#a855f7',
] as const;

export function VisualGroupDialog({
  open,
  mode,
  initialName = '',
  initialColor = GROUP_COLORS[0],
  onSave,
  onClose,
}: VisualGroupDialogProps) {
  if (!open) return null;

  return (
    <VisualGroupDialogContent
      key={`${mode}:${initialName}:${initialColor}`}
      mode={mode}
      initialName={initialName}
      initialColor={initialColor}
      onSave={onSave}
      onClose={onClose}
    />
  );
}

function VisualGroupDialogContent({
  mode,
  initialName,
  initialColor,
  onSave,
  onClose,
}: Omit<VisualGroupDialogProps, 'open' | 'initialName' | 'initialColor'> & {
  initialName: string;
  initialColor: string;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const trimmedName = name.trim();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmedName) return;
    onSave({ name: trimmedName, color });
  };

  return (
    <div
      data-canvas-interactive="true"
      className="absolute inset-0 z-[60] flex items-center justify-center p-[1rem]"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'Создание визуальной группы' : 'Редактирование визуальной группы'}
        onSubmit={handleSubmit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        className="relative z-10 w-full max-w-[25rem] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card shadow-2xl"
      >
        <header className="flex items-start justify-between gap-[1rem] border-b border-border px-[1.25rem] py-[1rem]">
          <div className="flex items-start gap-[0.625rem]">
            <span className="flex size-[2rem] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-secondary text-muted-foreground">
              <Layers className="size-[0.9375rem]" />
            </span>
            <div>
              <h2 className="text-[0.875rem] text-foreground" style={{ fontWeight: 650 }}>
                {mode === 'create' ? 'Новая визуальная группа' : 'Визуальная группа'}
              </h2>
              <p className="mt-[0.125rem] text-[0.625rem] leading-[1.4] text-muted-foreground">
                Рамка организует Canvas и не влияет на расчёты или домены.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="flex size-[1.75rem] shrink-0 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <X className="size-[0.875rem]" />
          </button>
        </header>

        <div className="space-y-[1rem] px-[1.25rem] py-[1rem]">
          <label className="block">
            <span className="mb-[0.25rem] block text-[0.6875rem] text-muted-foreground">
              Название
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например, Экономика станции"
              className="field-input"
            />
          </label>

          <fieldset>
            <legend className="mb-[0.5rem] text-[0.6875rem] text-muted-foreground">
              Цвет рамки
            </legend>
            <div className="flex flex-wrap items-center gap-[0.5rem]">
              {GROUP_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Выбрать цвет ${option}`}
                  aria-pressed={color === option}
                  onClick={() => setColor(option)}
                  className="relative flex size-[1.75rem] items-center justify-center rounded-full border-2 border-card shadow-[0_0_0_1px_var(--border)] transition-transform hover:scale-110 cursor-pointer"
                  style={{ backgroundColor: option }}
                >
                  {color === option ? <Check className="size-[0.75rem] text-white drop-shadow-sm" /> : null}
                </button>
              ))}
              <label
                title="Другой цвет"
                className="relative flex size-[1.75rem] cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]"
              >
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Выбрать другой цвет"
                />
                {!GROUP_COLORS.includes(color as (typeof GROUP_COLORS)[number]) ? (
                  <span className="size-[0.75rem] rounded-full border-2 border-white" style={{ backgroundColor: color }} />
                ) : null}
              </label>
            </div>
          </fieldset>

          <div
            className="rounded-[var(--radius-lg)] border border-dashed bg-secondary/30 px-[0.75rem] py-[0.625rem]"
            style={{ borderColor: color }}
          >
            <div className="flex items-center gap-[0.375rem]">
              <span className="size-[0.5rem] rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>
                {trimmedName || 'Название группы'}
              </span>
            </div>
            <div className="mt-[0.375rem] grid grid-cols-3 gap-[0.375rem]" aria-hidden="true">
              <span className="h-[1.75rem] rounded-[var(--radius-md)] border border-border bg-card" />
              <span className="h-[1.75rem] rounded-[var(--radius-md)] border border-border bg-card" />
              <span className="h-[1.75rem] rounded-[var(--radius-md)] border border-border bg-card" />
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-[0.5rem] border-t border-border px-[1.25rem] py-[0.875rem]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-lg)] border border-border px-[0.875rem] py-[0.5rem] text-[0.75rem] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!trimmedName}
            className="rounded-[var(--radius-lg)] bg-primary px-[1rem] py-[0.5rem] text-[0.75rem] text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            style={{ fontWeight: 600 }}
          >
            {mode === 'create' ? 'Создать группу' : 'Сохранить'}
          </button>
        </footer>
      </form>
    </div>
  );
}
