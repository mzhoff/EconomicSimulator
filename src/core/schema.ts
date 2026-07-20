import { topologicalOrder, validateFormula } from './evaluator';
import { extractDependencies } from './ast';
import { findDuplicateAliases, validateMetricAlias } from './formula-parser';
import { MODEL_SCHEMA_VERSION } from './model';
import type { FormulaNode, ModelState, ValidationIssue, WorkspaceDocument } from './model';
import { PERSON, RUB, RUB_PER_PERSON_MONTH, unitsEqual } from './units';

const metricBehaviors = new Set(['stock', 'flow', 'rate', 'one_off']);
const metricKinds = new Set(['input', 'derived', 'observed', 'assumption']);
const valueSources = new Set(['input', 'derived', 'observed']);
const knowledgeStatuses = new Set(['fact', 'assumption', 'scenario', 'target', 'benchmark', 'derived']);
const validationStatuses = new Set(['valid', 'warning', 'error', 'incomplete']);
const metricRoles = new Set(['north_star', 'driver', 'intermediate', 'output', 'guardrail', 'diagnostic', 'input', 'constraint']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireString(record: Record<string, unknown>, key: string, path: string, issues: ValidationIssue[]): void {
  if (typeof record[key] !== 'string' || record[key] === '') issues.push({ path: `${path}.${key}`, message: 'Ожидается непустая строка.' });
}

function requireText(record: Record<string, unknown>, key: string, path: string, issues: ValidationIssue[]): void {
  if (typeof record[key] !== 'string') issues.push({ path: `${path}.${key}`, message: 'Ожидается строка.' });
}

function validateUnit(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'Единица должна быть объектом.' });
    return;
  }
  requireString(value, 'symbol', path, issues);
  if (!isRecord(value.dimensions)) {
    issues.push({ path: `${path}.dimensions`, message: 'Размерности должны быть объектом.' });
    return;
  }
  for (const [key, exponent] of Object.entries(value.dimensions)) {
    if (!key || !isFiniteNumber(exponent)) {
      issues.push({ path: `${path}.dimensions.${key}`, message: 'Показатель размерности должен быть конечным числом.' });
    }
  }
}

function validateFormulaNode(value: unknown, path: string, issues: ValidationIssue[], depth = 0): void {
  if (depth > 100) {
    issues.push({ path, message: 'AST слишком глубокий.' });
    return;
  }
  if (!isRecord(value) || typeof value.type !== 'string') {
    issues.push({ path, message: 'Узел AST должен быть объектом с полем type.' });
    return;
  }
  if (value.type === 'literal') {
    if (!isFiniteNumber(value.value)) issues.push({ path: `${path}.value`, message: 'Литерал должен быть конечным числом.' });
    if (value.unit !== undefined) validateUnit(value.unit, `${path}.unit`, issues);
    return;
  }
  if (value.type === 'metric') {
    requireString(value, 'metricId', path, issues);
    return;
  }
  if (value.type === 'binary') {
    if (!['add', 'subtract', 'multiply', 'divide'].includes(String(value.operator))) {
      issues.push({ path: `${path}.operator`, message: 'Неизвестная бинарная операция.' });
    }
    validateFormulaNode(value.left, `${path}.left`, issues, depth + 1);
    validateFormulaNode(value.right, `${path}.right`, issues, depth + 1);
    return;
  }
  if (value.type === 'unary') {
    if (!['negate', 'abs', 'round'].includes(String(value.operator))) {
      issues.push({ path: `${path}.operator`, message: 'Неизвестная унарная операция.' });
    }
    validateFormulaNode(value.operand, `${path}.operand`, issues, depth + 1);
    return;
  }
  if (value.type === 'function') {
    if (!['min', 'max'].includes(String(value.name))) {
      issues.push({ path: `${path}.name`, message: 'Неизвестная функция.' });
    }
    if (!Array.isArray(value.args) || value.args.length === 0) {
      issues.push({ path: `${path}.args`, message: 'Функции нужен хотя бы один аргумент.' });
      return;
    }
    value.args.forEach((arg, index) => validateFormulaNode(arg, `${path}.args.${index}`, issues, depth + 1));
    return;
  }
  if (value.type === 'comparison') {
    if (!['gt', 'gte', 'lt', 'lte', 'eq'].includes(String(value.operator))) {
      issues.push({ path: `${path}.operator`, message: 'Неизвестная операция сравнения.' });
    }
    validateFormulaNode(value.left, `${path}.left`, issues, depth + 1);
    validateFormulaNode(value.right, `${path}.right`, issues, depth + 1);
    return;
  }
  if (value.type === 'conditional') {
    validateFormulaNode(value.condition, `${path}.condition`, issues, depth + 1);
    validateFormulaNode(value.whenTrue, `${path}.whenTrue`, issues, depth + 1);
    validateFormulaNode(value.whenFalse, `${path}.whenFalse`, issues, depth + 1);
    return;
  }
  issues.push({ path: `${path}.type`, message: `Неизвестный тип AST-узла «${value.type}».` });
}

