import type { UnitSpec } from './model';

export const DIMENSIONLESS: UnitSpec = { symbol: 'x', dimensions: {} };
export const PERCENT: UnitSpec = { symbol: '%', dimensions: {} };
export const RUB: UnitSpec = { symbol: '₽', dimensions: { 'currency:RUB': 1 } };
export const MONTH: UnitSpec = { symbol: 'мес.', dimensions: { 'time:month': 1 } };
export const DAY: UnitSpec = { symbol: 'дн.', dimensions: { 'time:day': 1 } };
export const RENTAL: UnitSpec = { symbol: 'аренд', dimensions: { 'count:rental': 1 } };
export const POWERBANK: UnitSpec = { symbol: 'шт.', dimensions: { 'count:powerbank': 1 } };
export const SLOT: UnitSpec = { symbol: 'слотов', dimensions: { 'count:slot': 1 } };
export const CYCLE: UnitSpec = { symbol: 'циклов', dimensions: { 'count:cycle': 1 } };

export const RENTAL_PER_DAY: UnitSpec = {
  symbol: 'аренд/день',
  dimensions: { 'count:rental': 1, 'time:day': -1 },
};
export const RUB_PER_RENTAL: UnitSpec = {
  symbol: '₽/аренду',
  dimensions: { 'currency:RUB': 1, 'count:rental': -1 },
};
export const RUB_PER_POWERBANK: UnitSpec = {
  symbol: '₽/батарею',
  dimensions: { 'currency:RUB': 1, 'count:powerbank': -1 },
};
export const CYCLE_PER_RENTAL: UnitSpec = {
  symbol: 'цикл/аренду',
  dimensions: { 'count:cycle': 1, 'count:rental': -1 },
};
export const CYCLE_PER_POWERBANK: UnitSpec = {
  symbol: 'циклов/батарею',
  dimensions: { 'count:cycle': 1, 'count:powerbank': -1 },
};

function normalizedDimensions(dimensions: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(dimensions)
      .filter(([, exponent]) => Math.abs(exponent) > 1e-12)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function unitsEqual(left: UnitSpec, right: UnitSpec): boolean {
  return JSON.stringify(normalizedDimensions(left.dimensions)) === JSON.stringify(normalizedDimensions(right.dimensions));
}

export function multiplyUnits(left: UnitSpec, right: UnitSpec): UnitSpec {
  const dimensions = { ...left.dimensions };
  for (const [key, exponent] of Object.entries(right.dimensions)) {
    dimensions[key] = (dimensions[key] ?? 0) + exponent;
  }
  return { symbol: `${left.symbol}·${right.symbol}`, dimensions: normalizedDimensions(dimensions) };
}

export function divideUnits(left: UnitSpec, right: UnitSpec): UnitSpec {
  const dimensions = { ...left.dimensions };
  for (const [key, exponent] of Object.entries(right.dimensions)) {
    dimensions[key] = (dimensions[key] ?? 0) - exponent;
  }
  return { symbol: `${left.symbol}/${right.symbol}`, dimensions: normalizedDimensions(dimensions) };
}

export function isDimensionless(unit: UnitSpec): boolean {
  return Object.keys(normalizedDimensions(unit.dimensions)).length === 0;
}

export function isDuration(unit: UnitSpec): boolean {
  const entries = Object.entries(normalizedDimensions(unit.dimensions));
  return entries.length === 1 && entries[0][0].startsWith('time:') && entries[0][1] === 1;
}

export function describeUnit(unit: UnitSpec): string {
  return unit.symbol || 'без единицы';
}

export function unitFromPreset(preset: string): UnitSpec {
  switch (preset) {
    case 'rub':
      return RUB;
    case 'percent':
      return PERCENT;
    case 'rentals':
      return RENTAL;
    case 'rentals_per_day':
      return RENTAL_PER_DAY;
    case 'powerbanks':
      return POWERBANK;
    case 'months':
      return MONTH;
    default:
      return DIMENSIONLESS;
  }
}
