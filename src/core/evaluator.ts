import { analyzeMetricFormulaRelations } from './relation-analysis';
import type {
  CalculationRelation,
  EvaluationResult,
  FormulaNode,
  Grain,
  MetricBehavior,
  MetricDef,
  MetricEvaluationError,
  ModelState,
  UnitSpec,
} from './model';
import {
  DIMENSIONLESS,
  describeUnit,
  divideUnits,
  isDimensionless,
  isDuration,
  multiplyUnits,
  unitsEqual,
} from './units';

interface InferredNode {
  unit: UnitSpec;
  behavior: MetricBehavior;
  grain?: Grain;
  zeroLiteral?: boolean;
  boolean?: boolean;
}

interface EvaluationContext {
  metrics: Record<string, MetricDef>;
}

function grainsEqual(left?: Grain, right?: Grain): boolean {
  if (!left || !right) return true;
  return left.entity === right.entity && left.time === right.time;
}

function unitMismatch(left: UnitSpec, right: UnitSpec): Error {
  return new Error(`Несовместимые единицы: ${describeUnit(left)} и ${describeUnit(right)}.`);
}

function inferProductBehavior(left: InferredNode, right: InferredNode): MetricBehavior {
  if (left.zeroLiteral || right.zeroLiteral) return left.zeroLiteral ? right.behavior : left.behavior;
  if (isDimensionless(left.unit)) return right.behavior;
  if (isDimensionless(right.unit)) return left.behavior;
  if (left.behavior === 'flow' || right.behavior === 'flow') return 'flow';
  if (
    (left.behavior === 'rate' && isDuration(right.unit))
    || (right.behavior === 'rate' && isDuration(left.unit))
  ) {
    return 'flow';
  }
  if (left.behavior === 'stock' || right.behavior === 'stock') return 'stock';
  return 'rate';
}

export function inferFormulaNode(node: FormulaNode, metrics: Record<string, MetricDef>): InferredNode {
  switch (node.type) {
    case 'literal':
      return {
        unit: node.unit ?? DIMENSIONLESS,
        behavior: 'rate',
        zeroLiteral: node.value === 0 && !node.unit,
      };
    case 'metric': {
      const metric = metrics[node.metricId];
      if (!metric) throw new Error(`Формула ссылается на отсутствующую метрику «${node.metricId}».`);
      return { unit: metric.unit, behavior: metric.behavior, grain: metric.grain };
    }
    case 'binary': {
      const left = inferFormulaNode(node.left, metrics);
      const right = inferFormulaNode(node.right, metrics);

      if (node.operator === 'add' || node.operator === 'subtract') {
        if (!left.zeroLiteral && !right.zeroLiteral && !unitsEqual(left.unit, right.unit)) {
          throw unitMismatch(left.unit, right.unit);
        }
        if (!left.zeroLiteral && !right.zeroLiteral && left.behavior !== right.behavior) {
          throw new Error(`Нельзя ${node.operator === 'add' ? 'складывать' : 'вычитать'} ${left.behavior} и ${right.behavior}.`);
        }
        if (!grainsEqual(left.grain, right.grain)) {
          throw new Error('Нельзя складывать значения с разным grain без явной агрегации.');
        }
        const inferred = left.zeroLiteral ? right : left;
        return { unit: inferred.unit, behavior: inferred.behavior, grain: inferred.grain };
      }

      if (node.operator === 'multiply') {
        return {
          unit: multiplyUnits(left.unit, right.unit),
          behavior: inferProductBehavior(left, right),
          grain: left.grain ?? right.grain,
        };
      }

      const dividedUnit = divideUnits(left.unit, right.unit);
      return {
        unit: dividedUnit,
        behavior: (
          isDuration(dividedUnit)
          || (left.behavior === 'flow' && right.behavior === 'flow')
          || (left.behavior === 'stock' && right.behavior === 'stock')
        )
          ? 'rate'
          : left.behavior,
        grain: left.grain ?? right.grain,
      };
    }
    case 'unary': {
      const operand = inferFormulaNode(node.operand, metrics);
      return operand;
    }
    case 'function': {
      if (node.args.length === 0) throw new Error(`${node.name} требует хотя бы один аргумент.`);
      const args = node.args.map((arg) => inferFormulaNode(arg, metrics));
      const reference = args.find((arg) => !arg.zeroLiteral) ?? args[0];
      for (const arg of args) {
        if (!arg.zeroLiteral && !unitsEqual(arg.unit, reference.unit)) throw unitMismatch(arg.unit, reference.unit);
        if (!arg.zeroLiteral && arg.behavior !== reference.behavior) {
          throw new Error(`Аргументы ${node.name} должны иметь одинаковое временное поведение.`);
        }
      }
      return reference;
    }
    case 'comparison': {
      const left = inferFormulaNode(node.left, metrics);
      const right = inferFormulaNode(node.right, metrics);
      if (!left.zeroLiteral && !right.zeroLiteral && !unitsEqual(left.unit, right.unit)) {
        throw unitMismatch(left.unit, right.unit);
      }
      return { unit: DIMENSIONLESS, behavior: 'rate', boolean: true };
    }
    case 'conditional': {
      const condition = inferFormulaNode(node.condition, metrics);
      if (!condition.boolean) throw new Error('Условие if должно быть сравнением.');
      const whenTrue = inferFormulaNode(node.whenTrue, metrics);
      const whenFalse = inferFormulaNode(node.whenFalse, metrics);
      if (!whenTrue.zeroLiteral && !whenFalse.zeroLiteral && !unitsEqual(whenTrue.unit, whenFalse.unit)) {
        throw unitMismatch(whenTrue.unit, whenFalse.unit);
      }
      if (!whenTrue.zeroLiteral && !whenFalse.zeroLiteral && whenTrue.behavior !== whenFalse.behavior) {
        throw new Error('Обе ветки условия должны иметь одинаковое временное поведение.');
      }
      return whenTrue.zeroLiteral ? whenFalse : whenTrue;
    }
  }
}

