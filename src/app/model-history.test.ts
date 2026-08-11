import { describe, expect, it } from 'vitest';
import { createCashFlowModel } from '../core/cash-flow-template';
import {
  commitInputOverridesHistory,
  commitModelHistory,
  createModelHistory,
  finalizeTransientHistory,
  redoModelHistory,
  undoModelHistory,
  updateInputOverridesWithoutHistory,
  updateModelPresentationWithoutHistory,
} from './model-history';

describe('model history', () => {
  it('undoes and redoes scenario values changed from the input panel', () => {
    const initial = createModelHistory(createCashFlowModel(), { base: {} });
    const changed = commitInputOverridesHistory(initial, (overrides) => ({
      ...overrides,
      base: { ...overrides.base, avg_rental_revenue: 320 },
    }));

    expect(changed.past).toHaveLength(1);
    expect(changed.present.inputOverridesByScenario.base.avg_rental_revenue).toBe(320);

    const undone = undoModelHistory(changed);
    expect(undone.present.inputOverridesByScenario.base.avg_rental_revenue).toBeUndefined();
    expect(undone.future).toHaveLength(1);

    const redone = redoModelHistory(undone);
    expect(redone.present.inputOverridesByScenario.base.avg_rental_revenue).toBe(320);
  });

  it('records a continuous slider gesture as one undo step', () => {
    const initial = createModelHistory(createCashFlowModel(), { base: {} });
    const start = initial.present;
    const firstTick = updateInputOverridesWithoutHistory(initial, (overrides) => ({
      ...overrides,
      base: { ...overrides.base, avg_rental_revenue: 260 },
    }));
    const lastTick = updateInputOverridesWithoutHistory(firstTick, (overrides) => ({
      ...overrides,
      base: { ...overrides.base, avg_rental_revenue: 340 },
    }));
    const finalized = finalizeTransientHistory(lastTick, start);

    expect(finalized.past).toHaveLength(1);
    expect(finalized.present.inputOverridesByScenario.base.avg_rental_revenue).toBe(340);
    expect(
      undoModelHistory(finalized)
        .present.inputOverridesByScenario.base.avg_rental_revenue,
    ).toBeUndefined();
  });

  it('does not put presentation changes into history or destroy redo', () => {
    const initial = createModelHistory(createCashFlowModel(), { base: {} });
    const renamed = commitModelHistory(initial, (model) => ({ ...model, name: 'Новая модель' }));
    const undone = undoModelHistory(renamed);
    const withCollapsedDomain = updateModelPresentationWithoutHistory(undone, (model) => ({
      ...model,
      domains: {
        ...model.domains,
        revenue: {
          ...model.domains.revenue,
          collapsed: true,
        },
      },
    }));

    expect(withCollapsedDomain.past).toHaveLength(0);
    expect(withCollapsedDomain.future).toHaveLength(1);
    expect(withCollapsedDomain.present.model.domains.revenue.collapsed).toBe(true);
    expect(redoModelHistory(withCollapsedDomain).present.model.name).toBe('Новая модель');
  });

  it('keeps the current UI state while undoing model data', () => {
    const model = createCashFlowModel();
    model.visualGroups.example = {
      id: 'example',
      name: 'Пример',
      color: '#8b5cf6',
      metricIds: ['avg_rental_revenue', 'total_rents'],
      collapsed: false,
    };
    const initial = createModelHistory(model, { base: {} });
    const moved = commitModelHistory(initial, (current) => ({
      ...current,
      metrics: {
        ...current.metrics,
        avg_rental_revenue: {
          ...current.metrics.avg_rental_revenue,
          position: { x: 999, y: 777 },
        },
      },
    }));
    const withCurrentPresentation = updateModelPresentationWithoutHistory(moved, (current) => ({
      ...current,
      domains: {
        ...current.domains,
        revenue: { ...current.domains.revenue, collapsed: true },
      },
      visualGroups: {
        ...current.visualGroups,
        example: { ...current.visualGroups.example, collapsed: true },
      },
      executableFrames: {
        ...current.executableFrames,
        'frame-monthly-snapshot': {
          ...current.executableFrames!['frame-monthly-snapshot'],
          collapsed: true,
        },
      },
      breakdowns: {
        ...current.breakdowns,
        payroll_cost: { ...current.breakdowns!.payroll_cost, expanded: false },
      },
      hiddenMetricIds: ['total_rents'],
    }));

    const undone = undoModelHistory(withCurrentPresentation);

    expect(undone.present.model.metrics.avg_rental_revenue.position).toEqual(
      model.metrics.avg_rental_revenue.position,
    );
    expect(undone.present.model.domains.revenue.collapsed).toBe(true);
    expect(undone.present.model.visualGroups.example.collapsed).toBe(true);
    expect(
      undone.present.model.executableFrames?.['frame-monthly-snapshot'].collapsed,
    ).toBe(true);
    expect(undone.present.model.breakdowns?.payroll_cost.expanded).toBe(false);
    expect(undone.present.model.hiddenMetricIds).toEqual(['total_rents']);
  });

  it('removes stale input overrides when a metric becomes calculated', () => {
    const initial = createModelHistory(createCashFlowModel(), {
      base: { avg_rental_revenue: 320 },
    });
    const committed = commitModelHistory(initial, (model) => ({
      ...model,
      metrics: {
        ...model.metrics,
        avg_rental_revenue: {
          ...model.metrics.avg_rental_revenue,
          formula: model.metrics.total_revenue.formula,
          value: null,
        },
      },
    }));

    expect(
      committed.present.inputOverridesByScenario.base.avg_rental_revenue,
    ).toBeUndefined();
  });
});
