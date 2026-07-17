import { describe, expect, it } from 'vitest';
import fixture from './fixtures/tokberi-base-station.json';
import { add, ref } from './ast';
import { computeImpact, computeTokBeriThresholds } from './analysis';
import { evaluateModel } from './evaluator';
import { validateModelDocument } from './schema';
import { createWorkspaceDocument, importWorkspace, serializeWorkspace } from './storage';
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
});

describe('schema, AST and DAG safety', () => {
  it('rejects a calculation cycle', () => {
    const model = structuredClone(createTokBeriModel());
    model.metrics.cash_contribution.formula = {
      source: 'profit_before_tax',
      ast: ref('profit_before_tax'),
    };

    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.message.includes('цикл'))).toBe(true);
  });

  it('rejects incompatible units', () => {
    const model = structuredClone(createTokBeriModel());
    model.metrics.profit_before_tax.formula = {
      source: 'cash_contribution + successful_rentals',
      ast: add(ref('cash_contribution'), ref('successful_rentals')),
    };

    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.message.includes('Несовместимые единицы'))).toBe(true);
  });

  it('rejects Event in ordinary arithmetic', () => {
    const model = structuredClone(createTokBeriModel());
    model.metrics.lost_units.behavior = 'event';

    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.message.includes('Event нельзя'))).toBe(true);
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