function evaluateNode(node: FormulaNode, context: EvaluationContext): number | boolean {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'metric': {
      const metric = context.metrics[node.metricId];
      if (!metric) throw new Error(`Не найдена зависимость «${node.metricId}».`);
      if (metric.value === null || !Number.isFinite(metric.value)) {
        throw new Error(`Зависимость «${metric.name}» не рассчитана.`);
      }
      return metric.value;
    }
    case 'binary': {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);
      if (typeof left !== 'number' || typeof right !== 'number') throw new Error('Булево значение попало в арифметику.');
      if (node.operator === 'add') return left + right;
      if (node.operator === 'subtract') return left - right;
      if (node.operator === 'multiply') return left * right;
      if (Math.abs(right) < 1e-12) throw new Error('Деление на ноль.');
      return left / right;
    }
    case 'unary': {
      const operand = evaluateNode(node.operand, context);
      if (typeof operand !== 'number') throw new Error('Булево значение нельзя преобразовать как число.');
      if (node.operator === 'negate') return -operand;
      if (node.operator === 'abs') return Math.abs(operand);
      return Math.round(operand);
    }
    case 'function': {
      const values = node.args.map((arg) => evaluateNode(arg, context));
      if (values.some((value) => typeof value !== 'number')) throw new Error(`${node.name} принимает только числа.`);
      return node.name === 'min'
        ? Math.min(...(values as number[]))
        : Math.max(...(values as number[]));
    }
    case 'comparison': {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);
      if (typeof left !== 'number' || typeof right !== 'number') throw new Error('Сравнивать можно только числа.');
      if (node.operator === 'gt') return left > right;
      if (node.operator === 'gte') return left >= right;
      if (node.operator === 'lt') return left < right;
      if (node.operator === 'lte') return left <= right;
      return Math.abs(left - right) < 1e-12;
    }
    case 'conditional': {
      const condition = evaluateNode(node.condition, context);
      if (typeof condition !== 'boolean') throw new Error('Условие if должно вернуть true или false.');
      return evaluateNode(condition ? node.whenTrue : node.whenFalse, context);
    }
  }
}

