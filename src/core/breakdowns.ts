import { literal, multiply, ref, sum } from './ast';
import { formatFormulaAst } from './formula-parser';
import type {
  MetricBreakdownDef,
  MetricBreakdownRowDef,
  MetricBreakdownTemplate,
  MetricDef,
  ModelState,
  WorkspaceDocument,
} from './model';
import {
  MONTH,
  PERSON,
  RUB,
  RUB_PER_PERSON_MONTH,
  unitsEqual,
} from './units';

export interface MetricBreakdownRowInput {
  id: string;
  name: string;
  comment: string;
  amount?: number;
  quantity?: number;
  rate?: number;
}

export interface MetricBreakdownInput {
  template: MetricBreakdownTemplate;
  rows: MetricBreakdownRowInput[];
}

const CASH_FLOW_MODEL_ID = 'tokberi-cash-flow';
const PAYROLL_METRIC_ID = 'payroll_cost';
const STARTER_PAYROLL_TOTAL = 200_000;

function normalizedAliasPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return normalized || 'item';
}

function uniqueAlias(preferred: string, metrics: Record<string, MetricDef>, exceptId?: string): string {
  const used = new Set(
    Object.values(metrics)
      .filter((metric) => metric.id !== exceptId)
      .map((metric) => metric.alias),
  );
  const base = /^[a-z]/.test(preferred) ? preferred : `metric_${preferred}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function breakdownRowTotal(
  row: MetricBreakdownRowInput,
  template: MetricBreakdownTemplate,
): number {
  return template === 'amount_list'
    ? finiteOr(row.amount, 0)
    : finiteOr(row.quantity, 0) * finiteOr(row.rate, 0);
}

export function convertMetricBreakdownTemplate(
  input: MetricBreakdownInput,
  template: MetricBreakdownTemplate,
): MetricBreakdownInput {
  if (input.template === template) return input;

  return {
    template,
    rows: input.rows.map((row) => {
      if (template === 'amount_list') {
        return {
          ...row,
          amount: breakdownRowTotal(row, input.template),
        };
      }

      const amount = Math.max(0, finiteOr(row.amount, 0));
      const preservedQuantity = Math.max(0, finiteOr(row.quantity, 1));
      if (preservedQuantity > 0) {
        return {
          ...row,
          quantity: preservedQuantity,
          rate: amount / preservedQuantity,
        };
      }
      if (amount === 0) {
        return {
          ...row,
          quantity: 0,
          rate: Math.max(0, finiteOr(row.rate, 0)),
        };
      }
      return {
        ...row,
        quantity: 1,
        rate: amount,
      };
    }),
  };
}

function childMetric(
  parent: MetricDef,
  options: {
    id: string;
    definitionSuffix: string;
    name: string;
    alias: string;
    value: number;
    behavior: MetricDef['behavior'];
    unit: MetricDef['unit'];
    position: MetricDef['position'];
    integer?: boolean;
  },
): MetricDef {
  const magnitude = Math.max(Math.abs(options.value), 1);
  return {
    id: options.id,
    definitionId: `breakdown.${parent.id}.${options.definitionSuffix}`,
    name: options.name,
    alias: options.alias,
    description: `Позиция в составе метрики «${parent.name}».`,
    behavior: options.behavior,
    unit: options.unit,
    grain: parent.grain,
    valueSource: 'input',
    knowledgeStatus: 'assumption',
    kind: 'assumption',
    domain: parent.domain,
    domainIds: [...parent.domainIds],
    role: 'input',
    value: options.value,
    provenance: {
      source: `Состав метрики «${parent.name}»`,
      version: 'breakdown-v1',
      confidence: 'medium',
    },
    validationStatus: 'valid',
    validationMessages: [],
    position: options.position,
    inputConfig: {
      min: 0,
      max: Math.max(options.integer ? 100 : 1_000_000, magnitude * 10),
      step: options.integer ? 1 : Math.max(1, Math.round(magnitude / 100)),
      integer: options.integer,
    },
  };
}

function syncDomains(
  metrics: Record<string, MetricDef>,
  domains: ModelState['domains'],
): ModelState['domains'] {
  return Object.fromEntries(
    Object.entries(domains).map(([id, domain]) => [
      id,
      {
        ...domain,
        metricIds: Object.values(metrics)
          .filter((metric) => metric.domainIds.includes(id))
          .map((metric) => metric.id),
      },
    ]),
  );
}

export function breakdownChildMetricIds(breakdown: MetricBreakdownDef): string[] {
  return breakdown.rows.flatMap((row) => [
    row.amountMetricId,
    row.quantityMetricId,
    row.rateMetricId,
  ].filter((metricId): metricId is string => Boolean(metricId)));
}

export function allBreakdownChildMetricIds(model: ModelState): Set<string> {
  return new Set(
    Object.values(model.breakdowns ?? {}).flatMap(breakdownChildMetricIds),
  );
}

export function canHaveMetricBreakdown(metric: MetricDef | undefined): boolean {
  return Boolean(
    metric
    && metric.behavior === 'flow'
    && unitsEqual(metric.unit, RUB)
    && (!metric.formula || metric.provenance.version === 'breakdown-v1'),
  );
}

function removeOwnedMetrics(model: ModelState, metricIds: Set<string>): ModelState {
  if (metricIds.size === 0) return model;
  const metrics = Object.fromEntries(
    Object.entries(model.metrics).filter(([id]) => !metricIds.has(id)),
  );
  const scenarios = Object.fromEntries(
    Object.entries(model.scenarios).map(([id, scenario]) => [
      id,
      {
        ...scenario,
        overrides: Object.fromEntries(
          Object.entries(scenario.overrides).filter(([metricId]) => !metricIds.has(metricId)),
        ),
      },
    ]),
  );
  const visualGroups = Object.fromEntries(
    Object.entries(model.visualGroups)
      .map(([id, group]) => [
        id,
        { ...group, metricIds: group.metricIds.filter((metricId) => !metricIds.has(metricId)) },
      ])
      .filter(([, group]) => (group as ModelState['visualGroups'][string]).metricIds.length > 0),
  );
  return {
    ...model,
    metrics,
    domains: syncDomains(metrics, model.domains),
    scenarios,
    visualGroups,
    influenceRelations: model.influenceRelations.filter(
      (relation) => !metricIds.has(relation.from) && !metricIds.has(relation.to),
    ),
  };
}

export function upsertMetricBreakdown(
  sourceModel: ModelState,
  resultMetricId: string,
  input: MetricBreakdownInput,
): ModelState {
  const parent = sourceModel.metrics[resultMetricId];
  if (!parent) throw new Error('Результирующая метрика не найдена.');
  if (parent.behavior !== 'flow' || !unitsEqual(parent.unit, RUB)) {
    throw new Error('Первая версия состава поддерживает денежные Flow-метрики в рублях.');
  }
  if (parent.formula && !sourceModel.breakdowns?.[resultMetricId]) {
    throw new Error('Сначала выберите конечную денежную категорию без собственной формулы.');
  }
  if (input.rows.length === 0) throw new Error('Добавьте хотя бы одну позицию.');

  const oldBreakdown = sourceModel.breakdowns?.[resultMetricId];
  const oldRows = new Map(oldBreakdown?.rows.map((row) => [row.id, row]) ?? []);
  const oldMetricIds = new Set(oldBreakdown ? breakdownChildMetricIds(oldBreakdown) : []);
  let model = removeOwnedMetrics(sourceModel, oldMetricIds);
  const metrics = { ...model.metrics };
  const rows: MetricBreakdownRowDef[] = [];
  const terms = [];
  const childCount = input.template === 'amount_list' ? input.rows.length : input.rows.length * 2;
  const spacing = 304;
  const startX = parent.position.x + 136 - ((childCount - 1) * spacing) / 2;
  let childIndex = 0;

  for (const rowInput of input.rows) {
    const previous = oldRows.get(rowInput.id);
    const normalizedName = normalizedAliasPart(rowInput.name);
    const aliasBase = `${parent.alias}_${normalizedName === 'item' ? normalizedAliasPart(rowInput.id) : normalizedName}`;
    const row: MetricBreakdownRowDef = {
      id: rowInput.id,
      name: rowInput.name.trim(),
      comment: rowInput.comment.trim(),
    };

    if (input.template === 'amount_list') {
      const id = previous?.amountMetricId ?? `breakdown-${resultMetricId}-${rowInput.id}-amount`;
      const existing = sourceModel.metrics[id];
      const alias = existing?.alias ?? uniqueAlias(`${aliasBase}_amount`, metrics, id);
      metrics[id] = childMetric(parent, {
        id,
        definitionSuffix: `${rowInput.id}.amount`,
        name: row.name,
        alias,
        value: Math.max(0, finiteOr(rowInput.amount, 0)),
        behavior: 'flow',
        unit: RUB,
        position: existing?.position ?? {
          x: startX + childIndex * spacing - 136,
          y: parent.position.y + 260,
        },
      });
      childIndex += 1;
      row.amountMetricId = id;
      terms.push(ref(id));
    } else {
      const quantityId = previous?.quantityMetricId
        ?? `breakdown-${resultMetricId}-${rowInput.id}-quantity`;
      const rateId = previous?.rateMetricId
        ?? `breakdown-${resultMetricId}-${rowInput.id}-rate`;
      const existingQuantity = sourceModel.metrics[quantityId];
      const existingRate = sourceModel.metrics[rateId];
      metrics[quantityId] = childMetric(parent, {
        id: quantityId,
        definitionSuffix: `${rowInput.id}.quantity`,
        name: `${row.name}: количество`,
        alias: existingQuantity?.alias
          ?? uniqueAlias(`${aliasBase}_quantity`, metrics, quantityId),
        value: Math.max(0, finiteOr(rowInput.quantity, 1)),
        behavior: 'stock',
        unit: PERSON,
        position: existingQuantity?.position ?? {
          x: startX + childIndex * spacing - 136,
          y: parent.position.y + 260,
        },
        integer: true,
      });
      childIndex += 1;
      metrics[rateId] = childMetric(parent, {
        id: rateId,
        definitionSuffix: `${rowInput.id}.rate`,
        name: `${row.name}: ставка`,
        alias: existingRate?.alias
          ?? uniqueAlias(`${aliasBase}_monthly_rate`, metrics, rateId),
        value: Math.max(0, finiteOr(rowInput.rate, 0)),
        behavior: 'rate',
        unit: RUB_PER_PERSON_MONTH,
        position: existingRate?.position ?? {
          x: startX + childIndex * spacing - 112,
          y: parent.position.y + 284,
        },
      });
      childIndex += 1;
      row.quantityMetricId = quantityId;
      row.rateMetricId = rateId;
      terms.push(multiply(multiply(ref(rateId), literal(1, MONTH)), ref(quantityId)));
    }
    rows.push(row);
  }

  const ast = sum(terms);
  metrics[resultMetricId] = {
    ...parent,
    value: null,
    valueSource: 'derived',
    knowledgeStatus: 'derived',
    kind: 'derived',
    role: parent.role === 'input' ? 'intermediate' : parent.role,
    formula: {
      source: '',
      ast,
    },
    inputConfig: undefined,
    provenance: {
      source: 'EconomicSimulator Metric Breakdown',
      version: 'breakdown-v1',
      confidence: 'high',
      comment: 'Формула управляется таблицей состава метрики.',
    },
  };
  metrics[resultMetricId] = {
    ...metrics[resultMetricId],
    formula: {
      ast,
      source: formatFormulaAst(ast, metrics),
    },
  };

  const breakdown: MetricBreakdownDef = {
    id: oldBreakdown?.id ?? `breakdown-${resultMetricId}`,
    resultMetricId,
    template: input.template,
    rows,
    expanded: oldBreakdown?.expanded ?? false,
  };
  const scenarios = Object.fromEntries(
    Object.entries(model.scenarios).map(([id, scenario]) => {
      const overrides = { ...scenario.overrides };
      delete overrides[resultMetricId];
      return [id, { ...scenario, overrides }];
    }),
  );

  return {
    ...model,
    metrics,
    domains: syncDomains(metrics, model.domains),
    scenarios,
    breakdowns: {
      ...(model.breakdowns ?? {}),
      [resultMetricId]: breakdown,
    },
  };
}

export function toggleMetricBreakdown(model: ModelState, resultMetricId: string): ModelState {
  const breakdown = model.breakdowns?.[resultMetricId];
  if (!breakdown) return model;
  return {
    ...model,
    breakdowns: {
      ...(model.breakdowns ?? {}),
      [resultMetricId]: { ...breakdown, expanded: !breakdown.expanded },
    },
  };
}

export function removeMetricBreakdown(
  sourceModel: ModelState,
  resultMetricId: string,
  resultValue: number,
): ModelState {
  const breakdown = sourceModel.breakdowns?.[resultMetricId];
  const parent = sourceModel.metrics[resultMetricId];
  if (!breakdown || !parent) return sourceModel;
  let model = removeOwnedMetrics(sourceModel, new Set(breakdownChildMetricIds(breakdown)));
  const breakdowns = { ...(model.breakdowns ?? {}) };
  delete breakdowns[resultMetricId];
  const value = Number.isFinite(resultValue) ? resultValue : 0;
  const metrics = {
    ...model.metrics,
    [resultMetricId]: {
      ...model.metrics[resultMetricId],
      value,
      valueSource: 'input' as const,
      knowledgeStatus: 'assumption' as const,
      kind: 'assumption' as const,
      role: 'input' as const,
      formula: undefined,
      inputConfig: {
        min: 0,
        max: Math.max(1_000_000, Math.abs(value) * 10),
        step: Math.max(1, Math.round(Math.max(Math.abs(value), 1) / 100)),
      },
      provenance: {
        source: 'Состав метрики удалён пользователем',
        version: new Date().toISOString().slice(0, 10),
        confidence: 'medium' as const,
      },
    },
  };
  model = { ...model, metrics, breakdowns, domains: syncDomains(metrics, model.domains) };
  return model;
}

export function upgradeCashFlowPayrollBreakdown(
  workspace: WorkspaceDocument,
): { workspace: WorkspaceDocument; changed: boolean } {
  const model = workspace.model;
  const payroll = model.metrics[PAYROLL_METRIC_ID];
  if (
    model.id !== CASH_FLOW_MODEL_ID
    || !payroll
    || model.breakdowns?.[PAYROLL_METRIC_ID]
  ) {
    return { workspace, changed: false };
  }

  const baseOverride = workspace.inputOverridesByScenario.base?.[PAYROLL_METRIC_ID]
    ?? model.scenarios.base?.overrides[PAYROLL_METRIC_ID]
    ?? payroll.value
    ?? 0;
  const total = baseOverride > 0 ? baseOverride : STARTER_PAYROLL_TOTAL;
  const oldScenarioOverrides = Object.fromEntries(
    Object.entries(model.scenarios).map(([id, scenario]) => [id, scenario.overrides[PAYROLL_METRIC_ID]]),
  );
  let upgradedModel = upsertMetricBreakdown(model, PAYROLL_METRIC_ID, {
    template: 'quantity_rate',
    rows: [
      { id: 'frontend', name: 'Frontend-разработчик', comment: '', quantity: 1, rate: total / 2 },
      { id: 'backend', name: 'Backend-разработчик', comment: '', quantity: 1, rate: total / 2 },
    ],
  });
  const breakdown = upgradedModel.breakdowns![PAYROLL_METRIC_ID];
  const rateIds = breakdown.rows.map((row) => row.rateMetricId!).filter(Boolean);
  upgradedModel = {
    ...upgradedModel,
    scenarios: Object.fromEntries(
      Object.entries(upgradedModel.scenarios).map(([id, scenario]) => {
        const oldTotal = oldScenarioOverrides[id];
        if (!Number.isFinite(oldTotal)) return [id, scenario];
        return [
          id,
          {
            ...scenario,
            overrides: {
              ...scenario.overrides,
              ...Object.fromEntries(rateIds.map((metricId) => [metricId, Number(oldTotal) / rateIds.length])),
            },
          },
        ];
      }),
    ),
  };

  const inputOverridesByScenario = Object.fromEntries(
    Object.entries(workspace.inputOverridesByScenario).map(([scenarioId, overrides]) => {
      const oldTotal = overrides[PAYROLL_METRIC_ID];
      const next = { ...overrides };
      delete next[PAYROLL_METRIC_ID];
      if (Number.isFinite(oldTotal)) {
        for (const rateId of rateIds) next[rateId] = Number(oldTotal) / rateIds.length;
      }
      return [scenarioId, next];
    }),
  );

  return {
    changed: true,
    workspace: {
      ...workspace,
      model: upgradedModel,
      inputOverridesByScenario,
    },
  };
}
