import { describe, expect, it } from 'vitest';
import fixture from './fixtures/tokberi-base-station.json';
import { computeGraphFocus, computeImpact, computeTokBeriThresholds } from './analysis';
import { createBlankModel } from './builder';
import { evaluateModel, getCalculationRelations } from './evaluator';
import {
  assertUniqueMetricAlias,
  formatFormulaAst,
  parseFormula,
} from './formula-parser';
import { validateModelDocument } from './schema';
import {
  createWorkspaceDocument,
  importWorkspace,
  LEGACY_WORKSPACE_STORAGE_KEY,
  loadWorkspace,
  MIGRATION_BACKUP_KEY,
  serializeWorkspace,
  WORKSPACE_STORAGE_KEY,
} from './storage';
import { createTokBeriModel } from './tokberi-template';

describe('TokBeri reference model', () => {
  it('matches the trusted station fixture', () => {
    const model = createTokBeriModel();
    const result = evaluateModel(model);

    expect(result.errors).toEqual([]);
    for (const [id, expected] of Object.entries(fixture.expected)) {
      expect(result.metrics[id]?.value, id).toBeCloseTo(expected, 6);
    }
  });

  it('recalculates Weak, Base, Good and Hotspot scenarios', () => {
    const model = createTokBeriModel();
    const values = ['weak', 'base', 'good', 'hotspot'].map(
      (scenario) => evaluateModel(model, scenario).metrics.rental_revenue.value,
    );

    expect(values.every((value) => typeof value === 'number')).toBe(true);
    expect(values[0]!).toBeLessThan(values[1]!);
    expect(values[1]!).toBeLessThan(values[2]!);
    expect(values[2]!).toBeLessThan(values[3]!);
  });

  it('computes a downstream North Star impact for a relative shock', () => {
    const model = createTokBeriModel();
    const impact = computeImpact('rentals_per_day', model, 'base', {}, { kind: 'relative', amount: 0.1 });

    expect(impact).not.toBeNull();
    expect(impact!.afterInput).toBeCloseTo(1.65);
    expect(impact!.afterNorthStar!).toBeGreaterThan(impact!.beforeNorthStar!);
    expect(impact!.deltas.profit_before_tax).toBeGreaterThan(0);
  });

  it('finds break-even and 12/24 month payback thresholds', () => {
    const model = createTokBeriModel();
    const thresholds = computeTokBeriThresholds(model, 'base', {});

    expect(thresholds.breakEven.reached).toBe(true);
    expect(thresholds.payback12.reached).toBe(true);
    expect(thresholds.payback24.reached).toBe(true);
    expect(thresholds.breakEven.value!).toBeGreaterThan(0);
    expect(thresholds.payback12.value!).toBeGreaterThan(0);
    expect(thresholds.payback24.value!).toBeLessThan(thresholds.payback12.value!);
  });

  it('builds structure, focus, multi-select and analysis connection states', () => {
    const model = createTokBeriModel();

    const structure = computeGraphFocus(model, []);
    expect(structure.mode).toBe('structure');
    expect(structure.backboneEdges.has('cash_contribution-profit_before_tax')).toBe(true);
    expect(structure.backboneEdges.has('cash_contribution-payback_months')).toBe(false);

    const focus = computeGraphFocus(model, ['cash_contribution']);
    expect(focus.mode).toBe('focus');
    expect(focus.upstreamEdges.has('rental_revenue-cash_contribution')).toBe(true);
    expect(focus.downstreamEdges.has('cash_contribution-profit_before_tax')).toBe(true);

    const influenceFocus = computeGraphFocus(model, ['potential_demand']);
    expect(influenceFocus.directEdges.has('potential_demand-rentals_per_day')).toBe(true);

    const multi = computeGraphFocus(model, ['rentals_per_day', 'profit_before_tax']);
    expect(multi.mode).toBe('multi');
    expect(multi.hasCalculationPath).toBe(true);
    expect(multi.connectingEdges.has('successful_rentals-rental_revenue')).toBe(true);
    expect(multi.connectingEdges.has('cash_contribution-profit_before_tax')).toBe(true);

    const disconnected = computeGraphFocus(model, ['deposit_amount', 'profit_before_tax']);
    expect(disconnected.hasCalculationPath).toBe(false);

    const influenceOnly = computeGraphFocus(model, ['potential_demand', 'rentals_per_day']);
    expect(influenceOnly.hasCalculationPath).toBe(false);
    expect(influenceOnly.directEdges.has('potential_demand-rentals_per_day')).toBe(true);

    const analysis = computeGraphFocus(model, [], 'rentals_per_day');
    expect(analysis.mode).toBe('analysis');
    expect(analysis.analysisEdges.has('cash_contribution-profit_before_tax')).toBe(true);
  });
});