function validateModelShape(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'Модель должна быть объектом.' });
    return;
  }
  if (value.schemaVersion !== MODEL_SCHEMA_VERSION) {
    issues.push({ path: `${path}.schemaVersion`, message: `Поддерживается schemaVersion ${MODEL_SCHEMA_VERSION}.` });
  }
  requireString(value, 'id', path, issues);
  requireString(value, 'name', path, issues);
  requireText(value, 'description', path, issues);
  if (value.activeNorthStarId !== null && typeof value.activeNorthStarId !== 'string') {
    issues.push({ path: `${path}.activeNorthStarId`, message: 'North Star должна быть id метрики или null.' });
  }

  if (!isRecord(value.metrics)) {
    issues.push({ path: `${path}.metrics`, message: 'Метрики должны быть объектом.' });
  } else {
    for (const [id, rawMetric] of Object.entries(value.metrics)) {
      const metricPath = `${path}.metrics.${id}`;
      if (!isRecord(rawMetric)) {
        issues.push({ path: metricPath, message: 'Метрика должна быть объектом.' });
        continue;
      }
      for (const key of ['id', 'definitionId', 'name', 'alias']) requireString(rawMetric, key, metricPath, issues);
      requireText(rawMetric, 'description', metricPath, issues);
      if (rawMetric.id !== id) issues.push({ path: `${metricPath}.id`, message: 'Ключ метрики и id должны совпадать.' });
      if (typeof rawMetric.alias === 'string') {
        const aliasError = validateMetricAlias(rawMetric.alias);
        if (aliasError) issues.push({ path: `${metricPath}.alias`, message: aliasError });
      }
      if (!metricBehaviors.has(String(rawMetric.behavior))) issues.push({ path: `${metricPath}.behavior`, message: 'Неизвестный behavior.' });
      if (!metricKinds.has(String(rawMetric.kind))) issues.push({ path: `${metricPath}.kind`, message: 'Неизвестный kind.' });
      if (!valueSources.has(String(rawMetric.valueSource))) issues.push({ path: `${metricPath}.valueSource`, message: 'Неизвестный valueSource.' });
      if (!knowledgeStatuses.has(String(rawMetric.knowledgeStatus))) issues.push({ path: `${metricPath}.knowledgeStatus`, message: 'Неизвестный knowledgeStatus.' });
      if (!validationStatuses.has(String(rawMetric.validationStatus))) issues.push({ path: `${metricPath}.validationStatus`, message: 'Неизвестный validationStatus.' });
      if (!metricRoles.has(String(rawMetric.role))) issues.push({ path: `${metricPath}.role`, message: 'Неизвестная роль.' });
      requireString(rawMetric, 'domain', metricPath, issues);
      if (
        !Array.isArray(rawMetric.domainIds)
        || rawMetric.domainIds.some((domainId) => typeof domainId !== 'string' || !domainId)
      ) {
        issues.push({ path: `${metricPath}.domainIds`, message: 'domainIds должен быть массивом непустых id доменов.' });
      } else if (new Set(rawMetric.domainIds).size !== rawMetric.domainIds.length) {
        issues.push({ path: `${metricPath}.domainIds`, message: 'Один домен нельзя назначить метрике дважды.' });
      }
      if (rawMetric.value !== null && !isFiniteNumber(rawMetric.value)) issues.push({ path: `${metricPath}.value`, message: 'Значение должно быть конечным числом или null.' });
      validateUnit(rawMetric.unit, `${metricPath}.unit`, issues);

      if (!isRecord(rawMetric.grain)) {
        issues.push({ path: `${metricPath}.grain`, message: 'Grain должен быть объектом.' });
      } else {
        requireString(rawMetric.grain, 'entity', `${metricPath}.grain`, issues);
        requireString(rawMetric.grain, 'time', `${metricPath}.grain`, issues);
      }
      if (!isRecord(rawMetric.position) || !isFiniteNumber(rawMetric.position.x) || !isFiniteNumber(rawMetric.position.y)) {
        issues.push({ path: `${metricPath}.position`, message: 'Позиция должна содержать конечные x и y.' });
      }
      if (!isRecord(rawMetric.provenance)) {
        issues.push({ path: `${metricPath}.provenance`, message: 'У метрики должен быть provenance.' });
      } else {
        requireString(rawMetric.provenance, 'source', `${metricPath}.provenance`, issues);
        requireString(rawMetric.provenance, 'version', `${metricPath}.provenance`, issues);
      }
      if (!Array.isArray(rawMetric.validationMessages) || rawMetric.validationMessages.some((message) => typeof message !== 'string')) {
        issues.push({ path: `${metricPath}.validationMessages`, message: 'validationMessages должен быть массивом строк.' });
      }
      if (rawMetric.formula !== undefined) {
        if (!isRecord(rawMetric.formula)) {
          issues.push({ path: `${metricPath}.formula`, message: 'Формула должна быть объектом.' });
        } else {
          requireString(rawMetric.formula, 'source', `${metricPath}.formula`, issues);
          validateFormulaNode(rawMetric.formula.ast, `${metricPath}.formula.ast`, issues);
        }
      }
      if (rawMetric.inputConfig !== undefined) {
        if (
          !isRecord(rawMetric.inputConfig)
          || !isFiniteNumber(rawMetric.inputConfig.min)
          || !isFiniteNumber(rawMetric.inputConfig.max)
          || !isFiniteNumber(rawMetric.inputConfig.step)
          || rawMetric.inputConfig.step <= 0
          || rawMetric.inputConfig.min >= rawMetric.inputConfig.max
        ) {
          issues.push({ path: `${metricPath}.inputConfig`, message: 'Input config должен содержать min < max и положительный step.' });
        } else if (
          rawMetric.formula === undefined
          &&
          isFiniteNumber(rawMetric.value)
          && (rawMetric.value < rawMetric.inputConfig.min || rawMetric.value > rawMetric.inputConfig.max)
        ) {
          issues.push({ path: `${metricPath}.value`, message: 'Значение должно находиться между min и max.' });
        }
      }
    }
  }

  if (!isRecord(value.domains)) {
    issues.push({ path: `${path}.domains`, message: 'Домены должны быть объектом.' });
  } else {
    for (const [id, rawDomain] of Object.entries(value.domains)) {
      const domainPath = `${path}.domains.${id}`;
      if (!isRecord(rawDomain)) {
        issues.push({ path: domainPath, message: 'Домен должен быть объектом.' });
        continue;
      }
      for (const key of ['id', 'name', 'color']) requireString(rawDomain, key, domainPath, issues);
      requireText(rawDomain, 'description', domainPath, issues);
      if (rawDomain.id !== id) issues.push({ path: `${domainPath}.id`, message: 'Ключ домена и id должны совпадать.' });
      if (!Array.isArray(rawDomain.metricIds) || rawDomain.metricIds.some((metricId) => typeof metricId !== 'string')) {
        issues.push({ path: `${domainPath}.metricIds`, message: 'metricIds должен быть массивом строк.' });
      } else if (new Set(rawDomain.metricIds).size !== rawDomain.metricIds.length) {
        issues.push({ path: `${domainPath}.metricIds`, message: 'Метрика не должна повторяться внутри домена.' });
      }
      if (!isFiniteNumber(rawDomain.order)) issues.push({ path: `${domainPath}.order`, message: 'Порядок домена должен быть числом.' });
      if (rawDomain.collapsed !== undefined && typeof rawDomain.collapsed !== 'boolean') {
        issues.push({ path: `${domainPath}.collapsed`, message: 'collapsed должен быть boolean.' });
      }
    }
  }

  if (!isRecord(value.visualGroups)) {
    issues.push({ path: `${path}.visualGroups`, message: 'Визуальные группы должны быть объектом.' });
  } else {
    for (const [id, rawGroup] of Object.entries(value.visualGroups)) {
      const groupPath = `${path}.visualGroups.${id}`;
      if (!isRecord(rawGroup)) {
        issues.push({ path: groupPath, message: 'Визуальная группа должна быть объектом.' });
        continue;
      }
      for (const key of ['id', 'name', 'color']) requireString(rawGroup, key, groupPath, issues);
      if (rawGroup.id !== id) issues.push({ path: `${groupPath}.id`, message: 'Ключ группы и id должны совпадать.' });
      if (!Array.isArray(rawGroup.metricIds) || rawGroup.metricIds.some((metricId) => typeof metricId !== 'string')) {
        issues.push({ path: `${groupPath}.metricIds`, message: 'metricIds должен быть массивом строк.' });
      } else if (new Set(rawGroup.metricIds).size !== rawGroup.metricIds.length) {
        issues.push({ path: `${groupPath}.metricIds`, message: 'Метрика не должна повторяться внутри группы.' });
      }
      if (typeof rawGroup.collapsed !== 'boolean') {
        issues.push({ path: `${groupPath}.collapsed`, message: 'collapsed должен быть boolean.' });
      }
    }
  }

  if (value.breakdowns !== undefined) {
    if (!isRecord(value.breakdowns)) {
      issues.push({ path: `${path}.breakdowns`, message: 'Составы метрик должны быть объектом.' });
    } else {
      for (const [resultMetricId, rawBreakdown] of Object.entries(value.breakdowns)) {
        const breakdownPath = `${path}.breakdowns.${resultMetricId}`;
        if (!isRecord(rawBreakdown)) {
          issues.push({ path: breakdownPath, message: 'Состав метрики должен быть объектом.' });
          continue;
        }
        requireString(rawBreakdown, 'id', breakdownPath, issues);
        requireString(rawBreakdown, 'resultMetricId', breakdownPath, issues);
        if (rawBreakdown.resultMetricId !== resultMetricId) {
          issues.push({ path: `${breakdownPath}.resultMetricId`, message: 'Ключ состава и resultMetricId должны совпадать.' });
        }
        if (!['amount_list', 'quantity_rate'].includes(String(rawBreakdown.template))) {
          issues.push({ path: `${breakdownPath}.template`, message: 'Неизвестный шаблон состава.' });
        }
        if (typeof rawBreakdown.expanded !== 'boolean') {
          issues.push({ path: `${breakdownPath}.expanded`, message: 'expanded должен быть boolean.' });
        }
        if (!Array.isArray(rawBreakdown.rows) || rawBreakdown.rows.length === 0) {
          issues.push({ path: `${breakdownPath}.rows`, message: 'В составе должна быть хотя бы одна позиция.' });
          continue;
        }
        const rowIds = new Set<string>();
        rawBreakdown.rows.forEach((rawRow, index) => {
          const rowPath = `${breakdownPath}.rows.${index}`;
          if (!isRecord(rawRow)) {
            issues.push({ path: rowPath, message: 'Позиция состава должна быть объектом.' });
            return;
          }
          for (const key of ['id', 'name']) requireString(rawRow, key, rowPath, issues);
          requireText(rawRow, 'comment', rowPath, issues);
          if (typeof rawRow.id === 'string') {
            if (rowIds.has(rawRow.id)) {
              issues.push({ path: `${rowPath}.id`, message: 'ID позиции не должен повторяться.' });
            }
            rowIds.add(rawRow.id);
          }
          if (rawBreakdown.template === 'amount_list') {
            requireString(rawRow, 'amountMetricId', rowPath, issues);
          } else if (rawBreakdown.template === 'quantity_rate') {
            requireString(rawRow, 'quantityMetricId', rowPath, issues);
            requireString(rawRow, 'rateMetricId', rowPath, issues);
          }
        });
      }
    }
  }

  if (!isRecord(value.scenarios) || !isRecord(value.scenarios.base)) {
    issues.push({ path: `${path}.scenarios`, message: 'Нужен сценарий base.' });
  } else {
    for (const [id, scenario] of Object.entries(value.scenarios)) {
      if (!isRecord(scenario)) {
        issues.push({ path: `${path}.scenarios.${id}`, message: 'Сценарий должен быть объектом.' });
        continue;
      }
      if (scenario.id !== id) issues.push({ path: `${path}.scenarios.${id}.id`, message: 'Ключ сценария и id должны совпадать.' });
      requireString(scenario, 'label', `${path}.scenarios.${id}`, issues);
      requireText(scenario, 'description', `${path}.scenarios.${id}`, issues);
      if (!isRecord(scenario.overrides) || Object.values(scenario.overrides).some((item) => !isFiniteNumber(item))) {
        issues.push({ path: `${path}.scenarios.${id}.overrides`, message: 'Overrides должны быть конечными числами.' });
      }
    }
  }
  if (!Array.isArray(value.influenceRelations)) {
    issues.push({ path: `${path}.influenceRelations`, message: 'influenceRelations должен быть массивом.' });
  } else {
    value.influenceRelations.forEach((relation, index) => {
      const relationPath = `${path}.influenceRelations.${index}`;
      if (!isRecord(relation)) {
        issues.push({ path: relationPath, message: 'Influence relation должна быть объектом.' });
        return;
      }
      for (const key of ['id', 'from', 'to']) requireString(relation, key, relationPath, issues);
      if (relation.type !== 'influence') issues.push({ path: `${relationPath}.type`, message: 'Ожидается relation type influence.' });
      if (!isFiniteNumber(relation.sign)) issues.push({ path: `${relationPath}.sign`, message: 'Знак влияния должен быть числом.' });
      if (!['low', 'medium', 'high'].includes(String(relation.confidence))) {
        issues.push({ path: `${relationPath}.confidence`, message: 'Неизвестный confidence.' });
      }
    });
  }
}

