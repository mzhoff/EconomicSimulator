import { getCalculationRelations } from './evaluator';
import type { MetricBehavior, ModelState, UnitSpec } from './model';

export function behaviorLabel(behavior: MetricBehavior): string {
  if (behavior === 'one_off') return 'One-off';
  return behavior[0].toUpperCase() + behavior.slice(1);
}

export function autoLayout(model: ModelState): Record<string, { x: number; y: number }> {
  const ids = Object.keys(model.metrics);
  const parents = new Map<string, string[]>();
  for (const relation of getCalculationRelations(model)) {
    const list = parents.get(relation.to) ?? [];
    list.push(relation.from);
    parents.set(relation.to, list);
  }

  const levels = new Map<string, number>();
  const getLevel = (id: string, path = new Set<string>()): number => {
    const cached = levels.get(id);
    if (cached !== undefined) return cached;
    if (path.has(id)) return 0;
    const nextPath = new Set(path).add(id);
    const dependencies = parents.get(id) ?? [];
    const level = dependencies.length === 0
      ? 0
      : Math.max(...dependencies.map((dependency) => getLevel(dependency, nextPath))) + 1;
    levels.set(id, level);
    return level;
  };
  ids.forEach((id) => getLevel(id));

  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const level = levels.get(id) ?? 0;
    const list = byLevel.get(level) ?? [];
    list.push(id);
    byLevel.set(level, list);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  for (const [level, levelIds] of [...byLevel.entries()].sort(([left], [right]) => left - right)) {
    let nextY = 70;
    levelIds
      .sort((left, right) => {
        const leftDomain = model.metrics[left].domainIds[0] ?? '';
        const rightDomain = model.metrics[right].domainIds[0] ?? '';
        return leftDomain.localeCompare(rightDomain);
      })
      .forEach((id) => {
        const behavior = model.metrics[id].behavior;
        const height = behavior === 'stock'
          ? 224
          : behavior === 'rate'
            ? 88
            : behavior === 'one_off'
              ? 104
              : 136;
        positions[id] = { x: 60 + level * 360, y: nextY };
        nextY += height + 40;
      });
  }
  return positions;
}

const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

export function fmt(value: number | null, unit: UnitSpec): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (unit.symbol === '%') return `${numberFormatter.format(value * 100)}%`;
  if (unit.dimensions['currency:RUB'] === 1 && Object.keys(unit.dimensions).length === 1) {
    return currencyFormatter.format(value);
  }
  if (unit.symbol === 'x') return `${numberFormatter.format(value)}×`;
  return `${numberFormatter.format(value)} ${unit.symbol}`.trim();
}
