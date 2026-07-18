import { describe, expect, it } from 'vitest';
import { createWorkspaceDocument } from '../core/storage';
import { createTokBeriModel } from '../core/tokberi-template';
import {
  MODEL_LIBRARY_STORAGE_KEY,
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
  return createWorkspaceDocument(createTokBeriModel());
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
    expect(loadModelLibrary(fallback, storage).value).toEqual(library);
  });
});
