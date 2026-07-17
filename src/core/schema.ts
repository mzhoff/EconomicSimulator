import { topologicalOrder, validateFormula } from './evaluator';
import { MODEL_SCHEMA_VERSION } from './model';
import type { FormulaNode, ModelState, ValidationIssue, WorkspaceDocument } from './model';

const metricBehaviors = new Set(['stock', 'flow', 'rate', 'event']);
const metricKinds = new Set(['input', 'derived', 'observed', 'assumption']);
const valueSources = new Set(['input', 'derived', 'observed']);
const knowledgeStatuses = new Set(['fact', 'assumption', 'scenario', 'target', 'benchmark', 'derived']);
const validationStatuses = new Set(['valid', 'warning', 'error', 'incomplete']);
const metricRoles = new Set(['north_star', 'driver', 'intermediate', 'output', 'guardrail', 'diagnostic', 'input', 'constraint']);
const metricDomains = new Set(['demand', 'revenue', 'variable_costs', 'fixed_costs', 'capex', 'operations', 'results']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireString(record: Record<string, unknown>, key: string, path: string, issues: ValidationIssue[]): void {
  if (typeof record[key] !== 'string' || record[key] === '') issues.push({ path: `${path}.${key}`, message: 'Ожидается непустая строка.' });
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
  requireString(value, 'description', path, issues);
  requireString(value, 'activeNorthStarId', path, issues);

  if (!isRecord(value.metrics) || Object.keys(value.metrics).length === 0) {
    issues.push({ path: `${path}.metrics`, message: 'Модель должна содержать метрики.' });
  } else {
    for (const [id, rawMetric] of Object.entries(value.metrics)) {
      const metricPath = `${path}.metrics.${id}`;
      if (!isRecord(rawMetric)) {
        issues.push({ path: metricPath, message: 'Метрика должна быть объектом.' });
        continue;
      }
      for (const key of ['id', 'definitionId', 'name', 'description']) requireString(rawMetric, key, metricPath, issues);
      if (rawMetric.id !== id) issues.push({ path: `${metricPath}.id`, message: 'Ключ метрики и id должны совпадать.' });
      if (!metricBehaviors.has(String(rawMetric.behavior))) issues.push({ path: `${metricPath}.behavior`, message: 'Неизвестный behavior.' });
      if (!metricKinds.has(String(rawMetric.kind))) issues.push({ path: `${metricPath}.kind`, message: 'Неизвестный kind.' });
      if (!valueSources.has(String(rawMetric.valueSource))) issues.push({ path: `${metricPath}.valueSource`, message: 'Неизвестный valueSource.' });
      if (!knowledgeStatuses.has(String(rawMetric.knowledgeStatus))) issues.push({ path: `${metricPath}.knowledgeStatus`, message: 'Неизвестный knowledgeStatus.' });
      if (!validationStatuses.has(String(rawMetric.validationStatus))) issues.push({ path: `${metricPath}.validationStatus`, message: 'Неизвестный validationStatus.' });
      if (!metricRoles.has(String(rawMetric.role))) issues.push({ path: `${metricPath}.role`, message: 'Неизвестная роль.' });
      if (!metricDomains.has(String(rawMetric.domain))) issues.push({ path: `${metricPath}.domain`, message: 'Неизвестный домен.' });
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
        ) {
          issues.push({ path: `${metricPath}.inputConfig`, message: 'Input config должен содержать min, max и положительный step.' });
        }
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
      requireString(scenario, 'description', `${path}.scenarios.${id}`, issues);
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
  if (!model.metrics[model.activeNorthStarId]) {
    issues.push({ path: 'model.activeNorthStarId', message: 'North Star должна ссылаться на существующую метрику.' });
  }
  for (const metric of Object.values(model.metrics)) {
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
      else if (metric.kind === 'derived') issues.push({ path: `model.scenarios.${scenario.id}.overrides.${metricId}`, message: 'Нельзя переопределять derived-метрику.' });
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
      } else if (metric.kind === 'derived' || metric.behavior === 'event') {
        issues.push({ path: `workspace.inputOverridesByScenario.${overrideScenarioId}.${metricId}`, message: 'Нельзя переопределять derived или Event.' });
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
