import { evaluateModel, getCalculationRelations } from './evaluator';
import type { ImpactResult, ModelState, Shock, ThresholdResult } from './model';

function applyShock(value: number, shock: Shock): number {
  if (shock.kind === 'relative') return value * (1 + shock.amount);
  return value + shock.amount;
}

export function computeImpact(
  inputId: string,
  model: ModelState,
  scenarioId: string,
  inputOverrides: Record<string, number>,
  shock: Shock,
): ImpactResult | null {
  const baseline = evaluateModel(model, scenarioId, inputOverrides);
  const selected = baseline.metrics[inputId];
  if (!selected || selected.kind === 'derived' || selected.value === null) return null;
  if (shock.kind === 'percentage_points' && selected.unit.symbol !== '%') return null;

  const changedValue = applyShock(selected.value, shock);
  const changed = evaluateModel(model, scenarioId, { ...inputOverrides, [inputId]: changedValue });
  const deltas: Record<string, number> = {};
  for (const [id, metric] of Object.entries(baseline.metrics)) {
    const after = changed.metrics[id]?.value;
    if (metric.value === null || after === null || after === undefined) continue;
    deltas[id] = Math.abs(metric.value) < 1e-12
      ? after - metric.value
      : ((after - metric.value) / Math.abs(metric.value)) * 100;
  }

  const northStarId = model.activeNorthStarId;
  return {
    inputId,
    northStarId,
    beforeInput: selected.value,
    afterInput: changedValue,
    beforeNorthStar: baseline.metrics[northStarId]?.value ?? null,
    afterNorthStar: changed.metrics[northStarId]?.value ?? null,
    deltas,
  };
}

export function downstreamEdgeKeys(model: ModelState, sourceId: string): Set<string> {
  const relations = getCalculationRelations(model);
  const adjacency = new Map<string, string[]>();
  for (const relation of relations) {
    const list = adjacency.get(relation.from) ?? [];
    list.push(relation.to);
    adjacency.set(relation.from, list);
  }

  const nodes = new Set([sourceId]);
  const queue = [sourceId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (nodes.has(next)) continue;
      nodes.add(next);
      queue.push(next);
    }
  }

  return new Set(
    relations
      .filter((relation) => nodes.has(relation.from) && nodes.has(relation.to))
      .map((relation) => `${relation.from}-${relation.to}`),
  );
}

export function solveThreshold(
  model: ModelState,
  scenarioId: string,
  inputOverrides: Record<string, number>,
  options: {
    inputId: string;
    targetMetricId: string;
    targetValue: number;
    condition: 'gte' | 'lte';
    min: number;
    max: number;
    tolerance?: number;
  },
): ThresholdResult {
  const satisfies = (inputValue: number): boolean | null => {
    const result = evaluateModel(model, scenarioId, { ...inputOverrides, [options.inputId]: inputValue });
    const target = result.metrics[options.targetMetricId]?.value;
    if (target === null || target === undefined) return null;
    return options.condition === 'gte' ? target >= options.targetValue : target <= options.targetValue;
  };

  const lowSatisfied = satisfies(options.min);
  const highSatisfied = satisfies(options.max);
  if (lowSatisfied === null || highSatisfied === null) {
    return {
      inputId: options.inputId,
      targetMetricId: options.targetMetricId,
      value: null,
      reached: false,
      iterations: 0,
      message: 'Целевая метрика не рассчиталась.',
    };
  }
  if (lowSatisfied) {
    return {
      inputId: options.inputId,
      targetMetricId: options.targetMetricId,
      value: options.min,
      reached: true,
      iterations: 0,
    };
  }
  if (!highSatisfied) {
    return {
      inputId: options.inputId,
      targetMetricId: options.targetMetricId,
      value: null,
      reached: false,
      iterations: 0,
      message: `Цель не достигается в диапазоне до ${options.max}.`,
    };
  }

  let low = options.min;
  let high = options.max;
  const tolerance = options.tolerance ?? 0.0001;
  let iterations = 0;
  while (high - low > tolerance && iterations < 80) {
    const middle = (low + high) / 2;
    const middleSatisfied = satisfies(middle);
    if (middleSatisfied === null) break;
    if (middleSatisfied) high = middle;
    else low = middle;
    iterations += 1;
  }

  return {
    inputId: options.inputId,
    targetMetricId: options.targetMetricId,
    value: high,
    reached: true,
    iterations,
  };
}

export function computeTokBeriThresholds(
  model: ModelState,
  scenarioId: string,
  inputOverrides: Record<string, number>,
): {
  breakEven: ThresholdResult;
  payback12: ThresholdResult;
  payback24: ThresholdResult;
} {
  const common = {
    inputId: 'rentals_per_day',
    min: 0,
    max: 100,
    tolerance: 0.0001,
  };
  return {
    breakEven: solveThreshold(model, scenarioId, inputOverrides, {
      ...common,
      targetMetricId: 'profit_before_tax',
      targetValue: 0,
      condition: 'gte',
    }),
    payback12: solveThreshold(model, scenarioId, inputOverrides, {
      ...common,
      targetMetricId: 'payback_months',
      targetValue: 12,
      condition: 'lte',
    }),
    payback24: solveThreshold(model, scenarioId, inputOverrides, {
      ...common,
      targetMetricId: 'payback_months',
      targetValue: 24,
      condition: 'lte',
    }),
  };
}
