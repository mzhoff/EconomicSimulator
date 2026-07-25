import { extractDependencies, literal, multiply, ref, sum } from './ast';
import { formatFormulaAst } from './formula-parser';
import type {
  MetricBreakdownDef,
  MetricBreakdownRowDef,
  MetricBreakdownTemplate,
  MetricDef,
  FormulaNode,
  ModelState,
  WorkspaceDocument,
} from './model';
import {
  describeUnit,
  MONTH,
  PERSON,
  quantityRateTimeBasis,
  RUB,
  RUB_PER_PERSON_MONTH,
  unitsEqual,
} from './units';

export interface MetricBreakdownRowInput {
  id: string;
  name: string;
  comment: string;
  amount?: number;
  amountSourceMetricId?: string;
  quantity?: number;
  quantitySourceMetricId?: string;
  rate?: number;
  rateSourceMetricId?: string;
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

function additiveMetricReferences(node: FormulaNode): string[] | null {
  if (node.type === 'metric') return [node.metricId];
  if (node.type !== 'binary' || node.operator !== 'add') return null;
  const left = additiveMetricReferences(node.left);
  const right = additiveMetricReferences(node.right);
  return left && right ? [...left, ...right] : null;
}

export function metricBreakdownInputFromFormula(
  metric: MetricDef,
  metrics: Record<string, MetricDef>,
): MetricBreakdownInput | null {
  if (!metric.formula) return null;
  const metricIds = additiveMetricReferences(metric.formula.ast);
  if (!metricIds?.length || metricIds.some((metricId) => !metrics[metricId])) return null;
  return {
    template: 'amount_list',
    rows: metricIds.map((metricId, index) => ({
      id: `formula-${metricId}-${index + 1}`,
      name: metrics[metricId].name,
      comment: '',
      amount: metrics[metricId].value ?? 0,
      amountSourceMetricId: metricId,
    })),
  };
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

export function breakdownSourceMetricIds(breakdown: MetricBreakdownDef): string[] {
  return [...new Set(breakdown.rows.flatMap((row) => [
    row.amountSourceMetricId,
    row.quantitySourceMetricId,
    row.rateSourceMetricId,
  ].filter((metricId): metricId is string => Boolean(metricId))))];
}

function quantityRateTerm(
  resultMetric: MetricDef,
  quantityMetric: MetricDef,
  rateMetric: MetricDef,
): FormulaNode {
  const timeBasis = quantityRateTimeBasis(
    resultMetric.unit,
    quantityMetric.unit,
    rateMetric.unit,
  );
  if (!timeBasis) {
    throw new Error(
      `Единицы «${describeUnit(quantityMetric.unit)}» и «${describeUnit(rateMetric.unit)}» `
      + `не дают единицу результата «${describeUnit(resultMetric.unit)}».`,
    );
  }
  return timeBasis === 'month'
    ? multiply(multiply(ref(rateMetric.id), literal(1, MONTH)), ref(quantityMetric.id))
    : multiply(ref(rateMetric.id), ref(quantityMetric.id));
}

function breakdownFormulaAst(
  breakdown: MetricBreakdownDef,
  resultMetric: MetricDef,
  metrics: Record<string, MetricDef>,
): FormulaNode {
  return sum(breakdown.rows.map((row) => {
    if (breakdown.template === 'amount_list') {
      const amountId = row.amountSourceMetricId ?? row.amountMetricId;
      if (!amountId || !metrics[amountId]) {
        throw new Error(`Позиция «${row.name}» не содержит метрику суммы.`);
      }
      return ref(amountId);
    }

    const quantityId = row.quantitySourceMetricId ?? row.quantityMetricId;
    const rateId = row.rateSourceMetricId ?? row.rateMetricId;
    const quantityMetric = quantityId ? metrics[quantityId] : undefined;
    const rateMetric = rateId ? metrics[rateId] : undefined;
    if (!quantityMetric || !rateMetric) {
      throw new Error(`Позиция «${row.name}» должна содержать количество и ставку.`);
    }
    return quantityRateTerm(resultMetric, quantityMetric, rateMetric);
  }));
}

/**
 * Rebuilds table-owned formulas after a child metric changes its unit. Invalid
 * intermediate pairs are left untouched so the user can edit quantity and
 * rate one after another; as soon as the pair becomes compatible, the formula
 * is synchronized automatically.
 */
export function synchronizeMetricBreakdownFormulas(sourceModel: ModelState): ModelState {
  const metrics = { ...sourceModel.metrics };
  const synchronizedMetricIds: string[] = [];

  for (const breakdown of Object.values(sourceModel.breakdowns ?? {})) {
    const resultMetric = metrics[breakdown.resultMetricId];
    if (!resultMetric) continue;
    try {
      const ast = breakdownFormulaAst(breakdown, resultMetric, metrics);
      metrics[resultMetric.id] = {
        ...resultMetric,
        formula: {
          source: '',
          ast,
        },
      };
      synchronizedMetricIds.push(resultMetric.id);
    } catch {
      // Keep the previous formula while the user is completing a compatible pair.
    }
  }

  for (const metricId of synchronizedMetricIds) {
    const metric = metrics[metricId];
    if (!metric.formula) continue;
    metrics[metricId] = {
      ...metric,
      formula: {
        ...metric.formula,
        source: formatFormulaAst(metric.formula.ast, metrics),
      },
    };
  }

  return synchronizedMetricIds.length > 0 ? { ...sourceModel, metrics } : sourceModel;
}

export function allBreakdownChildMetricIds(model: ModelState): Set<string> {
  return new Set(
    Object.values(model.breakdowns ?? {}).flatMap(breakdownChildMetricIds),
  );
}

function metricsShareDomain(left: MetricDef | undefined, right: MetricDef | undefined): boolean {
  if (!left || !right) return false;
  if (left.domainIds.length === 0 && right.domainIds.length === 0) return true;
  const rightDomainIds = new Set(right.domainIds);
  return left.domainIds.some((domainId) => rightDomainIds.has(domainId));
}

function isExclusiveFormulaDependency(
  model: ModelState,
  parentMetricId: string,
  dependencyId: string,
): boolean {
  let referencedByParent = false;
  for (const metric of Object.values(model.metrics)) {
    if (!metric.formula || !extractDependencies(metric.formula.ast).has(dependencyId)) continue;
    if (metric.id !== parentMetricId) return false;
    referencedByParent = true;
  }
  return referencedByParent;
}

function isExclusiveInputDependency(
  model: ModelState,
  parentMetricId: string,
  dependencyId: string,
): boolean {
  return model.metrics[dependencyId]?.valueSource === 'input'
    && isExclusiveFormulaDependency(model, parentMetricId, dependencyId);
}

/**
 * Structural children belong to the collapsible Canvas tree. Table rows are
 * explicit children. Formula dependencies join the tree when they share the
 * same semantic branch or are an input used only by this parent. This keeps
 * cross-branch aggregates visible while allowing a leaf driver without a
 * domain (for example, a commission rate) to collapse with its formula.
 */
export function structuralChildMetricIds(model: ModelState, parentMetricId: string): string[] {
  const parent = model.metrics[parentMetricId];
  if (!parent) return [];
  const breakdown = model.breakdowns?.[parentMetricId];
  const childIds = new Set<string>(breakdown
    ? [...breakdownChildMetricIds(breakdown), ...breakdownSourceMetricIds(breakdown)]
    : []);

  if (parent.formula) {
    for (const dependencyId of extractDependencies(parent.formula.ast)) {
      if (
        (
          metricsShareDomain(parent, model.metrics[dependencyId])
          && isExclusiveFormulaDependency(model, parentMetricId, dependencyId)
        )
        || isExclusiveInputDependency(model, parentMetricId, dependencyId)
      ) {
        childIds.add(dependencyId);
      }
    }
  }

  childIds.delete(parentMetricId);
  return [...childIds].filter((metricId) => Boolean(model.metrics[metricId]));
}

export function structuralDescendantMetricIds(model: ModelState, parentMetricId: string): Set<string> {
  const descendants = new Set<string>();
  const visit = (metricId: string, path: Set<string>) => {
    if (path.has(metricId)) return;
    const nextPath = new Set(path).add(metricId);
    for (const childId of structuralChildMetricIds(model, metricId)) {
      if (childId === parentMetricId) continue;
      descendants.add(childId);
      visit(childId, nextPath);
    }
  };
  visit(parentMetricId, new Set());
  return descendants;
}

export function collapsedBreakdownMetricIds(
  model: ModelState,
  manuallyHiddenMetricIds: ReadonlySet<string> = new Set(),
): Set<string> {
  const breakdowns = Object.values(model.breakdowns ?? {});
  const conditionallyVisibleMetricIds = new Set<string>();
  for (const breakdown of breakdowns) {
    structuralDescendantMetricIds(model, breakdown.resultMetricId)
      .forEach((metricId) => conditionallyVisibleMetricIds.add(metricId));
  }
  const visibleMetricIds = new Set(
    Object.keys(model.metrics).filter(
      (metricId) => !conditionallyVisibleMetricIds.has(metricId) && !manuallyHiddenMetricIds.has(metricId),
    ),
  );

  const revealTree = (parentMetricId: string, path: Set<string>) => {
    if (path.has(parentMetricId)) return;
    const nextPath = new Set(path).add(parentMetricId);
    for (const childId of structuralChildMetricIds(model, parentMetricId)) {
      if (manuallyHiddenMetricIds.has(childId)) continue;
      visibleMetricIds.add(childId);
      if (model.breakdowns?.[childId] && !model.breakdowns[childId].expanded) continue;
      revealTree(childId, nextPath);
    }
  };

  for (const breakdown of breakdowns) {
    if (breakdown.expanded && visibleMetricIds.has(breakdown.resultMetricId)) {
      revealTree(breakdown.resultMetricId, new Set());
    }
  }

  return new Set(
    [...conditionallyVisibleMetricIds].filter((metricId) => !visibleMetricIds.has(metricId)),
  );
}

export function hideMetricOnCanvas(model: ModelState, metricId: string): ModelState {
  if (!model.metrics[metricId]) return model;
  const hiddenMetricIds = new Set(model.hiddenMetricIds ?? []);
  hiddenMetricIds.add(metricId);
  structuralDescendantMetricIds(model, metricId)
    .forEach((descendantId) => hiddenMetricIds.add(descendantId));
  if (hiddenMetricIds.size === (model.hiddenMetricIds?.length ?? 0)) return model;
  return {
    ...model,
    hiddenMetricIds: [...hiddenMetricIds],
  };
}

export function showAllMetricsOnCanvas(model: ModelState): ModelState {
  if (!model.hiddenMetricIds?.length) return model;
  return { ...model, hiddenMetricIds: [] };
}

export function canHaveMetricBreakdown(metric: MetricDef | undefined): boolean {
  return Boolean(
    metric
    && (
      !metric.formula
      || metric.provenance.version === 'breakdown-v1'
      || additiveMetricReferences(metric.formula.ast)
    ),
  );
}

function removeOwnedMetrics(
  model: ModelState,
  metricIds: Set<string>,
  ownerMetricId: string,
): ModelState {
  if (metricIds.size === 0) return model;
  const externallyReferenced = new Set<string>();
  for (const metric of Object.values(model.metrics)) {
    if (metric.id === ownerMetricId || !metric.formula) continue;
    for (const dependencyId of extractDependencies(metric.formula.ast)) {
      if (metricIds.has(dependencyId)) externallyReferenced.add(dependencyId);
    }
  }
  const removableMetricIds = new Set(
    [...metricIds].filter(
      (metricId) => !externallyReferenced.has(metricId) && !model.breakdowns?.[metricId],
    ),
  );
  if (removableMetricIds.size === 0) return model;
  const metrics = Object.fromEntries(
    Object.entries(model.metrics).filter(([id]) => !removableMetricIds.has(id)),
  );
  const scenarios = Object.fromEntries(
    Object.entries(model.scenarios).map(([id, scenario]) => [
      id,
      {
        ...scenario,
        overrides: Object.fromEntries(
          Object.entries(scenario.overrides).filter(([metricId]) => !removableMetricIds.has(metricId)),
        ),
      },
    ]),
  );
  const visualGroups = Object.fromEntries(
    Object.entries(model.visualGroups)
      .map(([id, group]) => [
        id,
        { ...group, metricIds: group.metricIds.filter((metricId) => !removableMetricIds.has(metricId)) },
      ])
      .filter(([, group]) => (group as ModelState['visualGroups'][string]).metricIds.length > 0),
  );
  return {
    ...model,
    metrics,
    hiddenMetricIds: (model.hiddenMetricIds ?? []).filter((metricId) => !removableMetricIds.has(metricId)),
    domains: syncDomains(metrics, model.domains),
    scenarios,
    visualGroups,
    influenceRelations: model.influenceRelations.filter(
      (relation) => !removableMetricIds.has(relation.from) && !removableMetricIds.has(relation.to),
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
  if (
    input.template === 'quantity_rate'
    && (parent.behavior !== 'flow' || !unitsEqual(parent.unit, RUB))
  ) {
    throw new Error('Шаблон «Количество × ставка» поддерживает денежные Flow-метрики в рублях.');
  }
  if (
    parent.formula
    && !sourceModel.breakdowns?.[resultMetricId]
    && !additiveMetricReferences(parent.formula.ast)
  ) {
    throw new Error('Таблица может заменить только формулу, состоящую из суммы метрик.');
  }
  if (input.rows.length === 0) throw new Error('Добавьте хотя бы одну позицию.');

  const oldBreakdown = sourceModel.breakdowns?.[resultMetricId];
  const oldRows = new Map(oldBreakdown?.rows.map((row) => [row.id, row]) ?? []);
  const oldMetricIds = new Set(oldBreakdown ? breakdownChildMetricIds(oldBreakdown) : []);
  const reusedMetricIds = new Set<string>();
  if (oldBreakdown?.template === input.template) {
    for (const rowInput of input.rows) {
      const previous = oldRows.get(rowInput.id);
      if (!previous) continue;
      if (input.template === 'amount_list' && !rowInput.amountSourceMetricId) {
        if (previous.amountMetricId) reusedMetricIds.add(previous.amountMetricId);
      }
      if (input.template === 'quantity_rate') {
        if (!rowInput.quantitySourceMetricId && previous.quantityMetricId) {
          reusedMetricIds.add(previous.quantityMetricId);
        }
        if (!rowInput.rateSourceMetricId && previous.rateMetricId) {
          reusedMetricIds.add(previous.rateMetricId);
        }
      }
    }
  }
  const obsoleteMetricIds = new Set(
    [...oldMetricIds].filter((metricId) => !reusedMetricIds.has(metricId)),
  );
  let model = removeOwnedMetrics(sourceModel, obsoleteMetricIds, resultMetricId);
  const metrics = { ...model.metrics };
  const rows: MetricBreakdownRowDef[] = [];
  const childCount = input.rows.reduce((count, row) => (
    count + (
      input.template === 'amount_list'
        ? Number(!row.amountSourceMetricId)
        : Number(!row.quantitySourceMetricId) + Number(!row.rateSourceMetricId)
    )
  ), 0);
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
      const sourceId = rowInput.amountSourceMetricId;
      if (sourceId) {
        const source = sourceModel.metrics[sourceId];
        if (!source) throw new Error(`Метрика-источник «${sourceId}» не найдена.`);
        if (sourceId === resultMetricId) throw new Error('Метрика не может ссылаться сама на себя.');
        if (oldMetricIds.has(sourceId)) {
          throw new Error('В качестве источника выберите самостоятельную метрику или метрику из другого состава.');
        }
        if (source.behavior !== parent.behavior || !unitsEqual(source.unit, parent.unit)) {
          throw new Error(`Метрика «${source.name}» несовместима с итогом «${parent.name}».`);
        }
        row.amountSourceMetricId = sourceId;
      } else {
        const id = previous?.amountMetricId ?? `breakdown-${resultMetricId}-${rowInput.id}-amount`;
        const existing = sourceModel.metrics[id];
        const alias = existing?.alias ?? uniqueAlias(`${aliasBase}_amount`, metrics, id);
        metrics[id] = existing && sourceModel.breakdowns?.[id]
          ? {
            ...existing,
            name: row.name,
            description: `Позиция в составе метрики «${parent.name}».`,
            domain: parent.domain,
            domainIds: [...parent.domainIds],
          }
          : childMetric(parent, {
            id,
            definitionSuffix: `${rowInput.id}.amount`,
            name: row.name,
            alias,
            value: Math.max(0, finiteOr(rowInput.amount, 0)),
            behavior: parent.behavior,
            unit: parent.unit,
            position: existing?.position ?? {
              x: startX + childIndex * spacing - 136,
              y: parent.position.y + 260,
            },
            integer: parent.inputConfig?.integer,
          });
        childIndex += 1;
        row.amountMetricId = id;
      }
    } else {
      let quantityId = rowInput.quantitySourceMetricId;
      if (quantityId) {
        const quantity = sourceModel.metrics[quantityId];
        if (!quantity) throw new Error(`Метрика количества «${quantityId}» не найдена.`);
        if (quantityId === resultMetricId) throw new Error('Метрика не может ссылаться сама на себя.');
        if (oldMetricIds.has(quantityId)) {
          throw new Error('В качестве количества выберите самостоятельную метрику или метрику из другого состава.');
        }
        if (quantity.behavior !== 'stock') {
          throw new Error(`Метрика «${quantity.name}» должна быть Stock-метрикой количества.`);
        }
        row.quantitySourceMetricId = quantityId;
      } else {
        quantityId = previous?.quantityMetricId
          ?? `breakdown-${resultMetricId}-${rowInput.id}-quantity`;
        const existingQuantity = sourceModel.metrics[quantityId];
        const quantityName = `${row.name}: количество`;
        metrics[quantityId] = existingQuantity && sourceModel.breakdowns?.[quantityId]
          ? {
            ...existingQuantity,
            name: quantityName,
            description: `Позиция в составе метрики «${parent.name}».`,
            domain: parent.domain,
            domainIds: [...parent.domainIds],
          }
          : childMetric(parent, {
            id: quantityId,
            definitionSuffix: `${rowInput.id}.quantity`,
            name: quantityName,
            alias: existingQuantity?.alias
              ?? uniqueAlias(`${aliasBase}_quantity`, metrics, quantityId),
            value: Math.max(0, finiteOr(rowInput.quantity, 1)),
            behavior: 'stock',
            unit: existingQuantity?.unit ?? PERSON,
            position: existingQuantity?.position ?? {
              x: startX + childIndex * spacing - 136,
              y: parent.position.y + 260,
            },
            integer: true,
          });
        childIndex += 1;
        row.quantityMetricId = quantityId;
      }

      let rateId = rowInput.rateSourceMetricId;
      if (rateId) {
        const rate = sourceModel.metrics[rateId];
        if (!rate) throw new Error(`Метрика ставки «${rateId}» не найдена.`);
        if (rateId === resultMetricId) throw new Error('Метрика не может ссылаться сама на себя.');
        if (oldMetricIds.has(rateId)) {
          throw new Error('В качестве ставки выберите самостоятельную метрику или метрику из другого состава.');
        }
        if (rate.behavior !== 'rate') {
          throw new Error(`Метрика «${rate.name}» должна быть Rate-метрикой.`);
        }
        row.rateSourceMetricId = rateId;
      } else {
        rateId = previous?.rateMetricId
          ?? `breakdown-${resultMetricId}-${rowInput.id}-rate`;
        const existingRate = sourceModel.metrics[rateId];
        const rateName = `${row.name}: ставка`;
        metrics[rateId] = existingRate && sourceModel.breakdowns?.[rateId]
          ? {
            ...existingRate,
            name: rateName,
            description: `Позиция в составе метрики «${parent.name}».`,
            domain: parent.domain,
            domainIds: [...parent.domainIds],
          }
          : childMetric(parent, {
            id: rateId,
            definitionSuffix: `${rowInput.id}.rate`,
            name: rateName,
            alias: existingRate?.alias
              ?? uniqueAlias(`${aliasBase}_monthly_rate`, metrics, rateId),
            value: Math.max(0, finiteOr(rowInput.rate, 0)),
            behavior: 'rate',
            unit: existingRate?.unit ?? RUB_PER_PERSON_MONTH,
            position: existingRate?.position ?? {
              x: startX + childIndex * spacing - 112,
              y: parent.position.y + 284,
            },
          });
        childIndex += 1;
        row.rateMetricId = rateId;
      }
    }
    rows.push(row);
  }

  const breakdown: MetricBreakdownDef = {
    id: oldBreakdown?.id ?? `breakdown-${resultMetricId}`,
    resultMetricId,
    template: input.template,
    rows,
    expanded: oldBreakdown?.expanded ?? false,
  };
  const ast = breakdownFormulaAst(breakdown, parent, metrics);
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
  const opening = !breakdown.expanded;
  const descendants = opening
    ? structuralDescendantMetricIds(model, resultMetricId)
    : new Set<string>();
  const breakdowns = { ...(model.breakdowns ?? {}) };
  breakdowns[resultMetricId] = { ...breakdown, expanded: opening };
  if (opening) {
    for (const descendantId of descendants) {
      const nestedBreakdown = breakdowns[descendantId];
      if (nestedBreakdown) {
        breakdowns[descendantId] = { ...nestedBreakdown, expanded: true };
      }
    }
  }
  return {
    ...model,
    hiddenMetricIds: opening
      ? (model.hiddenMetricIds ?? []).filter((metricId) => !descendants.has(metricId))
      : model.hiddenMetricIds,
    breakdowns,
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
  let model = removeOwnedMetrics(
    sourceModel,
    new Set(breakdownChildMetricIds(breakdown)),
    resultMetricId,
  );
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
