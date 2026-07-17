import { createTokBeriModel } from './tokberi-template';
import { MODEL_SCHEMA_VERSION } from './model';
import type { ModelState, ViewportState, WorkspaceDocument } from './model';
import { parseWorkspaceJson, validateWorkspaceDocument } from './schema';

export const WORKSPACE_STORAGE_KEY = 'economic-simulator:workspace:v1';
export const LAST_VALID_STORAGE_KEY = 'economic-simulator:last-valid:v1';
export const MIGRATION_BACKUP_KEY = 'economic-simulator:migration-backup:v1';
const LEGACY_STORAGE_KEYS = ['economic-simulator:workspace', 'economic-simulator:model:v0'];

export interface StorageResult<T> {
  value: T;
  warning?: string;
}

export function createWorkspaceDocument(
  model: ModelState = createTokBeriModel(),
  options: Partial<Pick<WorkspaceDocument, 'activeScenarioId' | 'inputOverridesByScenario' | 'viewport'>> = {},
): WorkspaceDocument {
  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    model,
    activeScenarioId: options.activeScenarioId ?? 'base',
    inputOverridesByScenario: options.inputOverridesByScenario ?? {},
    viewport: options.viewport ?? { x: 100, y: 20, scale: 0.35 },
  };
}

export function serializeWorkspace(workspace: WorkspaceDocument): string {
  return JSON.stringify({ ...workspace, savedAt: new Date().toISOString() }, null, 2);
}

export function importWorkspace(text: string): ReturnType<typeof parseWorkspaceJson> {
  return parseWorkspaceJson(text);
}

function backupLegacyStorage(storage: Storage): void {
  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = storage.getItem(key);
    if (!legacy) continue;
    storage.setItem(MIGRATION_BACKUP_KEY, legacy);
    return;
  }
}

export function loadWorkspace(storage: Storage | undefined = globalThis.localStorage): StorageResult<WorkspaceDocument> {
  const fallback = createWorkspaceDocument();
  if (!storage) return { value: fallback, warning: 'Local Storage недоступен; модель работает только в памяти.' };
  try {
    const current = storage.getItem(WORKSPACE_STORAGE_KEY);
    if (current) {
      const parsed = parseWorkspaceJson(current);
      if (parsed.ok) return { value: parsed.workspace };
    }

    const lastValid = storage.getItem(LAST_VALID_STORAGE_KEY);
    if (lastValid) {
      const parsed = parseWorkspaceJson(lastValid);
      if (parsed.ok) return { value: parsed.workspace, warning: 'Основной autosave повреждён; восстановлена последняя валидная версия.' };
    }

    backupLegacyStorage(storage);
    return current
      ? { value: fallback, warning: 'Сохранённая модель не прошла проверку. Открыт безопасный шаблон TokBeri.' }
      : { value: fallback };
  } catch {
    return { value: fallback, warning: 'Не удалось прочитать Local Storage; открыт безопасный шаблон.' };
  }
}

export function saveWorkspace(workspace: WorkspaceDocument, storage: Storage | undefined = globalThis.localStorage): StorageResult<boolean> {
  if (!storage) return { value: false, warning: 'Local Storage недоступен.' };
  const checked = validateWorkspaceDocument(workspace);
  if (!checked.ok) {
    return { value: false, warning: `Модель не сохранена: ${checked.issues[0]?.message ?? 'ошибка схемы'}` };
  }
  try {
    const serialized = serializeWorkspace(workspace);
    storage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    storage.setItem(LAST_VALID_STORAGE_KEY, serialized);
    return { value: true };
  } catch {
    return { value: false, warning: 'Не удалось сохранить модель: Local Storage недоступен или переполнен.' };
  }
}

export function backupBeforeImport(storage: Storage | undefined = globalThis.localStorage): void {
  if (!storage) return;
  try {
    const current = storage.getItem(WORKSPACE_STORAGE_KEY);
    if (current) storage.setItem(MIGRATION_BACKUP_KEY, current);
  } catch {
    // Import remains safe because the current in-memory workspace is not replaced on failure.
  }
}

export function workspaceWithViewport(
  workspace: WorkspaceDocument,
  viewport: ViewportState,
): WorkspaceDocument {
  return { ...workspace, viewport };
}
