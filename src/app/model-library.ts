import type { StorageResult } from '../core/storage';
import { validateWorkspaceDocument } from '../core/schema';
import type { WorkspaceDocument } from '../core/model';
import { upgradeOneOffBehaviors, upgradeUniversalUnits } from '../core/migration';
import { upgradeCashFlowPayrollBreakdown } from '../core/breakdowns';
import {
  CASH_FLOW_MODEL_ID,
  LEGACY_TOKBERI_MODEL_ID,
} from '../core/cash-flow-template';

export const MODEL_LIBRARY_VERSION = 1 as const;
export const MODEL_LIBRARY_STORAGE_KEY = 'economic-simulator:model-library:v1';
export const MODEL_LIBRARY_BEHAVIOR_BACKUP_KEY = 'economic-simulator:model-library:backup:one-off';
export const MODEL_LIBRARY_CASH_FLOW_BACKUP_KEY = 'economic-simulator:model-library:backup:cash-flow-reset';
export const MODEL_LIBRARY_BREAKDOWN_BACKUP_KEY = 'economic-simulator:model-library:backup:breakdown-v1';
export const MODEL_LIBRARY_UNIT_BACKUP_KEY = 'economic-simulator:model-library:backup:universal-units-v1';

export interface ModelLibraryEntry {
  workspace: WorkspaceDocument;
}

export interface ModelLibraryState {
  version: typeof MODEL_LIBRARY_VERSION;
  activeModelId: string;
  entries: Record<string, ModelLibraryEntry>;
}

function createLibrary(fallbackWorkspace: WorkspaceDocument): ModelLibraryState {
  const modelId = fallbackWorkspace.model.id;
  return {
    version: MODEL_LIBRARY_VERSION,
    activeModelId: modelId,
    entries: {
      [modelId]: { workspace: fallbackWorkspace },
    },
  };
}

function validateLibrary(value: unknown): ModelLibraryState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ModelLibraryState>;
  if (
    candidate.version !== MODEL_LIBRARY_VERSION
    || typeof candidate.activeModelId !== 'string'
    || !candidate.entries
    || typeof candidate.entries !== 'object'
    || Array.isArray(candidate.entries)
  ) {
    return null;
  }

  const entries: Record<string, ModelLibraryEntry> = {};
  for (const [modelId, rawEntry] of Object.entries(candidate.entries)) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return null;
    const workspace = (rawEntry as Partial<ModelLibraryEntry>).workspace;
    const checked = validateWorkspaceDocument(workspace);
    if (!checked.ok || checked.workspace.model.id !== modelId) return null;
    entries[modelId] = { workspace: checked.workspace };
  }

  if (Object.keys(entries).length === 0 || !entries[candidate.activeModelId]) return null;
  return {
    version: MODEL_LIBRARY_VERSION,
    activeModelId: candidate.activeModelId,
    entries,
  };
}

function serializeLibrary(library: ModelLibraryState): string {
  return JSON.stringify(library, null, 2);
}

function replaceLegacyStarterModel(
  library: ModelLibraryState,
  fallbackWorkspace: WorkspaceDocument,
): { library: ModelLibraryState; changed: boolean } {
  if (!library.entries[LEGACY_TOKBERI_MODEL_ID]) return { library, changed: false };

  const entries = { ...library.entries };
  delete entries[LEGACY_TOKBERI_MODEL_ID];
  entries[CASH_FLOW_MODEL_ID] = { workspace: fallbackWorkspace };
  return {
    changed: true,
    library: {
      ...library,
      activeModelId: library.activeModelId === LEGACY_TOKBERI_MODEL_ID
        ? CASH_FLOW_MODEL_ID
        : library.activeModelId,
      entries,
    },
  };
}

function upgradeLibraryModels(value: unknown): {
  value: unknown;
  changed: boolean;
  oneOffChanged: boolean;
  breakdownChanged: boolean;
  unitChanged: boolean;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      value,
      changed: false,
      oneOffChanged: false,
      breakdownChanged: false,
      unitChanged: false,
    };
  }
  const candidate = value as Partial<ModelLibraryState>;
  if (!candidate.entries || typeof candidate.entries !== 'object' || Array.isArray(candidate.entries)) {
    return {
      value,
      changed: false,
      oneOffChanged: false,
      breakdownChanged: false,
      unitChanged: false,
    };
  }

  let oneOffChanged = false;
  let breakdownChanged = false;
  let unitChanged = false;
  const entries = Object.fromEntries(
    Object.entries(candidate.entries).map(([modelId, rawEntry]) => {
      if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
        return [modelId, rawEntry];
      }
      const workspace = (rawEntry as Partial<ModelLibraryEntry>).workspace;
      if (!workspace) return [modelId, rawEntry];
      const oneOff = upgradeOneOffBehaviors(workspace);
      const breakdown = upgradeCashFlowPayrollBreakdown(oneOff.workspace);
      const units = upgradeUniversalUnits(breakdown.workspace);
      oneOffChanged = oneOffChanged || oneOff.changed;
      breakdownChanged = breakdownChanged || breakdown.changed;
      unitChanged = unitChanged || units.changed;
      return oneOff.changed || breakdown.changed || units.changed
        ? [modelId, { ...rawEntry, workspace: units.workspace }]
        : [modelId, rawEntry];
    }),
  );

  const changed = oneOffChanged || breakdownChanged || unitChanged;
  return changed
    ? {
      changed,
      oneOffChanged,
      breakdownChanged,
      unitChanged,
      value: { ...candidate, entries },
    }
    : { value, changed, oneOffChanged, breakdownChanged, unitChanged };
}

