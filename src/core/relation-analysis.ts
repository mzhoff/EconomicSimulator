import { extractDependencies } from './ast';
import type {
  CalculationDirection,
  CalculationOperation,
  FormulaNode,
  MetricDef,
  ModelState,
} from './model';

type ValueResolver = (metricId: string) => number | null;

interface DualValue {
  value: number;
  derivative: number;
  dynamic: boolean;
}

function containsDependency(node: FormulaNode, dependencyId: string): boolean {
  return extractDependencies(node).has(dependencyId);
}

function evaluateFormulaValue(node: FormulaNode, resolve: ValueResolver): number | boolean | null {
  if (node.type === 'literal') return node.value;
  if (node.type === 'metric') return resolve(node.metricId);
  if (node.type === 'binary') {
    const left = evaluateFormulaValue(node.left, resolve);
    const right = evaluateFormulaValue(node.right, resolve);
    if (typeof left !== 'number' || typeof right !== 'number') return null;
    if (node.operator === 'add') return left + right;
    if (node.operator === 'subtract') return left - right;
    if (node.operator === 'multiply') return left * right;
    return Math.abs(right) < 1e-12 ? null : left / right;
  }
  if (node.type === 'unary') {
    const operand = evaluateFormulaValue(node.operand, resolve);
    if (typeof operand !== 'number') return null;
    if (node.operator === 'negate') return -operand;
    if (node.operator === 'abs') return Math.abs(operand);
    return Math.round(operand);
  }
  if (node.type === 'function') {
    const values = node.args.map((arg) => evaluateFormulaValue(arg, resolve));
    if (values.some((value) => typeof value !== 'number')) return null;
    return node.name === 'min'
      ? Math.min(...(values as number[]))
      : Math.max(...(values as number[]));
  }
  if (node.type === 'comparison') {
    const left = evaluateFormulaValue(node.left, resolve);
    const right = evaluateFormulaValue(node.right, resolve);
    if (typeof left !== 'number' || typeof right !== 'number') return null;
    if (node.operator === 'gt') return left > right;
    if (node.operator === 'gte') return left >= right;
    if (node.operator === 'lt') return left < right;
    if (node.operator === 'lte') return left <= right;
    return Math.abs(left - right) < 1e-12;
  }
  const condition = evaluateFormulaValue(node.condition, resolve);
  if (typeof condition !== 'boolean') return null;
  return evaluateFormulaValue(condition ? node.whenTrue : node.whenFalse, resolve);
}

function evaluateDual(node: FormulaNode, dependencyId: string, resolve: ValueResolver): DualValue | null {
  if (node.type === 'literal') return { value: node.value, derivative: 0, dynamic: false };
  if (node.type === 'metric') {
    const value = resolve(node.metricId);
    return value === null
      ? null
      : { value, derivative: node.metricId === dependencyId ? 1 : 0, dynamic: false };
  }
  if (node.type === 'unary') {
    if (node.operator !== 'negate') {
      const value = evaluateFormulaValue(node, resolve);
      return typeof value !== 'number'
        ? null
        : { value, derivative: 0, dynamic: containsDependency(node, dependencyId) };
    }
    const operand = evaluateDual(node.operand, dependencyId, resolve);
    return operand
      ? { value: -operand.value, derivative: -operand.derivative, dynamic: operand.dynamic }
      : null;
  }
  if (node.type !== 'binary') {
    const value = evaluateFormulaValue(node, resolve);
    return typeof value !== 'number'
      ? null
      : { value, derivative: 0, dynamic: containsDependency(node, dependencyId) };
  }

  const left = evaluateDual(node.left, dependencyId, resolve);
  const right = evaluateDual(node.right, dependencyId, resolve);
  if (!left || !right) return null;
  const dynamic = left.dynamic || right.dynamic;
  if (node.operator === 'add') {
    return {
      value: left.value + right.value,
      derivative: left.derivative + right.derivative,
      dynamic,
    };
  }
  if (node.operator === 'subtract') {
    return {
      value: left.value - right.value,
      derivative: left.derivative - right.derivative,
      dynamic,
    };
  }
  if (node.operator === 'multiply') {
    return {
      value: left.value * right.value,
      derivative: left.derivative * right.value + left.value * right.derivative,
      dynamic,
    };
  }
  if (Math.abs(right.value) < 1e-12) return null;
  return {
    value: left.value / right.value,
    derivative: (
      left.derivative * right.value - left.value * right.derivative
    ) / (right.value * right.value),
    dynamic,
  };
}

