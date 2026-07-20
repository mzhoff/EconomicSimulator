import { describe, expect, it } from 'vitest';
import type { UnitSpec } from './model';
import { upgradeUniversalUnits } from './migration';
import { validateWorkspaceDocument } from './schema';
import { createWorkspaceDocument } from './storage';
import { createTokBeriModel } from './tokberi-template';
import {
  ITEM,
  RUB,
  divideUnits,
  multiplyUnits,
  normalizeUniversalUnit,
  unitFromPreset,
  unitPresetFromUnit,
  unitsEqual,
} from './units';

describe('universal units', () => {
  it('normalizes domain-specific counters to generic pieces', () => {
    const legacyCounts: UnitSpec[] = [
      { symbol: 'аренд', dimensions: { 'count:rental': 1 } },
      { symbol: 'батарей', dimensions: { 'count:powerbank': 1 } },
      { symbol: 'слотов', dimensions: { 'count:slot': 1 } },
      { symbol: 'циклов', dimensions: { 'count:cycle': 1 } },
    ];

    for (const legacy of legacyCounts) {
      expect(normalizeUniversalUnit(legacy)).toEqual(ITEM);
    }
  });

  it('composes Rate units and cancels matching dimensions algebraically', () => {
    const pricePerItem = unitFromPreset('rub/items');
    const monthlyRate = unitFromPreset('rub/people/months');
    const itemsPerDay = unitFromPreset('items/days');
    const frequency = unitFromPreset('ratio/months');

    expect(pricePerItem.symbol).toBe('₽/шт.');
    expect(monthlyRate.symbol).toBe('₽/чел./мес.');
    expect(itemsPerDay.symbol).toBe('шт./дн.');
    expect(frequency.symbol).toBe('x/мес.');
    expect(multiplyUnits(pricePerItem, ITEM)).toEqual(RUB);
    expect(divideUnits(ITEM, ITEM).dimensions).toEqual({});
    expect(unitPresetFromUnit(monthlyRate)).toBe('rub/people/months');
    expect(unitsEqual(
      { symbol: 'ignored', dimensions: { 'time:month': -1, 'currency:RUB': 1 } },
      { symbol: 'also ignored', dimensions: { 'currency:RUB': 1, 'time:month': -1 } },
    )).toBe(true);
  });

  it('upgrades an old workspace without invalidating its formulas', () => {
    const workspace = createWorkspaceDocument(createTokBeriModel());
    workspace.model.metrics.rentals_per_day.unit = {
      symbol: 'аренд/день',
      dimensions: { 'count:rental': 1, 'time:day': -1 },
    };
    workspace.model.metrics.successful_rentals.unit = {
      symbol: 'аренд',
      dimensions: { 'count:rental': 1 },
    };
    workspace.model.metrics.average_check.unit = {
      symbol: '₽/аренду',
      dimensions: { 'currency:RUB': 1, 'count:rental': -1 },
    };

    const upgraded = upgradeUniversalUnits(workspace);

    expect(upgraded.changed).toBe(true);
    expect(upgraded.workspace.model.metrics.rentals_per_day.unit)
      .toEqual(unitFromPreset('items/days'));
    expect(upgraded.workspace.model.metrics.successful_rentals.unit).toEqual(ITEM);
    expect(upgraded.workspace.model.metrics.average_check.unit)
      .toEqual(unitFromPreset('rub/items'));
    expect(validateWorkspaceDocument(upgraded.workspace)).toMatchObject({ ok: true });
  });
});
