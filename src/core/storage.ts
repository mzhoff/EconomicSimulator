import { createCashFlowModel } from './cash-flow-template';
import { upgradeCashFlowPayrollBreakdown } from './breakdowns';
import { MODEL_SCHEMA_VERSION } from './model';
import type { ModelState, ViewportState, WorkspaceDocument } from './model';
import {
  isLegacyWorkspaceDocument,
  migrateLegacyWorkspaceDocument,
  upgradeOneOffBehaviors,
  upgradeUniversalUnits,
} from './migration';
import { parseWorkspaceJson, validateWorkspaceDocument } from './schema';

export const WORKSPACE_STORAGE_KEY = 'economic-simulator:workspace:v3';
export const LAST_VALID_STORAGE_KEY = 'economic-simulator:last-valid:v3';
export const MIGRATION_BACKUP_KEY = 'economic-simulator:migration-backup:v2';
export const BEHAVIOR_UPGRADE_BACKUP_KEY = 'economic-simulator:behavior-upgrade-backup:one-off';
export const CASH_FLOW_RESET_BACKUP_KEY = 'economic-simulator:cash-flow-reset-backup:v2';
export const BREAKDOWN_UPGRADE_BACKUP_KEY = 'economic-simulator:breakdown-upgrade-backup:v1';
export const UNIT_UPGRADE_BACKUP_KEY = 'economic-simulator:unit-upgrade-backup:universal-v1';
export const LEGACY_WORKSPACE_STORAGE_KEY = 'economic-simulator:workspace:v1';
export const PREVIOUS_WORKSPACE_STORAGE_KEY = 'economic-simulator:workspace:v2';
const PREVIOUS_WORKSPACE_STORAGE_KEYS = [
  PREVIOUS_WORKSPACE_STORAGE_KEY,
  'economic-simulator:last-valid:v2',
];
const LEGACY_STORAGE_KEYS = [
  LEGACY_WORKSPACE_STORAGE_KEY,
  'economic-simulator:last-valid:v1',
  'economic-simulator:workspace',
  'economic-simulator:model:v0',
];

export interface StorageResult<T> {
  value: T;
  warning?: string;
}