function validateModelSemantics(model: ModelState, issues: ValidationIssue[]): void {
  if (model.activeNorthStarId !== null && !model.metrics[model.activeNorthStarId]) {
    issues.push({ path: 'model.activeNorthStarId', message: 'North Star должна ссылаться на существующую метрику.' });
  }
  for (const alias of findDuplicateAliases(model.metrics)) {
    issues.push({ path: 'model.metrics', message: `Alias «${alias}» используется несколькими метриками.` });
  }
  for (const metric of Object.values(model.metrics)) {
    for (const domainId of metric.domainIds) {
      const domain = model.domains[domainId];
      if (!domain) {
        issues.push({ path: `model.metrics.${metric.id}.domainIds`, message: `Домен «${domainId}» не существует.` });
      } else if (!domain.metricIds.includes(metric.id)) {
        issues.push({ path: `model.metrics.${metric.id}.domainIds`, message: `Домен «${domainId}» не содержит метрику в metricIds.` });
      }
    }
    for (const message of validateFormula(metric, model.metrics)) {
      issues.push({ path: `model.metrics.${metric.id}.formula`, message });
    }
  }
  try {
    topologicalOrder(model);
  } catch (error) {
    issues.push({ path: 'model.metrics', message: error instanceof Error ? error.message : 'Расчётный граф невалиден.' });
  }
  for (const scenario of Object.values(model.scenarios)) {
    for (const metricId of Object.keys(scenario.overrides)) {
      const metric = model.metrics[metricId];
      if (!metric) issues.push({ path: `model.scenarios.${scenario.id}.overrides.${metricId}`, message: 'Override ссылается на отсутствующую метрику.' });
      else if (metric.formula) issues.push({ path: `model.scenarios.${scenario.id}.overrides.${metricId}`, message: 'Нельзя переопределять метрику с формулой.' });
    }
  }
  for (const domain of Object.values(model.domains)) {
    for (const metricId of domain.metricIds) {
      const metric = model.metrics[metricId];
      if (!metric) {
        issues.push({ path: `model.domains.${domain.id}.metricIds`, message: `Метрика «${metricId}» не существует.` });
      } else if (!metric.domainIds.includes(domain.id)) {
        issues.push({ path: `model.domains.${domain.id}.metricIds`, message: `Метрика «${metricId}» не ссылается на домен.` });
      }
    }
  }
  for (const group of Object.values(model.visualGroups)) {
    for (const metricId of group.metricIds) {
      if (!model.metrics[metricId]) {
        issues.push({ path: `model.visualGroups.${group.id}.metricIds`, message: `Метрика «${metricId}» не существует.` });
      }
    }
  }
  const claimedBreakdownMetrics = new Set<string>();
  for (const breakdown of Object.values(model.breakdowns ?? {})) {
    const parent = model.metrics[breakdown.resultMetricId];
    if (!parent) {
      issues.push({ path: `model.breakdowns.${breakdown.resultMetricId}`, message: 'Результирующая метрика состава не существует.' });
      continue;
    }
    if (parent.behavior !== 'flow' || !unitsEqual(parent.unit, RUB)) {
      issues.push({ path: `model.breakdowns.${breakdown.resultMetricId}`, message: 'Состав v1 поддерживает денежные Flow-метрики в рублях.' });
    }
    const childMetricIds = breakdown.rows.flatMap((row) => [
      row.amountMetricId,
      row.quantityMetricId,
      row.rateMetricId,
    ].filter((metricId): metricId is string => Boolean(metricId)));
    for (const row of breakdown.rows) {
      if (breakdown.template === 'amount_list') {
        const amount = row.amountMetricId ? model.metrics[row.amountMetricId] : undefined;
        if (amount && (amount.behavior !== 'flow' || !unitsEqual(amount.unit, RUB))) {
          issues.push({ path: `model.breakdowns.${breakdown.resultMetricId}.rows.${row.id}`, message: 'Сумма позиции должна быть денежной Flow-метрикой.' });
        }
      } else {
        const quantity = row.quantityMetricId ? model.metrics[row.quantityMetricId] : undefined;
        const rate = row.rateMetricId ? model.metrics[row.rateMetricId] : undefined;
        if (quantity && (quantity.behavior !== 'stock' || !unitsEqual(quantity.unit, PERSON))) {
          issues.push({ path: `model.breakdowns.${breakdown.resultMetricId}.rows.${row.id}`, message: 'Количество позиции должно быть Stock-метрикой в людях.' });
        }
        if (rate && (rate.behavior !== 'rate' || !unitsEqual(rate.unit, RUB_PER_PERSON_MONTH))) {
          issues.push({ path: `model.breakdowns.${breakdown.resultMetricId}.rows.${row.id}`, message: 'Ставка позиции должна быть Rate-метрикой в рублях на человека в месяц.' });
        }
      }
    }
    for (const metricId of childMetricIds) {
      if (metricId === parent.id) {
        issues.push({ path: `model.breakdowns.${breakdown.resultMetricId}.rows`, message: 'Результирующая метрика не может входить в собственный состав.' });
      }
      if (!model.metrics[metricId]) {
        issues.push({ path: `model.breakdowns.${breakdown.resultMetricId}.rows`, message: `Внутренняя метрика «${metricId}» не существует.` });
      }
      if (claimedBreakdownMetrics.has(metricId)) {
        issues.push({ path: `model.breakdowns.${breakdown.resultMetricId}.rows`, message: `Внутренняя метрика «${metricId}» уже принадлежит другому составу.` });
      }
      claimedBreakdownMetrics.add(metricId);
    }
    const formulaDependencies = parent.formula
      ? extractDependencies(parent.formula.ast)
      : new Set<string>();
    if (
      formulaDependencies.size !== childMetricIds.length
      || childMetricIds.some((metricId) => !formulaDependencies.has(metricId))
    ) {
      issues.push({ path: `model.metrics.${parent.id}.formula`, message: 'Формула результата не соответствует строкам состава.' });
    }
  }
  for (const relation of model.influenceRelations) {
    if (!model.metrics[relation.from] || !model.metrics[relation.to]) {
      issues.push({ path: `model.influenceRelations.${relation.id}`, message: 'Influence relation ссылается на отсутствующую метрику.' });
    }
  }
}

