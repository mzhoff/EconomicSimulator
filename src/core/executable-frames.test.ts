import { describe, expect, it } from 'vitest';
import { createCashFlowModel } from './cash-flow-template';
import {
  ensureMonthlyTimelineFrame,
  updateMonthlyTimelineFrame,
} from './executable-frames';
import { validateModelDocument } from './schema';

describe('executable model frames', () => {
  it('adds a monthly timeline with three runtime-owned stocks', () => {
    const source = createCashFlowModel();
    const created = ensureMonthlyTimelineFrame(source, 'profit');
    const frame = created.model.executableFrames?.[created.frameId];

    expect(frame?.execution.mode).toBe('monthly_timeline');
    expect(frame?.metricIds).toHaveLength(3);
    expect(frame?.metricIds.map((id) => created.model.metrics[id].behavior)).toEqual([
      'stock',
      'stock',
      'stock',
    ]);
    expect(frame?.metricIds.every((id) => (
      created.model.metrics[id].valueSource === 'observed'
      && created.model.metrics[id].inputConfig === undefined
    ))).toBe(true);
    expect(JSON.stringify(frame)).not.toMatch(/amorti|depreci|налог/i);
    expect(validateModelDocument(created.model)).toMatchObject({ ok: true });
  });

  it('stores the investment plan without storing calculated timeline points', () => {
    const created = ensureMonthlyTimelineFrame(createCashFlowModel(), 'profit');
    const updated = updateMonthlyTimelineFrame(created.model, created.frameId, {
      horizonMonths: 60,
      investments: [{
        id: 'stations-wave-2',
        name: 'Вторая партия станций',
        monthIndex: 12,
        amount: 1_500_000,
        comment: 'План расширения',
      }],
    });
    const frame = updated.executableFrames?.[created.frameId];

    expect(frame?.execution).toMatchObject({
      mode: 'monthly_timeline',
      horizonMonths: 60,
      investments: [{ monthIndex: 12, amount: 1_500_000 }],
    });
    expect(frame).not.toHaveProperty('points');
    expect(validateModelDocument(updated)).toMatchObject({ ok: true });
  });

  it('rejects a flow that is not monthly', () => {
    const source = createCashFlowModel();
    source.metrics.profit.grain = { ...source.metrics.profit.grain, time: 'day' };

    expect(() => ensureMonthlyTimelineFrame(source, 'profit')).toThrow(
      'месячной гранулярностью',
    );
  });
});
