import type { UnitSpec } from './model';

export interface UnitPresetOption {
  value: string;
  label: string;
}

export const DIMENSIONLESS: UnitSpec = { symbol: 'x', dimensions: {} };
export const PERCENT: UnitSpec = { symbol: '%', dimensions: {} };
export const RUB: UnitSpec = { symbol: '₽', dimensions: { 'currency:RUB': 1 } };
export const USD: UnitSpec = { symbol: '$', dimensions: { 'currency:USD': 1 } };
export const ITEM: UnitSpec = { symbol: 'шт.', dimensions: { 'count:item': 1 } };
export const PERSON: UnitSpec = { symbol: 'чел.', dimensions: { 'count:person': 1 } };
export const SECOND: UnitSpec = { symbol: 'сек.', dimensions: { 'time:second': 1 } };
export const MINUTE: UnitSpec = { symbol: 'мин.', dimensions: { 'time:minute': 1 } };
export const HOUR: UnitSpec = { symbol: 'ч.', dimensions: { 'time:hour': 1 } };
export const DAY: UnitSpec = { symbol: 'дн.', dimensions: { 'time:day': 1 } };
export const WEEK: UnitSpec = { symbol: 'нед.', dimensions: { 'time:week': 1 } };
export const MONTH: UnitSpec = { symbol: 'мес.', dimensions: { 'time:month': 1 } };
export const YEAR: UnitSpec = { symbol: 'год', dimensions: { 'time:year': 1 } };

export const BASE_UNIT_OPTIONS: UnitPresetOption[] = [
  { value: 'rub', label: '₽ — рубли' },
  { value: 'usd', label: '$ — доллары' },
  { value: 'items', label: 'шт. — штуки' },
  { value: 'people', label: 'чел. — люди' },
  { value: 'seconds', label: 'секунды' },
  { value: 'minutes', label: 'минуты' },
  { value: 'hours', label: 'часы' },
  { value: 'days', label: 'дни' },
  { value: 'weeks', label: 'недели' },
  { value: 'months', label: 'месяцы' },
  { value: 'years', label: 'годы' },
  { value: 'percent', label: '% — проценты' },
  { value: 'ratio', label: 'Безразмерная' },
];

export const RATE_DENOMINATOR_OPTIONS: UnitPresetOption[] = [
  { value: 'rub', label: '₽ — рубли' },
  { value: 'usd', label: '$ — доллары' },
  { value: 'items', label: 'шт. — штуки' },
  { value: 'people', label: 'чел. — люди' },
  { value: 'seconds', label: 'секунду' },
  { value: 'minutes', label: 'минуту' },
  { value: 'hours', label: 'час' },
  { value: 'days', label: 'день' },
  { value: 'weeks', label: 'неделю' },
  { value: 'months', label: 'месяц' },
  { value: 'years', label: 'год' },
];