export function createWorkspaceDocument(
  model: ModelState = createCashFlowModel(),
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

function resetPreviousWorkspace(storage: Storage): StorageResult<WorkspaceDocument> | null {
  const previous = PREVIOUS_WORKSPACE_STORAGE_KEYS
    .map((key) => storage.getItem(key))
    .find((value): value is string => Boolean(value));
  if (!previous) return null;

  const workspace = createWorkspaceDocument();
  const serialized = serializeWorkspace(workspace);
  storage.setItem(CASH_FLOW_RESET_BACKUP_KEY, previous);
  storage.setItem(WORKSPACE_STORAGE_KEY, serialized);
  storage.setItem(LAST_VALID_STORAGE_KEY, serialized);
  return {
    value: workspace,
    warning: 'Старая схема сохранена в backup и заменена минимальной моделью денежного потока.',
  };
}

export function serializeWorkspace(workspace: WorkspaceDocument): string {
  return JSON.stringify({ ...workspace, savedAt: new Date().toISOString() }, null, 2);
}

export function importWorkspace(text: string): ReturnType<typeof parseWorkspaceJson> {
  const current = parseWorkspaceJson(text);
  if (current.ok) {
    const oneOff = upgradeOneOffBehaviors(current.workspace);
    const breakdown = upgradeCashFlowPayrollBreakdown(oneOff.workspace);
    const units = upgradeUniversalUnits(breakdown.workspace);
    return validateWorkspaceDocument(units.workspace);
  }
  try {
    const raw = JSON.parse(text) as unknown;
    if (!isLegacyWorkspaceDocument(raw)) return current;
    const migrated = migrateLegacyWorkspaceDocument(raw);
    return validateWorkspaceDocument(upgradeUniversalUnits(migrated).workspace);
  } catch {
    return current;
  }
}

function upgradeStoredWorkspace(
  workspace: WorkspaceDocument,
  serialized: string,
  storage: Storage,
): StorageResult<WorkspaceDocument> {
  const oneOff = upgradeOneOffBehaviors(workspace);
  const breakdown = upgradeCashFlowPayrollBreakdown(oneOff.workspace);
  const units = upgradeUniversalUnits(breakdown.workspace);
  if (!oneOff.changed && !breakdown.changed && !units.changed) return { value: workspace };

  const checked = validateWorkspaceDocument(units.workspace);
  if (!checked.ok) {
    return {
      value: workspace,
      warning: `Обновление модели не применено: ${checked.issues[0]?.message ?? 'ошибка схемы'}`,
    };
  }

  if (oneOff.changed) storage.setItem(BEHAVIOR_UPGRADE_BACKUP_KEY, serialized);
  if (breakdown.changed) storage.setItem(BREAKDOWN_UPGRADE_BACKUP_KEY, serialized);
  if (units.changed) storage.setItem(UNIT_UPGRADE_BACKUP_KEY, serialized);
  const upgradedSerialized = serializeWorkspace(checked.workspace);
  storage.setItem(WORKSPACE_STORAGE_KEY, upgradedSerialized);
  storage.setItem(LAST_VALID_STORAGE_KEY, upgradedSerialized);
  return {
    value: checked.workspace,
    warning: [
      oneOff.changed ? 'Доставка и монтаж обновлены до One-off.' : null,
      breakdown.changed ? 'Фонд оплаты труда переведён в табличный состав.' : null,
      units.changed ? 'Единицы измерения переведены на универсальные.' : null,
      'Предыдущий JSON сохранён в backup.',
    ].filter(Boolean).join(' '),
  };
}

function migrateLegacyStorage(storage: Storage): StorageResult<WorkspaceDocument> | null {
  for (const key of LEGACY_STORAGE_KEYS) {
    const serialized = storage.getItem(key);
    if (!serialized) continue;
    try {
      const raw = JSON.parse(serialized) as unknown;
      if (!isLegacyWorkspaceDocument(raw)) continue;
      storage.setItem(MIGRATION_BACKUP_KEY, serialized);
      const migrated = migrateLegacyWorkspaceDocument(raw);
      const units = upgradeUniversalUnits(migrated);
      const checked = validateWorkspaceDocument(units.workspace);
      if (!checked.ok) {
        return {
          value: createWorkspaceDocument(),
          warning: `Старая модель сохранена в backup, но не мигрирована: ${checked.issues[0]?.message ?? 'ошибка схемы'}`,
        };
      }
      const migratedSerialized = serializeWorkspace(checked.workspace);
      storage.setItem(WORKSPACE_STORAGE_KEY, migratedSerialized);
      storage.setItem(LAST_VALID_STORAGE_KEY, migratedSerialized);
      return {
        value: checked.workspace,
        warning: 'Локальная модель безопасно обновлена до schema v2; исходный JSON сохранён в backup.',
      };
    } catch {
      storage.setItem(MIGRATION_BACKUP_KEY, serialized);
      return {
        value: createWorkspaceDocument(),
        warning: 'Старая модель сохранена в backup, но её не удалось прочитать.',
      };
    }
  }
  return null;
}

export function loadWorkspace(storage: Storage | undefined = globalThis.localStorage): StorageResult<WorkspaceDocument> {
  const fallback = createWorkspaceDocument();
  if (!storage) return { value: fallback, warning: 'Local Storage недоступен; модель работает только в памяти.' };
  try {
    const current = storage.getItem(WORKSPACE_STORAGE_KEY);
    if (current) {
      const parsed = parseWorkspaceJson(current);
      if (parsed.ok) return upgradeStoredWorkspace(parsed.workspace, current, storage);
    }

    const lastValid = storage.getItem(LAST_VALID_STORAGE_KEY);
    if (lastValid) {
      const parsed = parseWorkspaceJson(lastValid);
      if (parsed.ok) {
        const upgraded = upgradeStoredWorkspace(parsed.workspace, lastValid, storage);
        return {
          value: upgraded.value,
          warning: upgraded.warning
            ? `Основной autosave повреждён; восстановлена последняя валидная версия. ${upgraded.warning}`
            : 'Основной autosave повреждён; восстановлена последняя валидная версия.',
        };
      }
    }

    const reset = resetPreviousWorkspace(storage);
    if (reset) return reset;

    const migrated = migrateLegacyStorage(storage);
    if (migrated) return migrated;
    return current
      ? { value: fallback, warning: 'Сохранённая модель не прошла проверку. Открыт безопасный шаблон денежного потока.' }
      : { value: fallback };
  } catch {
    return { value: fallback, warning: 'Не удалось прочитать Local Storage; открыт безопасный шаблон денежного потока.' };
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
