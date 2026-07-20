import { memo, useMemo, useState } from 'react';
import {
  Check,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { MetricDef } from './metric-engine';
import type { DomainSummary } from './input-panel';

type DomainMetric = MetricDef & {
  domainIds?: string[];
};

interface DomainManagerProps {
  open: boolean;
  domains: DomainSummary[];
  metrics: Record<string, DomainMetric>;
  selectedMetricIds: readonly string[];
  initialDomainId?: string | null;
  onClose: () => void;
  onCreateDomain: (name: string, color: string) => void;
  onRenameDomain: (domainId: string, name: string) => void;
  onDeleteDomain: (domainId: string) => void;
  onAssignMetrics: (domainId: string, metricIds: readonly string[]) => void;
  onUnassignMetrics: (domainId: string, metricIds: readonly string[]) => void;
}

const DOMAIN_COLORS = [
  '#64748b',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#8b5cf6',
];

function metricDomainIds(metric: DomainMetric): readonly string[] {
  if (metric.domainIds !== undefined) return metric.domainIds;
  return metric.domain ? [metric.domain] : [];
}

interface DomainMembershipRowProps {
  domain: DomainSummary;
  active: boolean;
  assignedCount: number;
  selectedCount: number;
  renaming: boolean;
  renameDraft: string;
  onRenameDraft: (value: string) => void;
  onStartRename: (domain: DomainSummary) => void;
  onCommitRename: (domainId: string) => void;
  onCancelRename: () => void;
  onDelete: (domainId: string) => void;
  onToggleMembership: (domainId: string, assignedToAll: boolean) => void;
}

const DomainMembershipRow = memo(function DomainMembershipRow({
  domain,
  active,
  assignedCount,
  selectedCount,
  renaming,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onToggleMembership,
}: DomainMembershipRowProps) {
  const assignedToAll = selectedCount > 0 && assignedCount === selectedCount;
  const assignedToSome = assignedCount > 0 && !assignedToAll;

  return (
    <div
      className={`rounded-[var(--radius-md)] border bg-card p-[0.625rem] ${
        active ? 'border-primary/60 ring-1 ring-primary/15' : 'border-border'
      }`}
      data-domain-id={domain.id}
    >
      <div className="flex items-center gap-[0.5rem]">
        <button
          type="button"
          role="checkbox"
          aria-checked={assignedToSome ? 'mixed' : assignedToAll}
          disabled={selectedCount === 0}
          onClick={() => onToggleMembership(domain.id, assignedToAll)}
          className={`flex size-[1.125rem] shrink-0 items-center justify-center rounded-[0.25rem] border transition-colors ${
            assignedToAll || assignedToSome
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background'
          } disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer`}
          title={
            selectedCount === 0
              ? 'Сначала выделите метрики'
              : assignedToAll
                ? 'Убрать выбранные метрики из домена'
                : 'Добавить выбранные метрики в домен'
          }
        >
          {assignedToAll ? <Check className="size-[0.75rem]" /> : null}
          {assignedToSome ? <span className="h-[0.125rem] w-[0.5rem] rounded-full bg-current" /> : null}
        </button>
        <span
          className="size-[0.5rem] shrink-0 rounded-full"
          style={{ backgroundColor: domain.color }}
          aria-hidden="true"
        />

        {renaming ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-[0.25rem]"
            onSubmit={(event) => {
              event.preventDefault();
              onCommitRename(domain.id);
            }}
          >
            <input
              autoFocus
              value={renameDraft}
              onChange={(event) => onRenameDraft(event.target.value)}
              className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-primary bg-background px-[0.375rem] py-[0.1875rem] text-[0.6875rem] outline-none"
              aria-label={`Новое название домена «${domain.name}»`}
            />
            <button
              type="submit"
              className="flex size-[1.375rem] items-center justify-center rounded-[var(--radius-sm)] text-primary hover:bg-primary/10 cursor-pointer"
              title="Сохранить название"
            >
              <Check className="size-[0.75rem]" />
            </button>
            <button
              type="button"
              onClick={onCancelRename}
              className="flex size-[1.375rem] items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent cursor-pointer"
              title="Отменить"
            >
              <X className="size-[0.75rem]" />
            </button>
          </form>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>
                {domain.name}
              </div>
              <div className="text-[0.5625rem] text-muted-foreground">
                {selectedCount === 0
                  ? 'Нет выделенных метрик'
                  : `${assignedCount} из ${selectedCount} выделенных`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onStartRename(domain)}
              className="flex size-[1.375rem] items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
              title="Переименовать"
            >
              <Pencil className="size-[0.6875rem]" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(domain.id)}
              className="flex size-[1.375rem] items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              title="Удалить домен — метрики сохранятся"
            >
              <Trash2 className="size-[0.6875rem]" />
            </button>
          </>
        )}
      </div>
    </div>
  );
});

