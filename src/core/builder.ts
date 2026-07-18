import { MODEL_SCHEMA_VERSION } from './model';
import type { ModelState } from './model';

function createId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createBlankModel(name = 'Новая модель'): ModelState {
  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    id: createId('model'),
    name,
    description: 'Пустая модель для ручной сборки.',
    activeNorthStarId: null,
    metrics: {},
    domains: {},
    visualGroups: {},
    scenarios: {
      base: {
        id: 'base',
        label: 'Base',
        description: 'Базовый сценарий',
        overrides: {},
      },
    },
    influenceRelations: [],
  };
}
