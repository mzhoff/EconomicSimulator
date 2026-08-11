import { describe, expect, it } from 'vitest';
import { runMonthlyTimeline, type MonthlyTimelineConfig } from './monthly-timeline';

function timeline(overrides: Partial<MonthlyTimelineConfig> = {}) {
  return runMonthlyTimeline({
    horizonMonths: 6,
    operatingCashFlow: 100,
    investments: [{
      id: 'initial-capex',
      name: 'Стартовый CAPEX',
      monthIndex: 0,
      amount: 250,
      comment: '',
    }],
    ...overrides,
  });
}

describe('monthly timeline', () => {
  it('accumulates a monthly flow and finds the first and stable payback', () => {
    const result = timeline();

    expect(result.points).toEqual([
      {
        monthIndex: 0,
        operatingCashFlow: 100,
        capexOutflow: 250,
        cumulativeCapex: 250,
        cumulativeOperatingCashFlow: 100,
        projectCashPosition: -150,
      },
      {
        monthIndex: 1,
        operatingCashFlow: 100,
        capexOutflow: 0,
        cumulativeCapex: 250,
        cumulativeOperatingCashFlow: 200,
        projectCashPosition: -50,
      },
      {
        monthIndex: 2,
        operatingCashFlow: 100,
        capexOutflow: 0,
        cumulativeCapex: 250,
        cumulativeOperatingCashFlow: 300,
        projectCashPosition: 50,
      },
      {
        monthIndex: 3,
        operatingCashFlow: 100,
        capexOutflow: 0,
        cumulativeCapex: 250,
        cumulativeOperatingCashFlow: 400,
        projectCashPosition: 150,
      },
      {
        monthIndex: 4,
        operatingCashFlow: 100,
        capexOutflow: 0,
        cumulativeCapex: 250,
        cumulativeOperatingCashFlow: 500,
        projectCashPosition: 250,
      },
      {
        monthIndex: 5,
        operatingCashFlow: 100,
        capexOutflow: 0,
        cumulativeCapex: 250,
        cumulativeOperatingCashFlow: 600,
        projectCashPosition: 350,
      },
    ]);
    expect(result.firstPaybackMonthIndex).toBe(2);
    expect(result.stablePaybackMonthIndex).toBe(2);
  });

  it('sums several investments planned for the same month', () => {
    const result = timeline({
      horizonMonths: 3,
      investments: [
        { id: 'stations', name: 'Станции', monthIndex: 1, amount: 300, comment: '' },
        { id: 'logistics', name: 'Логистика', monthIndex: 1, amount: 50, comment: '' },
      ],
    });

    expect(result.points[1].capexOutflow).toBe(350);
    expect(result.points[2].cumulativeCapex).toBe(350);
    expect(result.points[2].projectCashPosition).toBe(-50);
  });

  it('distinguishes first payback from stable payback after a later investment', () => {
    const result = timeline({
      horizonMonths: 6,
      operatingCashFlow: 100,
      investments: [
        { id: 'initial', name: 'Старт', monthIndex: 0, amount: 50, comment: '' },
        { id: 'expansion', name: 'Расширение', monthIndex: 3, amount: 400, comment: '' },
      ],
    });

    expect(result.points.map((point) => point.projectCashPosition)).toEqual([
      50,
      150,
      250,
      -50,
      50,
      150,
    ]);
    expect(result.firstPaybackMonthIndex).toBe(0);
    expect(result.stablePaybackMonthIndex).toBe(4);
  });

  it('does not report payback when no capital investment exists', () => {
    const result = timeline({ investments: [] });

    expect(result.points[0].projectCashPosition).toBe(100);
    expect(result.firstPaybackMonthIndex).toBeNull();
    expect(result.stablePaybackMonthIndex).toBeNull();
  });

  it('returns no payback when the cash position stays negative', () => {
    const result = timeline({
      horizonMonths: 3,
      operatingCashFlow: 100,
      investments: [
        { id: 'initial', name: 'Старт', monthIndex: 0, amount: 1_000, comment: '' },
      ],
    });

    expect(result.firstPaybackMonthIndex).toBeNull();
    expect(result.stablePaybackMonthIndex).toBeNull();
  });

  it.each([
    [
      'rejects a fractional horizon',
      { horizonMonths: 1.5 },
      'Горизонт расчёта должен быть целым числом от 1 до 600 месяцев.',
    ],
    [
      'rejects a horizon above the supported limit',
      { horizonMonths: 601 },
      'Горизонт расчёта должен быть целым числом от 1 до 600 месяцев.',
    ],
    [
      'rejects a non-finite monthly flow',
      { operatingCashFlow: Number.NaN },
      'Денежный поток за месяц должен быть конечным числом.',
    ],
  ])('%s', (_name, overrides, message) => {
    expect(() => timeline(overrides)).toThrow(message);
  });

  it('rejects an investment outside the calculation horizon', () => {
    expect(() => timeline({
      horizonMonths: 3,
      investments: [
        { id: 'future', name: 'Будущее расширение', monthIndex: 3, amount: 100, comment: '' },
      ],
    })).toThrow('Месяц вложения «Будущее расширение» должен быть целым числом от 0 до 2.');
  });

  it('rejects a negative investment amount', () => {
    expect(() => timeline({
      investments: [
        { id: 'refund', name: 'Возврат', monthIndex: 0, amount: -1, comment: '' },
      ],
    })).toThrow('Сумма вложения «Возврат» должна быть конечным неотрицательным числом.');
  });
});
