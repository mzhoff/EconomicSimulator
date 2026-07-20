import { describe, expect, it } from 'vitest';
import {
  CASH_FLOW_MODEL_ID,
  createCashFlowModel,
  LEGACY_TOKBERI_MODEL_ID,
} from '../core/cash-flow-template';
import { createWorkspaceDocument } from '../core/storage';
import { removeMetricBreakdown } from '../core/breakdowns';
import { createTokBeriModel } from '../core/tokberi-template';
import {
  MODEL_LIBRARY_CASH_FLOW_BACKUP_KEY,
  MODEL_LIBRARY_STORAGE_KEY,
  MODEL_LIBRARY_BEHAVIOR_BACKUP_KEY,
  MODEL_LIBRARY_BREAKDOWN_BACKUP_KEY,
  deleteEntry,
  duplicateEntry,
  loadModelLibrary,
  saveModelLibrary,
  switchActive,
  upsertWorkspace,
} from './model-library';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function workspace() {
  return createWorkspaceDocument(createCashFlowModel());
}

describe('model library', () => {
  it('wraps and persists the existing workspace on first load', () => {
    const storage = new MemoryStorage();
    const fallback = workspace();
    const loaded = loadModelLibrary(fallback, storage);

    expect(loaded.warning).toBeUndefined();
    expect(loaded.value.activeModelId).toBe(fallback.model.id);
    expect(loaded.value.entries[fallback.model.id]?.workspace).toEqual(fallback);
    expect(storage.getItem(MODEL_LIBRARY_STORAGE_KEY)).not.toBeNull();
  });

  it('upserts, switches and duplicates independent workspaces', () => {
    const first = workspace();
    let library = loadModelLibrary(first, new MemoryStorage()).value;
    const second = structuredClone(first);
    second.model.id = 'model-second';
    second.model.name = 'Вторая модель';

    library = upsertWorkspace(library, second);
    library = switchActive(library, second.model.id);
    library = duplicateEntry(library, second.model.id, 'model-copy', 'Копия');

    expect(library.activeModelId).toBe('model-copy');
    expect(library.entries['model-copy']?.workspace.model.name).toBe('Копия');
    expect(library.entries['model-copy']?.workspace).not.toBe(second);
    expect(library.entries[first.model.id]?.workspace.model.name).toBe(first.model.name);
  });

  it('prevents deleting the last model and selects another after deleting the active one', () => {
    const first = workspace();
    let library = loadModelLibrary(first, new MemoryStorage()).value;

    expect(() => deleteEntry(library, first.model.id)).toThrow('последнюю модель');

    library = duplicateEntry(library, first.model.id, 'model-copy', 'Копия');
    library = deleteEntry(library, 'model-copy');
    expect(library.activeModelId).toBe(first.model.id);
    expect(library.entries['model-copy']).toBeUndefined();
  });

  it('round-trips a valid library through storage', () => {
    const storage = new MemoryStorage();
    const fallback = workspace();
    const library = duplicateEntry(
      loadModelLibrary(fallback, storage).value,
      fallback.model.id,
      'model-copy',
      'Копия',
    );

    expect(saveModelLibrary(library, storage)).toEqual({ value: true });
    expect(loadModelLibrary(fallback, storage).value).toEqual(
      JSON.parse(JSON.stringify(library)),
    );
  });

  it('upgrades One-off metrics in every saved model and keeps a backup', () => {
    const storage = new MemoryStorage();
    const fallback = workspace();
    const oldWorkspace = createWorkspaceDocument(createTokBeriModel());
    oldWorkspace.model.id = 'legacy-one-off-test';
    oldWorkspace.model.metrics.delivery_cost.behavior = 'stock';
    oldWorkspace.model.metrics.installation_cost.behavior = 'stock';
    const oldLibrary = {
      version: 1,
      activeModelId: oldWorkspace.model.id,
      entries: {
        [oldWorkspace.model.id]: { workspace: oldWorkspace },
      },
    };
    const serialized = JSON.stringify(oldLibrary);
    storage.setItem(MODEL_LIBRARY_STORAGE_KEY, serialized);

    const loaded = loadModelLibrary(fallback, storage);
    const migrated = loaded.value.entries[oldWorkspace.model.id]!.workspace.model.metrics;

    expect(migrated.delivery_cost.behavior).toBe('one_off');
    expect(migrated.installation_cost.behavior).toBe('one_off');
    expect(migrated.total_capex.behavior).toBe('stock');
    expect(storage.getItem(MODEL_LIBRARY_BEHAVIOR_BACKUP_KEY)).toBe(serialized);
    expect(loaded.warning).toContain('One-off');
  });

  it('replaces only the old starter graph and preserves its backup', () => {
    const storage = new MemoryStorage();
    const fallback = workspace();
    const oldWorkspace = createWorkspaceDocument(createTokBeriModel());
    const oldLibrary = {
      version: 1,
      activeModelId: LEGACY_TOKBERI_MODEL_ID,
      entries: {
        [LEGACY_TOKBERI_MODEL_ID]: { workspace: oldWorkspace },
      },
    };
    const serialized = JSON.stringify(oldLibrary);
    storage.setItem(MODEL_LIBRARY_STORAGE_KEY, serialized);

    const loaded = loadModelLibrary(fallback, storage);

    expect(loaded.value.activeModelId).toBe(CASH_FLOW_MODEL_ID);
    expect(loaded.value.entries[CASH_FLOW_MODEL_ID]?.workspace).toEqual(fallback);
    expect(loaded.value.entries[LEGACY_TOKBERI_MODEL_ID]).toBeUndefined();
    expect(storage.getItem(MODEL_LIBRARY_CASH_FLOW_BACKUP_KEY)).toBe(serialized);
    expect(loaded.warning).toContain('денежного потока');
  });

  it('upgrades payroll breakdowns in every saved cash-flow model and keeps a backup', () => {
    const storage = new MemoryStorage();
    const fallback = workspace();
    const oldWorkspace = createWorkspaceDocument(
      removeMetricBreakdown(createCashFlowModel(), 'payroll_cost', 220_000),
      { inputOverridesByScenario: { base: { payroll_cost: 220_000 } } },
    );
    const oldLibrary = {
      version: 1,
      activeModelId: oldWorkspace.model.id,
      entries: {
        [oldWorkspace.model.id]: { workspace: oldWorkspace },
      },
    };
    const serialized = JSON.stringify(oldLibrary);
    storage.setItem(MODEL_LIBRARY_STORAGE_KEY, serialized);

    const loaded = loadModelLibrary(fallback, storage);
    const migrated = loaded.value.entries[oldWorkspace.model.id]!.workspace;

    expect(migrated.model.breakdowns?.payroll_cost.rows).toHaveLength(2);
    expect(migrated.inputOverridesByScenario.base).not.toHaveProperty('payroll_cost');
    expect(storage.getItem(MODEL_LIBRARY_BREAKDOWN_BACKUP_KEY)).toBe(serialized);
    expect(loaded.warning).toContain('табличный состав');
  });
});