export function getCalculationRelations(
  model: ModelState,
  currentMetrics: Record<string, MetricDef> = model.metrics,
): CalculationRelation[] {
  const relations: CalculationRelation[] = [];
  for (const metric of Object.values(model.metrics)) {
    if (!metric.formula) continue;
    for (const metadata of analyzeMetricFormulaRelations(metric, model, currentMetrics)) {
      relations.push({
        from: metadata.dependencyId,
        to: metric.id,
        type: 'calc',
        sign: metadata.sign,
        operation: metadata.operation,
        direction: metadata.direction,
      });
    }
  }
  return relations;
}

export function topologicalOrder(model: ModelState): string[] {
  const metricIds = Object.keys(model.metrics);
  const inDegree = new Map(metricIds.map((id) => [id, 0]));
  const adjacency = new Map(metricIds.map((id) => [id, [] as string[]]));

  for (const relation of getCalculationRelations(model)) {
    if (!inDegree.has(relation.from)) {
      throw new Error(`Метрика «${relation.to}» зависит от отсутствующей метрики «${relation.from}».`);
    }
    adjacency.get(relation.from)!.push(relation.to);
    inDegree.set(relation.to, (inDegree.get(relation.to) ?? 0) + 1);
  }

  const queue = metricIds.filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const degree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  if (order.length !== metricIds.length) {
    const cycleNodes = metricIds.filter((id) => (inDegree.get(id) ?? 0) > 0);
    throw new Error(`В расчётном графе найден цикл: ${cycleNodes.join(' → ')}.`);
  }
  return order;
}

export function validateFormula(metric: MetricDef, metrics: Record<string, MetricDef>): string[] {
  if (!metric.formula) return metric.kind === 'derived' ? ['У derived-метрики отсутствует формула.'] : [];
  try {
    const inferred = inferFormulaNode(metric.formula.ast, metrics);
    if (inferred.boolean) return ['Формула метрики не может возвращать true/false.'];
    if (!unitsEqual(inferred.unit, metric.unit)) {
      return [
        `Формула возвращает ${describeUnit(inferred.unit)}, но метрика объявлена как ${describeUnit(metric.unit)}.`,
      ];
    }
    if (inferred.behavior !== metric.behavior) {
      return [
        `Формула описывает ${inferred.behavior}, но метрика объявлена как ${metric.behavior}.`,
      ];
    }
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : 'Неизвестная ошибка формулы.'];
  }
}

function cloneMetrics(metrics: Record<string, MetricDef>): Record<string, MetricDef> {
  return Object.fromEntries(
    Object.entries(metrics).map(([id, metric]) => [
      id,
      {
        ...metric,
        unit: { ...metric.unit, dimensions: { ...metric.unit.dimensions } },
        grain: { ...metric.grain },
        provenance: { ...metric.provenance },
        position: { ...metric.position },
        validationMessages: [],
      },
    ]),
  );
}

function addGuardrail(
  metrics: Record<string, MetricDef>,
  warnings: MetricEvaluationError[],
  metricId: string,
  message: string,
): void {
  const metric = metrics[metricId];
  if (!metric) return;
  metric.validationStatus = 'warning';
  metric.validationMessages.push(message);
  warnings.push({ metricId, code: 'guardrail', message });
}