function normalizedDimensions(dimensions: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(dimensions)
      .filter(([, exponent]) => Math.abs(exponent) > 1e-12)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function baseUnitFromPreset(preset: string): UnitSpec {
  switch (preset) {
    case 'rub':
      return RUB;
    case 'usd':
      return USD;
    case 'items':
      return ITEM;
    case 'people':
      return PERSON;
    case 'seconds':
      return SECOND;
    case 'minutes':
      return MINUTE;
    case 'hours':
      return HOUR;
    case 'days':
      return DAY;
    case 'weeks':
      return WEEK;
    case 'months':
      return MONTH;
    case 'years':
      return YEAR;
    case 'percent':
      return PERCENT;
    default:
      return DIMENSIONLESS;
  }
}

function dimensionSymbol(key: string): string {
  if (key === 'currency:RUB') return '₽';
  if (key === 'currency:USD') return '$';
  if (key === 'count:person') return 'чел.';
  if (key.startsWith('count:')) return 'шт.';
  if (key === 'time:second') return 'сек.';
  if (key === 'time:minute') return 'мин.';
  if (key === 'time:hour') return 'ч.';
  if (key === 'time:day') return 'дн.';
  if (key === 'time:week') return 'нед.';
  if (key === 'time:month') return 'мес.';
  if (key === 'time:year') return 'год';
  return key;
}

function symbolFromDimensions(
  dimensions: Record<string, number>,
  dimensionSource: Record<string, number> = dimensions,
): string {
  const numerator: string[] = [];
  const denominator: string[] = [];
  for (const [key, exponent] of Object.entries(normalizedDimensions(dimensionSource))) {
    const target = exponent > 0 ? numerator : denominator;
    for (let index = 0; index < Math.abs(exponent); index += 1) {
      target.push(dimensionSymbol(key));
    }
  }
  if (numerator.length === 0 && denominator.length === 0) return 'x';
  const numeratorSymbol = numerator.join('·') || '1';
  return denominator.length > 0
    ? `${numeratorSymbol}/${denominator.join('/')}`
    : numeratorSymbol;
}

function composeUnit(numeratorPreset: string, denominatorPresets: string[]): UnitSpec {
  const numerator = baseUnitFromPreset(numeratorPreset);
  const dimensions = { ...numerator.dimensions };
  const denominatorUnits = denominatorPresets.map(baseUnitFromPreset);
  for (const denominator of denominatorUnits) {
    for (const [key, exponent] of Object.entries(denominator.dimensions)) {
      dimensions[key] = (dimensions[key] ?? 0) - exponent;
    }
  }
  return {
    symbol: [numerator.symbol, ...denominatorUnits.map((unit) => unit.symbol)].join('/'),
    dimensions: normalizedDimensions(dimensions),
  };
}

const SYMBOL_TO_PRESET: Record<string, string> = {
  '₽': 'rub',
  '$': 'usd',
  'шт.': 'items',
  шт: 'items',
  аренд: 'items',
  аренду: 'items',
  аренды: 'items',
  батарей: 'items',
  батарею: 'items',
  слотов: 'items',
  циклов: 'items',
  цикл: 'items',
  'чел.': 'people',
  чел: 'people',
  'сек.': 'seconds',
  сек: 'seconds',
  'мин.': 'minutes',
  мин: 'minutes',
  'ч.': 'hours',
  час: 'hours',
  'дн.': 'days',
  день: 'days',
  'мес.': 'months',
  месяц: 'months',
  'нед.': 'weeks',
  неделя: 'weeks',
  год: 'years',
  '%': 'percent',
  x: 'ratio',
};

export function unitsEqual(left: UnitSpec, right: UnitSpec): boolean {
  return JSON.stringify(normalizedDimensions(left.dimensions))
    === JSON.stringify(normalizedDimensions(right.dimensions));
}

export function multiplyUnits(left: UnitSpec, right: UnitSpec): UnitSpec {
  const dimensions = { ...left.dimensions };
  for (const [key, exponent] of Object.entries(right.dimensions)) {
    dimensions[key] = (dimensions[key] ?? 0) + exponent;
  }
  const normalized = normalizedDimensions(dimensions);
  return { symbol: symbolFromDimensions(normalized), dimensions: normalized };
}

export function divideUnits(left: UnitSpec, right: UnitSpec): UnitSpec {
  const dimensions = { ...left.dimensions };
  for (const [key, exponent] of Object.entries(right.dimensions)) {
    dimensions[key] = (dimensions[key] ?? 0) - exponent;
  }
  const normalized = normalizedDimensions(dimensions);
  return { symbol: symbolFromDimensions(normalized), dimensions: normalized };
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
  const legacyPresetMap: Record<string, string> = {
    rub_per_rental: 'rub/items',
    rub_per_powerbank: 'rub/items',
    rentals: 'items',
    rentals_per_day: 'items/days',
    powerbanks: 'items',
    slots: 'items',
    cycles: 'items',
    cycles_per_rental: 'items/items',
    cycles_per_powerbank: 'items/items',
    rub_per_person_month: 'rub/people/months',
  };
  const normalizedPreset = legacyPresetMap[preset] ?? preset;
  const [numeratorPreset, ...denominatorPresets] = normalizedPreset.split('/');
  return denominatorPresets.length > 0
    ? composeUnit(numeratorPreset, denominatorPresets)
    : baseUnitFromPreset(numeratorPreset);
}

export function unitPresetFromUnit(unit: UnitSpec): string {
  const parts = unit.symbol
    .split('/')
    .map((part) => SYMBOL_TO_PRESET[part.trim()])
    .filter((part): part is string => Boolean(part));
  if (parts.length > 0 && parts.length === unit.symbol.split('/').length) {
    return parts.join('/');
  }

  const numerator: string[] = [];
  const denominator: string[] = [];
  for (const [key, exponent] of Object.entries(normalizedDimensions(unit.dimensions))) {
    const preset = key === 'currency:RUB'
      ? 'rub'
      : key === 'currency:USD'
        ? 'usd'
        : key === 'count:person'
          ? 'people'
          : key.startsWith('count:')
            ? 'items'
            : key === 'time:second'
              ? 'seconds'
              : key === 'time:minute'
                ? 'minutes'
                : key === 'time:hour'
                  ? 'hours'
                  : key === 'time:day'
                    ? 'days'
                    : key === 'time:week'
                      ? 'weeks'
                      : key === 'time:month'
                        ? 'months'
                        : key === 'time:year'
                          ? 'years'
                          : 'ratio';
    const target = exponent > 0 ? numerator : denominator;
    for (let index = 0; index < Math.abs(exponent); index += 1) target.push(preset);
  }
  if (numerator.length === 0 && denominator.length === 0) {
    return unit.symbol === '%' ? 'percent' : 'ratio';
  }
  return [...(numerator.length > 0 ? numerator : ['ratio']), ...denominator].join('/');
}

export function normalizeUniversalUnit(unit: UnitSpec): UnitSpec {
  if (unit.symbol === '%') return PERCENT;
  if (unit.symbol === 'x' && Object.keys(unit.dimensions).length === 0) return DIMENSIONLESS;

  const dimensions: Record<string, number> = {};
  for (const [key, exponent] of Object.entries(unit.dimensions)) {
    const normalizedKey = key.startsWith('count:') && key !== 'count:person'
      ? 'count:item'
      : key;
    dimensions[normalizedKey] = (dimensions[normalizedKey] ?? 0) + exponent;
  }
  const normalized = normalizedDimensions(dimensions);
  const preset = unitPresetFromUnit(unit);
  const presetUnit = unitFromPreset(preset);
  return {
    symbol: presetUnit.symbol === 'x'
      ? symbolFromDimensions(normalized, unit.dimensions)
      : presetUnit.symbol,
    dimensions: normalized,
  };
}

export const ITEM_PER_DAY = unitFromPreset('items/days');
export const RUB_PER_ITEM = unitFromPreset('rub/items');
export const ITEM_PER_ITEM = unitFromPreset('items/items');
export const RUB_PER_PERSON_MONTH = unitFromPreset('rub/people/months');

// Legacy names remain aliases so old templates and imports receive universal units.
export const RENTAL = ITEM;
export const POWERBANK = ITEM;
export const SLOT = ITEM;
export const CYCLE = ITEM;
export const RENTAL_PER_DAY = ITEM_PER_DAY;
export const RUB_PER_RENTAL = RUB_PER_ITEM;
export const RUB_PER_POWERBANK = RUB_PER_ITEM;
export const CYCLE_PER_RENTAL = ITEM_PER_ITEM;
export const CYCLE_PER_POWERBANK = ITEM_PER_ITEM;