describe('schema, AST and DAG safety', () => {
  it('rejects a calculation cycle', () => {
    const model = structuredClone(createTokBeriModel());
    model.metrics.cash_contribution.formula = parseFormula('profit_before_tax', model.metrics);

    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.message.includes('цикл'))).toBe(true);
  });

  it('rejects incompatible units', () => {
    const model = structuredClone(createTokBeriModel());
    model.metrics.profit_before_tax.formula = parseFormula(
      'cash_contribution + successful_rentals',
      model.metrics,
    );

    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.message.includes('Несовместимые единицы'))).toBe(true);
  });

  it('allows only Stock, Flow and Rate in schema v2', () => {
    const model = structuredClone(createTokBeriModel()) as unknown as Record<string, unknown>;
    const metrics = model.metrics as Record<string, Record<string, unknown>>;
    metrics.lost_units.behavior = 'event';
    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.path.endsWith('.behavior'))).toBe(true);
  });

  it('round-trips formulas, scenarios and positions through JSON', () => {
    const workspace = createWorkspaceDocument(createTokBeriModel(), {
      activeScenarioId: 'good',
      inputOverridesByScenario: { good: { rentals_per_day: 4.5 } },
      viewport: { x: 120, y: 80, scale: 0.75 },
    });
    const imported = importWorkspace(serializeWorkspace(workspace));

    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.workspace.model.metrics.cash_contribution.formula).toEqual(
      workspace.model.metrics.cash_contribution.formula,
    );
    expect(imported.workspace.model.scenarios).toEqual(workspace.model.scenarios);
    expect(imported.workspace.model.metrics.profit_before_tax.position).toEqual(
      workspace.model.metrics.profit_before_tax.position,
    );
    expect(evaluateModel(imported.workspace.model, 'good', { rentals_per_day: 4.5 }).errors).toEqual([]);
  });
});

describe('universal builder schema v2', () => {
  it('creates a valid empty model without a forced North Star', () => {
    const model = createBlankModel('Пустая модель');
    expect(model.activeNorthStarId).toBeNull();
    expect(model.metrics).toEqual({});
    expect(validateModelDocument(model)).toMatchObject({ ok: true });
  });

  it('parses aliases with arithmetic precedence and stores metric ids in AST', () => {
    const model = createTokBeriModel();
    const formula = parseFormula(
      'rental_revenue - sim_cost * 2',
      model.metrics,
    );

    expect(formula.ast).toEqual({
      type: 'binary',
      operator: 'subtract',
      left: { type: 'metric', metricId: 'rental_revenue' },
      right: {
        type: 'binary',
        operator: 'multiply',
        left: { type: 'metric', metricId: 'sim_cost' },
        right: { type: 'literal', value: 2 },
      },
    });
  });

  it('keeps parsed formulas valid when an alias is renamed', () => {
    const model = structuredClone(createTokBeriModel());
    model.metrics.cash_contribution.formula = parseFormula(
      'rental_revenue - sim_cost',
      model.metrics,
    );
    model.metrics.rental_revenue.alias = 'monthly_rental_revenue';

    expect(formatFormulaAst(model.metrics.cash_contribution.formula.ast, model.metrics))
      .toBe('monthly_rental_revenue - sim_cost');
    expect(evaluateModel(model).metrics.cash_contribution.value).not.toBeNull();
  });

  it('rejects duplicate aliases with a readable error', () => {
    const model = structuredClone(createTokBeriModel());
    expect(() => assertUniqueMetricAlias(
      model.metrics.sim_cost.alias,
      model.metrics,
      model.metrics.maintenance_cost.id,
    )).toThrow('уже используется');

    model.metrics.maintenance_cost.alias = model.metrics.sim_cost.alias;
    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.message.includes('Alias'))).toBe(true);
  });

  it('derives operation and local direction metadata for calculation edges', () => {
    const model = structuredClone(createTokBeriModel());
    const advancedRelation = getCalculationRelations(model).find(
      (candidate) => candidate.from === 'rental_revenue' && candidate.to === 'contribution_margin',
    );
    expect(advancedRelation).toMatchObject({
      operation: 'mixed',
      direction: 'dynamic',
    });

    model.metrics.payback_months.formula = parseFormula(
      'total_capex / cash_contribution',
      model.metrics,
    );
    const relations = getCalculationRelations(model);
    const relation = (from: string, to: string) => relations.find(
      (candidate) => candidate.from === from && candidate.to === to,
    );

    expect(relation('cash_contribution', 'profit_before_tax')).toMatchObject({
      operation: 'add',
      direction: 'positive',
      sign: 1,
    });
    expect(relation('station_depreciation', 'profit_before_tax')).toMatchObject({
      operation: 'subtract',
      direction: 'negative',
      sign: -1,
    });
    expect(relation('successful_rentals', 'rental_revenue')).toMatchObject({
      operation: 'multiply',
      direction: 'positive',
    });
    expect(relation('cash_contribution', 'payback_months')).toMatchObject({
      operation: 'divide',
      direction: 'negative',
    });
  });

  it('migrates a saved v1 workspace with aliases, many-to-many domains and backup', () => {
    const v2 = createWorkspaceDocument(createTokBeriModel());
    const legacy = structuredClone(v2) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    const legacyModel = legacy.model as Record<string, unknown>;
    legacyModel.schemaVersion = 1;
    delete legacyModel.domains;
    delete legacyModel.visualGroups;
    const legacyMetrics = legacyModel.metrics as Record<string, Record<string, unknown>>;
    for (const metric of Object.values(legacyMetrics)) {
      delete metric.alias;
      delete metric.domainIds;
    }
    const serializedLegacy = JSON.stringify(legacy);
    const items = new Map<string, string>([[LEGACY_WORKSPACE_STORAGE_KEY, serializedLegacy]]);
    const storage = {
      get length() { return items.size; },
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => { items.delete(key); },
      setItem: (key: string, value: string) => { items.set(key, value); },
    } satisfies Storage;

    const loaded = loadWorkspace(storage);

    expect(loaded.warning).toContain('schema v2');
    expect(loaded.value.schemaVersion).toBe(2);
    expect(loaded.value.model.metrics.sim_cost.alias).toBe('sim_cost');
    expect(loaded.value.model.metrics.sim_cost.domainIds).toContain('fixed_costs');
    expect(loaded.value.model.domains.fixed_costs.metricIds).toContain('sim_cost');
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBe(serializedLegacy);
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).not.toBeNull();
  });
});