function collectOperations(
  node: FormulaNode,
  dependencyId: string,
  context: {
    additiveSeen: boolean;
    additiveSign: 1 | -1;
    multiplicative: Set<'multiply' | 'divide'>;
  } = { additiveSeen: false, additiveSign: 1, multiplicative: new Set() },
  advanced = false,
  found: CalculationOperation[] = [],
): CalculationOperation[] {
  if (node.type === 'metric') {
    if (node.metricId !== dependencyId) return found;
    if (advanced || context.multiplicative.size > 1) {
      found.push('mixed');
    } else if (context.multiplicative.size === 1) {
      found.push([...context.multiplicative][0]);
    } else if (context.additiveSeen) {
      found.push(context.additiveSign > 0 ? 'add' : 'subtract');
    } else {
      found.push('direct');
    }
    return found;
  }
  if (node.type === 'literal') return found;
  if (node.type === 'binary') {
    if (node.operator === 'add' || node.operator === 'subtract') {
      collectOperations(
        node.left,
        dependencyId,
        { ...context, additiveSeen: true },
        advanced,
        found,
      );
      collectOperations(
        node.right,
        dependencyId,
        {
          ...context,
          additiveSeen: true,
          additiveSign: node.operator === 'subtract'
            ? (context.additiveSign === 1 ? -1 : 1)
            : context.additiveSign,
        },
        advanced,
        found,
      );
      return found;
    }
    const multiplicative = new Set(context.multiplicative);
    multiplicative.add(node.operator);
    collectOperations(node.left, dependencyId, { ...context, multiplicative }, advanced, found);
    collectOperations(node.right, dependencyId, { ...context, multiplicative }, advanced, found);
    return found;
  }
  if (node.type === 'unary') {
    return collectOperations(
      node.operand,
      dependencyId,
      node.operator === 'negate'
        ? {
            ...context,
            additiveSeen: true,
            additiveSign: context.additiveSign === 1 ? -1 : 1,
          }
        : context,
      advanced || node.operator !== 'negate',
      found,
    );
  }
  if (node.type === 'function') {
    node.args.forEach((arg) => collectOperations(arg, dependencyId, context, true, found));
    return found;
  }
  if (node.type === 'comparison') {
    collectOperations(node.left, dependencyId, context, true, found);
    collectOperations(node.right, dependencyId, context, true, found);
    return found;
  }
  collectOperations(node.condition, dependencyId, context, true, found);
  collectOperations(node.whenTrue, dependencyId, context, true, found);
  collectOperations(node.whenFalse, dependencyId, context, true, found);
  return found;
}

export function createMetricValueResolver(
  model: ModelState,
  currentMetrics: Record<string, MetricDef> = model.metrics,
): ValueResolver {
  const values = new Map<string, number | null>();
  const visiting = new Set<string>();
  const baseOverrides = model.scenarios.base?.overrides ?? {};

  const resolve: ValueResolver = (metricId) => {
    if (values.has(metricId)) return values.get(metricId) ?? null;
    if (visiting.has(metricId)) return null;
    const metric = currentMetrics[metricId] ?? model.metrics[metricId];
    if (!metric) return null;
    if (baseOverrides[metricId] !== undefined && !metric.formula) {
      return baseOverrides[metricId];
    }
    if (!metric.formula || metric.value !== null) return metric.value;
    visiting.add(metricId);
    const evaluated = evaluateFormulaValue(metric.formula.ast, resolve);
    visiting.delete(metricId);
    const numeric = typeof evaluated === 'number' && Number.isFinite(evaluated) ? evaluated : null;
    values.set(metricId, numeric);
    return numeric;
  };

  return resolve;
}

export function analyzeCalculationDependency(
  formula: FormulaNode,
  dependencyId: string,
  resolve: ValueResolver,
): { operation: CalculationOperation; direction: CalculationDirection; sign: number } {
  const operations = collectOperations(formula, dependencyId);
  const distinctOperations = new Set(operations);
  const operation = distinctOperations.size === 1
    ? operations[0]
    : 'mixed';
  const dual = evaluateDual(formula, dependencyId, resolve);
  const direction: CalculationDirection = !dual || dual.dynamic || !Number.isFinite(dual.derivative)
    ? 'dynamic'
    : Math.abs(dual.derivative) < 1e-12
      ? 'neutral'
      : dual.derivative > 0
        ? 'positive'
        : 'negative';
  const sign = direction === 'positive' ? 1 : direction === 'negative' ? -1 : 0;
  return { operation: operation ?? 'mixed', direction, sign };
}

export function analyzeMetricFormulaRelations(
  metric: MetricDef,
  model: ModelState,
  currentMetrics: Record<string, MetricDef> = model.metrics,
): Array<{
  dependencyId: string;
  operation: CalculationOperation;
  direction: CalculationDirection;
  sign: number;
}> {
  if (!metric.formula) return [];
  const resolve = createMetricValueResolver(model, currentMetrics);
  return [...extractDependencies(metric.formula.ast)].map((dependencyId) => ({
    dependencyId,
    ...analyzeCalculationDependency(metric.formula!.ast, dependencyId, resolve),
  }));
}
