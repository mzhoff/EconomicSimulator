import { evaluateModel, getCalculationRelations } from './evaluator';
import type { ImpactResult, ModelState, Shock, ThresholdResult } from './model';

export type GraphFocusMode = 'structure' | 'focus' | 'multi' | 'analysis';

export interface GraphFocusState {
  mode: GraphFocusMode;
  selectedNodeIds: Set<string>;
  backboneEdges: Set<string>;
  upstreamEdges: Set<string>;
  downstreamEdges: Set<string>;
  connectingEdges: Set<string>;
  directEdges: Set<string>;
  analysisEdges: Set<string>;
  relevantEdges: Set<string>;
  hasCalculationPath: boolean;
}

const relationKey = (from: string, to: string): string => `${from}-${to}`;

function addToIndex(index: Map<string, string[]>, from: string, to: string): void {
  const neighbours = index.get(from) ?? [];
  neighbours.push(to);
  index.set(from, neighbours);
}

function reachableNodes(startId: string, adjacency: Map<string, string[]>): Set<string> {
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

function traversedEdgeKeys(startId: string, adjacency: Map<string, string[]>): Set<string> {
  const edges = new Set<string>();
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      edges.add(relationKey(current, next));
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return edges;
}

export function computeGraphFocus(
  model: ModelState,
  selectedIds: string[],
  analysisSourceId?: string,
): GraphFocusState {
  const calculationRelations = getCalculationRelations(model);
  const adjacency = new Map<string, string[]>();
  const reverseAdjacency = new Map<string, string[]>();
  for (const relation of calculationRelations) {
    addToIndex(adjacency, relation.from, relation.to);
    addToIndex(reverseAdjacency, relation.to, relation.from);
  }

  const backboneEdges = new Set<string>();
  const northStarAncestors = reachableNodes(model.activeNorthStarId, reverseAdjacency);
  for (const relation of calculationRelations) {
    if (northStarAncestors.has(relation.from) && northStarAncestors.has(relation.to)) {
      backboneEdges.add(relationKey(relation.from, relation.to));
    }
  }

  const selectedNodeIds = new Set(selectedIds);
  const upstreamEdges = new Set<string>();
  const downstreamEdges = new Set<string>();
  const connectingEdges = new Set<string>();
  const directEdges = new Set<string>();
  const analysisEdges = analysisSourceId ? traversedEdgeKeys(analysisSourceId, adjacency) : new Set<string>();

  if (selectedIds.length === 1) {
    const selectedId = selectedIds[0];
    const upstreamNodes = reachableNodes(selectedId, reverseAdjacency);
    const downstreamNodes = reachableNodes(selectedId, adjacency);
    for (const relation of calculationRelations) {
      if (upstreamNodes.has(relation.from) && upstreamNodes.has(relation.to)) {
        upstreamEdges.add(relationKey(relation.from, relation.to));
      }
      if (downstreamNodes.has(relation.from) && downstreamNodes.has(relation.to)) {
        downstreamEdges.add(relationKey(relation.from, relation.to));
      }
    }
    for (const relation of [...calculationRelations, ...model.influenceRelations]) {
      if (relation.from === selectedId || relation.to === selectedId) {
        directEdges.add(relationKey(relation.from, relation.to));
      }
    }
  }

  if (selectedIds.length > 1) {
    for (const sourceId of selectedIds) {
      const forward = reachableNodes(sourceId, adjacency);
      for (const targetId of selectedIds) {
        if (sourceId === targetId || !forward.has(targetId)) continue;
        const targetAncestors = reachableNodes(targetId, reverseAdjacency);
        for (const relation of calculationRelations) {
          if (forward.has(relation.from) && targetAncestors.has(relation.to)) {
            connectingEdges.add(relationKey(relation.from, relation.to));
          }
        }
      }
    }
    for (const relation of [...calculationRelations, ...model.influenceRelations]) {
      if (selectedNodeIds.has(relation.from) && selectedNodeIds.has(relation.to)) {
        directEdges.add(relationKey(relation.from, relation.to));
      }
    }
  }

  const mode: GraphFocusMode = analysisSourceId
    ? 'analysis'
    : selectedIds.length === 0
      ? 'structure'
      : selectedIds.length === 1
        ? 'focus'
        : 'multi';
  const relevantEdges = new Set<string>();
  const activeSets = mode === 'analysis'
    ? [analysisEdges]
    : mode === 'focus'
      ? [upstreamEdges, downstreamEdges, directEdges]
      : mode === 'multi'
        ? [connectingEdges, directEdges]
        : [backboneEdges];
  for (const set of activeSets) {
    for (const key of set) relevantEdges.add(key);
  }

  return {
    mode,
    selectedNodeIds,
    backboneEdges,
    upstreamEdges,
    downstreamEdges,
    connectingEdges,
    directEdges,
    analysisEdges,
    relevantEdges,
    hasCalculationPath: selectedIds.length < 2 || connectingEdges.size > 0,
  };
}

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