function applyTokBeriGuardrails(metrics: Record<string, MetricDef>, warnings: MetricEvaluationError[]): void {
  const batteryCount = metrics.battery_count?.value;
  if (batteryCount !== null && batteryCount !== undefined && !Number.isInteger(batteryCount)) {
    addGuardrail(metrics, warnings, 'battery_count', 'Количество батарей должно быть целым.');
  }

  const totalSlots = metrics.total_slots?.value;
  const minimumFreeSlots = metrics.minimum_free_slots?.value;
  if (
    batteryCount !== null && batteryCount !== undefined
    && totalSlots !== null && totalSlots !== undefined
    && minimumFreeSlots !== null && minimumFreeSlots !== undefined
    && batteryCount > totalSlots - minimumFreeSlots
  ) {
    addGuardrail(
      metrics,
      warnings,
      'battery_count',
      `Нужно оставить минимум ${minimumFreeSlots} свободн. сл.; сейчас занято ${batteryCount} из ${totalSlots}.`,
    );
  }

  const rentalsPerDay = metrics.rentals_per_day?.value;
  const capacity = metrics.operational_capacity?.value;
  if (
    rentalsPerDay !== null && rentalsPerDay !== undefined
    && capacity !== null && capacity !== undefined
    && rentalsPerDay > capacity
  ) {
    addGuardrail(
      metrics,
      warnings,
      'rentals_per_day',
      `Спрос ${rentalsPerDay.toFixed(1)} аренды/день выше операционной capacity ${capacity.toFixed(1)}.`,
    );
  }

  const potentialDemand = metrics.potential_demand?.value;
  if (
    rentalsPerDay !== null && rentalsPerDay !== undefined
    && potentialDemand !== null && potentialDemand !== undefined
    && rentalsPerDay > potentialDemand
  ) {
    addGuardrail(
      metrics,
      warnings,
      'rentals_per_day',
      'Моделируемые аренды выше указанного потенциального спроса. Проверьте допущение.',
    );
  }
}

export function evaluateModel(
  model: ModelState,
  scenarioId = 'base',
  inputOverrides: Record<string, number> = {},
): EvaluationResult {
  const metrics = cloneMetrics(model.metrics);
  const errors: MetricEvaluationError[] = [];
  const warnings: MetricEvaluationError[] = [];
  const scenario = model.scenarios[scenarioId] ?? model.scenarios.base;

  for (const [id, value] of Object.entries(scenario?.overrides ?? {})) {
    if (metrics[id] && !metrics[id].formula) metrics[id].value = value;
  }
  for (const [id, value] of Object.entries(inputOverrides)) {
    if (metrics[id] && !metrics[id].formula) metrics[id].value = value;
  }

  let order: string[];
  try {
    order = topologicalOrder(model);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Расчётный граф невалиден.';
    for (const metric of Object.values(metrics)) {
      if (metric.formula || metric.kind === 'derived') {
        metric.value = null;
        metric.validationStatus = 'error';
        metric.validationMessages = [message];
      }
    }
    errors.push({ metricId: 'model', code: 'cycle', message });
    return { metrics, errors, warnings, order: [] };
  }

  for (const id of order) {
    const metric = metrics[id];
    if (!metric.formula && metric.kind !== 'derived') {
      if (metric.value === null || !Number.isFinite(metric.value)) {
        metric.validationStatus = 'error';
        metric.validationMessages = ['Введите конечное числовое значение.'];
        errors.push({ metricId: id, code: 'formula', message: metric.validationMessages[0] });
      } else {
        metric.validationStatus = 'valid';
      }
      continue;
    }

    const formulaErrors = validateFormula(metric, metrics);
    if (formulaErrors.length > 0 || !metric.formula) {
      metric.value = null;
      metric.validationStatus = 'error';
      metric.validationMessages = formulaErrors;
      formulaErrors.forEach((message) => errors.push({ metricId: id, code: 'unit', message }));
      continue;
    }

    try {
      const value = evaluateNode(metric.formula.ast, { metrics });
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Формула вернула нечисловое значение.');
      metric.value = value;
      metric.validationStatus = 'valid';
      metric.validationMessages = [];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка расчёта.';
      metric.value = null;
      metric.validationStatus = 'error';
      metric.validationMessages = [message];
      errors.push({ metricId: id, code: 'formula', message });
    }
  }

  applyTokBeriGuardrails(metrics, warnings);
  return { metrics, errors, warnings, order };
}

export function wouldCreateCycle(model: ModelState, from: string, to: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const relation of getCalculationRelations(model)) {
    const list = adjacency.get(relation.from) ?? [];
    list.push(relation.to);
    adjacency.set(relation.from, list);
  }
  const candidate = adjacency.get(from) ?? [];
  candidate.push(to);
  adjacency.set(from, candidate);

  const queue = [to];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  return false;
}