export function DomainManager({
  open,
  domains,
  metrics,
  selectedMetricIds,
  initialDomainId = null,
  onClose,
  onCreateDomain,
  onRenameDomain,
  onDeleteDomain,
  onAssignMetrics,
  onUnassignMetrics,
}: DomainManagerProps) {
  const [newDomainName, setNewDomainName] = useState('');
  const [newDomainColor, setNewDomainColor] = useState(DOMAIN_COLORS[1]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const selectedSet = useMemo(() => new Set(selectedMetricIds), [selectedMetricIds]);
  const selectedMetrics = useMemo(
    () => Object.values(metrics).filter((metric) => selectedSet.has(metric.id)),
    [metrics, selectedSet],
  );
  const assignedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const metric of selectedMetrics) {
      for (const domainId of new Set(metricDomainIds(metric))) {
        counts.set(domainId, (counts.get(domainId) ?? 0) + 1);
      }
    }
    return counts;
  }, [selectedMetrics]);
  const orderedDomains = useMemo(
    () => [...domains].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
    [domains],
  );

  if (!open) return null;

  const handleCreate = () => {
    const name = newDomainName.trim();
    if (!name) return;
    onCreateDomain(name, newDomainColor);
    setNewDomainName('');
  };

  const handleStartRename = (domain: DomainSummary) => {
    setRenamingId(domain.id);
    setRenameDraft(domain.name);
  };

  const handleCommitRename = (domainId: string) => {
    const name = renameDraft.trim();
    if (name) onRenameDomain(domainId, name);
    setRenamingId(null);
    setRenameDraft('');
  };

  const handleToggleMembership = (domainId: string, assignedToAll: boolean) => {
    if (selectedMetricIds.length === 0) return;
    if (assignedToAll) onUnassignMetrics(domainId, selectedMetricIds);
    else onAssignMetrics(domainId, selectedMetricIds);
  };

  return (
    <div
      data-canvas-interactive="true"
      className="absolute inset-0 z-[70] flex items-center justify-center bg-background/55 p-[1rem] backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="domain-manager-title"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(38rem,calc(100vh-2rem))] w-full max-w-[28rem] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-[1rem] border-b border-border px-[1rem] py-[0.875rem]">
          <div>
            <div className="flex items-center gap-[0.5rem]">
              <FolderPlus className="size-[0.875rem] text-muted-foreground" />
              <h2 id="domain-manager-title" className="text-[0.8125rem] text-foreground" style={{ fontWeight: 650 }}>
                Домены метрик
              </h2>
            </div>
            <p className="mt-[0.25rem] text-[0.625rem] text-muted-foreground">
              {selectedMetricIds.length > 0
                ? `Выбрано метрик: ${selectedMetricIds.length}. Можно назначить несколько доменов.`
                : 'Выделите метрики на Canvas, чтобы назначить им домены.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-[1.75rem] shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            aria-label="Закрыть менеджер доменов"
          >
            <X className="size-[0.875rem]" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-[0.75rem]">
          <div className="space-y-[0.5rem]">
            {orderedDomains.map((domain) => (
              <DomainMembershipRow
                key={domain.id}
                domain={domain}
                active={initialDomainId === domain.id}
                assignedCount={assignedCounts.get(domain.id) ?? 0}
                selectedCount={selectedMetricIds.length}
                renaming={renamingId === domain.id}
                renameDraft={renameDraft}
                onRenameDraft={setRenameDraft}
                onStartRename={handleStartRename}
                onCommitRename={handleCommitRename}
                onCancelRename={() => {
                  setRenamingId(null);
                  setRenameDraft('');
                }}
                onDelete={onDeleteDomain}
                onToggleMembership={handleToggleMembership}
              />
            ))}
          </div>

          {orderedDomains.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-border px-[1rem] py-[1.5rem] text-center text-[0.6875rem] text-muted-foreground">
              Доменов пока нет. Создайте первый ниже.
            </div>
          ) : null}
        </div>

        <form
          className="border-t border-border bg-muted/25 p-[0.75rem]"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate();
          }}
        >
          <label className="mb-[0.375rem] block text-[0.625rem] text-muted-foreground" htmlFor="new-domain-name">
            Новый домен
          </label>
          <div className="flex items-center gap-[0.375rem]">
            <input
              id="new-domain-name"
              value={newDomainName}
              onChange={(event) => setNewDomainName(event.target.value)}
              placeholder="Например, Инфраструктура"
              className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-background px-[0.5rem] py-[0.375rem] text-[0.6875rem] outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <button
              type="submit"
              disabled={!newDomainName.trim()}
              className="flex h-[1.875rem] items-center gap-[0.25rem] rounded-[var(--radius-sm)] bg-primary px-[0.625rem] text-[0.625rem] text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <Plus className="size-[0.6875rem]" />
              Создать
            </button>
          </div>
          <div className="mt-[0.5rem] flex items-center gap-[0.375rem]" aria-label="Цвет нового домена">
            {DOMAIN_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewDomainColor(color)}
                className={`flex size-[1.25rem] items-center justify-center rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${
                  newDomainColor === color ? 'border-foreground' : 'border-transparent'
                }`}
                aria-label={`Выбрать цвет ${color}`}
                aria-pressed={newDomainColor === color}
              >
                <span className="size-[0.75rem] rounded-full" style={{ backgroundColor: color }} />
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
