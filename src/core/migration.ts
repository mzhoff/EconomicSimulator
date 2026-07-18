import {
  LEGACY_MODEL_SCHEMA_VERSION,
  MODEL_SCHEMA_VERSION,
} from './model';
import type {
  DomainDef,
  MetricBehavior,
  MetricDef,
  MetricDomain,
  ModelState,
  WorkspaceDocument,
} from './model';

const DOMAIN_PRESENTATION: Record<string, Pick<DomainDef, 'name' | 'color' | 'description'>> = {
  demand: { name: 'Спрос', color: '#0ea5e9', description: 'Спрос и использование продукта.' },
  revenue: { name: 'Выручка и тариф', color: '#10b981', description: 'Денежные поступления и параметры тарифа.' },
  variable_costs: { name: 'Переменные расходы', color: '#f97316', description: 'Расходы, зависящие от объёма операций.' },
  fixed_costs: { name: 'Постоянные расходы', color: '#f59e0b', description: 'Регулярные расходы.' },
  capex: { name: 'CAPEX', color: '#8b5cf6', description: 'Первоначальные инвестиции.' },
  operations: { name: 'Операционные ограничения', color: '#6366f1', description: 'Физические и операционные параметры.' },
  results: { name: 'Результаты', color: '#14b8a6', description: 'Ключевые результаты модели.' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeMetricAlias(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const withPrefix = /^[a-z]/.test(normalized) ? normalized : `metric_${normalized}`;
  return withPrefix === 'metric_' ? 'metric' : withPrefix;
}

function uniqueAlias(preferred: string, used: Set<string>): string {
  const base = normalizeMetricAlias(preferred);
  let alias = base;
  let suffix = 2;
  while (used.has(alias)) {
    alias = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(alias);
  return alias;
}

function migrateBehavior(value: unknown): MetricBehavior {
  return value === 'stock' || value === 'rate' ? value : 'flow';
}

function migrateLegacyModel(value: Record<string, unknown>): ModelState {
  if (!isRecord(value.metrics)) throw new Error('В старой модели отсутствует объект metrics.');

  const usedAliases = new Set<string>();
  const metrics: Record<string, MetricDef> = {};
  const domainMemberships = new Map<string, string[]>();

  for (const [metricId, rawMetric] of Object.entries(value.metrics)) {
    if (!isRecord(rawMetric)) throw new Error(`Метрика «${metricId}» имеет неверный формат.`);
    const legacyDomain = typeof rawMetric.domain === 'string' ? rawMetric.domain : 'results';
    const alias = uniqueAlias(
      typeof rawMetric.alias === 'string' ? rawMetric.alias : metricId,
      usedAliases,
    );
    const domainIds = Array.isArray(rawMetric.domainIds)
      ? rawMetric.domainIds.filter((item): item is string => typeof item === 'string')
      : [legacyDomain];
    if (domainIds.length === 0) domainIds.push(legacyDomain);
    for (const domainId of domainIds) {
      const metricIds = domainMemberships.get(domainId) ?? [];
      metricIds.push(metricId);
      domainMemberships.set(domainId, metricIds);
    }

    metrics[metricId] = {
      ...(rawMetric as unknown as MetricDef),
      id: metricId,
      alias,
      behavior: migrateBehavior(rawMetric.behavior),
      domain: legacyDomain as MetricDomain,
      domainIds: [...new Set(domainIds)],
    };
  }

  const domains: Record<string, DomainDef> = {};
  let domainOrder = 0;
  for (const [domainId, metricIds] of domainMemberships) {
    const presentation = DOMAIN_PRESENTATION[domainId] ?? {
      name: domainId,
      color: '#64748b',
      description: '',
    };
    domains[domainId] = {
      id: domainId,
      ...presentation,
      metricIds,
      order: domainOrder,
    };
    domainOrder += 1;
  }

  const activeNorthStarId = typeof value.activeNorthStarId === 'string'
    && metrics[value.activeNorthStarId]
    ? value.activeNorthStarId
    : null;

  return {
    ...(value as unknown as ModelState),
    schemaVersion: MODEL_SCHEMA_VERSION,
    activeNorthStarId,
    metrics,
    domains,
    visualGroups: {},
  };
}

export function isLegacyWorkspaceDocument(value: unknown): boolean {
  return isRecord(value)
    && value.schemaVersion === LEGACY_MODEL_SCHEMA_VERSION
    && isRecord(value.model)
    && value.model.schemaVersion === LEGACY_MODEL_SCHEMA_VERSION;
}

export function migrateLegacyWorkspaceDocument(value: unknown): WorkspaceDocument {
  if (!isLegacyWorkspaceDocument(value) || !isRecord(value) || !isRecord(value.model)) {
    throw new Error('Документ не является workspace schema v1.');
  }
  return {
    ...(value as unknown as WorkspaceDocument),
    schemaVersion: MODEL_SCHEMA_VERSION,
    model: migrateLegacyModel(value.model),
  };
}
