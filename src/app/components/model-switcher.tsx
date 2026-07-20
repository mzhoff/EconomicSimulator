import { Check, ChevronDown, Copy, FilePlus2, Pencil, Trash2, X } from 'lucide-react';
import { memo, useState } from 'react';

export interface ModelListItem {
  id: string;
  name: string;
  metricCount: number;
}

interface ModelSwitcherProps {
  models: ModelListItem[];
  activeModelId: string;
  onSelect: (id: string) => void;
  onCreateBlank: () => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export const ModelSwitcher = memo(function ModelSwitcher({
  models,
  activeModelId,
  onSelect,
  onCreateBlank,
  onDuplicate,
  onRename,
  onDelete,
}: ModelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const active = models.find((model) => model.id === activeModelId) ?? models[0];

  const startRename = (model: ModelListItem) => {
    setEditingId(model.id);
    setDraftName(model.name);
  };

  const commitRename = () => {
    if (editingId && draftName.trim()) onRename(editingId, draftName.trim());
    setEditingId(null);
  };

  return (
    <div data-canvas-interactive="true" className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex max-w-[15rem] items-center gap-[0.375rem] rounded-[var(--radius-lg)] border border-border bg-background px-[0.625rem] py-[0.3125rem] text-left hover:border-muted-foreground/40"
        aria-expanded={open}
        title="Переключить модель"
      >
        <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>
          {active?.name ?? 'Модель'}
        </span>
        <span className="text-[0.5625rem] text-muted-foreground">{active?.metricCount ?? 0}</span>
        <ChevronDown className={`size-[0.6875rem] shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Закрыть список моделей"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-[calc(100%+0.375rem)] z-50 w-[19rem] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card shadow-xl">
            <div className="border-b border-border px-[0.75rem] py-[0.5rem] text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">
              Модели
            </div>
            <div className="max-h-[20rem] overflow-y-auto p-[0.25rem]">
              {models.map((model) => {
                const isActive = model.id === activeModelId;
                const isEditing = editingId === model.id;
                return (
                  <div
                    key={model.id}
                    className={`group flex items-center gap-[0.25rem] rounded-[var(--radius-md)] px-[0.5rem] py-[0.375rem] ${
                      isActive ? 'bg-primary/5' : 'hover:bg-accent'
                    }`}
                  >
                    {isEditing ? (
                      <>
                        <input
                          autoFocus
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitRename();
                            if (event.key === 'Escape') setEditingId(null);
                          }}
                          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-primary bg-background px-[0.375rem] py-[0.1875rem] text-[0.6875rem] outline-none"
                        />
                        <button type="button" onClick={commitRename} className="model-menu-action" title="Сохранить">
                          <Check />
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="model-menu-action" title="Отмена">
                          <X />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(model.id);
                            setOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-[0.6875rem] text-foreground" style={{ fontWeight: isActive ? 650 : 500 }}>
                            {model.name}
                          </span>
                          <span className="block text-[0.5625rem] text-muted-foreground">{model.metricCount} метрик</span>
                        </button>
                        <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                          <button type="button" onClick={() => startRename(model)} className="model-menu-action" title="Переименовать">
                            <Pencil />
                          </button>
                          <button type="button" onClick={() => onDuplicate(model.id)} className="model-menu-action" title="Дублировать">
                            <Copy />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(model.id)}
                            className="model-menu-action hover:text-red-600"
                            title="Удалить"
                            disabled={models.length <= 1}
                          >
                            <Trash2 />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border p-[0.375rem]">
              <button
                type="button"
                onClick={() => {
                  onCreateBlank();
                  setOpen(false);
                }}
                className="flex w-full items-center justify-center gap-[0.375rem] rounded-[var(--radius-md)] bg-primary px-[0.625rem] py-[0.4375rem] text-[0.6875rem] text-primary-foreground hover:bg-primary/90"
                style={{ fontWeight: 600 }}
              >
                <FilePlus2 className="size-[0.75rem]" />
                Новая пустая модель
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
});