export function validateModelDocument(value: unknown): { ok: true; model: ModelState } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  validateModelShape(value, 'model', issues);
  if (issues.length > 0) return { ok: false, issues };
  const model = value as ModelState;
  validateModelSemantics(model, issues);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, model };
}

export function validateWorkspaceDocument(
  value: unknown,
): { ok: true; workspace: WorkspaceDocument } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [{ path: 'workspace', message: 'Файл должен содержать JSON-объект.' }] };
  if (value.schemaVersion !== MODEL_SCHEMA_VERSION) {
    issues.push({ path: 'workspace.schemaVersion', message: `Поддерживается schemaVersion ${MODEL_SCHEMA_VERSION}.` });
  }
  requireString(value, 'savedAt', 'workspace', issues);
  validateModelShape(value.model, 'workspace.model', issues);
  if (typeof value.activeScenarioId !== 'string') issues.push({ path: 'workspace.activeScenarioId', message: 'Нужен activeScenarioId.' });
  if (!isRecord(value.inputOverridesByScenario)) {
    issues.push({ path: 'workspace.inputOverridesByScenario', message: 'Overrides должны быть объектом.' });
  } else {
    for (const [scenarioId, rawOverrides] of Object.entries(value.inputOverridesByScenario)) {
      if (!isRecord(rawOverrides)) {
        issues.push({ path: `workspace.inputOverridesByScenario.${scenarioId}`, message: 'Overrides сценария должны быть объектом.' });
        continue;
      }
      for (const [metricId, rawValue] of Object.entries(rawOverrides)) {
        if (!isFiniteNumber(rawValue)) {
          issues.push({ path: `workspace.inputOverridesByScenario.${scenarioId}.${metricId}`, message: 'Override должен быть конечным числом.' });
        }
      }
    }
  }
  if (
    !isRecord(value.viewport)
    || !isFiniteNumber(value.viewport.x)
    || !isFiniteNumber(value.viewport.y)
    || !isFiniteNumber(value.viewport.scale)
  ) {
    issues.push({ path: 'workspace.viewport', message: 'Viewport должен содержать конечные x, y и scale.' });
  }
  if (issues.length > 0) return { ok: false, issues };
  const workspace = value as unknown as WorkspaceDocument;
  validateModelSemantics(workspace.model, issues);
  if (!workspace.model.scenarios[workspace.activeScenarioId]) {
    issues.push({ path: 'workspace.activeScenarioId', message: 'Активный сценарий отсутствует в модели.' });
  }
  for (const [overrideScenarioId, overrides] of Object.entries(workspace.inputOverridesByScenario)) {
    if (!workspace.model.scenarios[overrideScenarioId]) {
      issues.push({ path: `workspace.inputOverridesByScenario.${overrideScenarioId}`, message: 'Overrides относятся к отсутствующему сценарию.' });
    }
    for (const metricId of Object.keys(overrides)) {
      const metric = workspace.model.metrics[metricId];
      if (!metric) {
        issues.push({ path: `workspace.inputOverridesByScenario.${overrideScenarioId}.${metricId}`, message: 'Override ссылается на отсутствующую метрику.' });
      } else if (metric.formula) {
        issues.push({ path: `workspace.inputOverridesByScenario.${overrideScenarioId}.${metricId}`, message: 'Нельзя переопределять метрику с формулой.' });
      }
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, workspace };
}

export function parseWorkspaceJson(
  text: string,
): { ok: true; workspace: WorkspaceDocument } | { ok: false; issues: ValidationIssue[] } {
  try {
    return validateWorkspaceDocument(JSON.parse(text) as unknown);
  } catch {
    return { ok: false, issues: [{ path: 'json', message: 'Файл не является корректным JSON.' }] };
  }
}