/**
 * Loads the multi-model library. When no library exists yet, the current
 * single-workspace document becomes its first entry and is persisted as-is.
 */
export function loadModelLibrary(
  fallbackWorkspace: WorkspaceDocument,
  storage: Storage | undefined = globalThis.localStorage,
): StorageResult<ModelLibraryState> {
  const fallbackLibrary = createLibrary(fallbackWorkspace);
  if (!storage) {
    return {
      value: fallbackLibrary,
      warning: 'Local Storage недоступен; библиотека моделей работает только в памяти.',
    };
  }

  try {
    const raw = storage.getItem(MODEL_LIBRARY_STORAGE_KEY);
    if (raw) {
      const upgraded = upgradeLibraryModels(JSON.parse(raw) as unknown);
      const parsed = validateLibrary(upgraded.value);
      if (parsed) {
        const reset = replaceLegacyStarterModel(parsed, fallbackWorkspace);
        if (reset.changed) {
          storage.setItem(MODEL_LIBRARY_CASH_FLOW_BACKUP_KEY, raw);
          storage.setItem(MODEL_LIBRARY_STORAGE_KEY, serializeLibrary(reset.library));
          return {
            value: reset.library,
            warning: 'Старая схема TokBeri сохранена в backup и заменена моделью денежного потока.',
          };
        }
        if (upgraded.changed) {
          if (upgraded.oneOffChanged) storage.setItem(MODEL_LIBRARY_BEHAVIOR_BACKUP_KEY, raw);
          if (upgraded.breakdownChanged) storage.setItem(MODEL_LIBRARY_BREAKDOWN_BACKUP_KEY, raw);
          if (upgraded.unitChanged) storage.setItem(MODEL_LIBRARY_UNIT_BACKUP_KEY, raw);
          storage.setItem(MODEL_LIBRARY_STORAGE_KEY, serializeLibrary(parsed));
        }
        return {
          value: parsed,
          warning: upgraded.changed
            ? [
                upgraded.oneOffChanged ? 'Доставка и монтаж обновлены до One-off.' : null,
                upgraded.breakdownChanged ? 'Фонд оплаты труда переведён в табличный состав.' : null,
                upgraded.unitChanged ? 'Единицы измерения переведены на универсальные.' : null,
                'Библиотека сохранена с backup.',
              ].filter(Boolean).join(' ')
            : undefined,
        };
      }
      return {
        value: fallbackLibrary,
        warning: 'Сохранённая библиотека моделей повреждена; открыта текущая рабочая модель.',
      };
    }

    storage.setItem(MODEL_LIBRARY_STORAGE_KEY, serializeLibrary(fallbackLibrary));
    return { value: fallbackLibrary };
  } catch {
    return {
      value: fallbackLibrary,
      warning: 'Не удалось прочитать Local Storage; открыта текущая рабочая модель.',
    };
  }
}

export function saveModelLibrary(
  library: ModelLibraryState,
  storage: Storage | undefined = globalThis.localStorage,
): StorageResult<boolean> {
  if (!storage) return { value: false, warning: 'Local Storage недоступен.' };
  const checked = validateLibrary(library);
  if (!checked) {
    return { value: false, warning: 'Библиотека моделей не сохранена: некорректная структура.' };
  }

  try {
    storage.setItem(MODEL_LIBRARY_STORAGE_KEY, serializeLibrary(checked));
    return { value: true };
  } catch {
    return {
      value: false,
      warning: 'Не удалось сохранить библиотеку моделей: Local Storage недоступен или переполнен.',
    };
  }
}

export function upsertWorkspace(
  library: ModelLibraryState,
  workspace: WorkspaceDocument,
): ModelLibraryState {
  const modelId = workspace.model.id;
  return {
    ...library,
    entries: {
      ...library.entries,
      [modelId]: { workspace },
    },
  };
}

export function switchActive(
  library: ModelLibraryState,
  modelId: string,
): ModelLibraryState {
  if (!library.entries[modelId]) {
    throw new Error(`Модель ${modelId} отсутствует в библиотеке.`);
  }
  if (library.activeModelId === modelId) return library;
  return { ...library, activeModelId: modelId };
}

export function duplicateEntry(
  library: ModelLibraryState,
  sourceModelId: string,
  newModelId: string,
  newName: string,
): ModelLibraryState {
  const source = library.entries[sourceModelId];
  if (!source) throw new Error(`Модель ${sourceModelId} отсутствует в библиотеке.`);
  if (!newModelId.trim()) throw new Error('Новой модели нужен системный id.');
  if (library.entries[newModelId]) throw new Error(`Модель ${newModelId} уже существует.`);
  if (!newName.trim()) throw new Error('Новой модели нужно название.');

  const workspace = structuredClone(source.workspace);
  workspace.model.id = newModelId;
  workspace.model.name = newName.trim();

  return {
    ...library,
    activeModelId: newModelId,
    entries: {
      ...library.entries,
      [newModelId]: { workspace },
    },
  };
}

export function deleteEntry(
  library: ModelLibraryState,
  modelId: string,
): ModelLibraryState {
  if (!library.entries[modelId]) throw new Error(`Модель ${modelId} отсутствует в библиотеке.`);
  if (Object.keys(library.entries).length <= 1) {
    throw new Error('Нельзя удалить последнюю модель.');
  }

  const entries = { ...library.entries };
  delete entries[modelId];
  const activeModelId = library.activeModelId === modelId
    ? Object.keys(entries)[0]!
    : library.activeModelId;

  return {
    ...library,
    activeModelId,
    entries,
  };
}
