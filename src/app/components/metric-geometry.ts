import type { MetricBehavior } from '../../core/model';

export type BuilderMetricBehavior = Extract<MetricBehavior, 'stock' | 'flow' | 'rate'>;

export interface MetricCardSize {
  width: number;
  height: number;
  borderRadius: number;
}

export interface MetricCardBounds extends MetricCardSize {
  x: number;
  y: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export type MetricPortSide = 'input' | 'output';

const METRIC_CARD_SIZES: Record<BuilderMetricBehavior, MetricCardSize> = {
  stock: {
    width: 272,
    height: 272,
    borderRadius: 14,
  },
  flow: {
    width: 272,
    height: 112,
    borderRadius: 14,
  },
  rate: {
    width: 224,
    height: 88,
    borderRadius: 18,
  },
};

export function getMetricCardSize(behavior: MetricBehavior): MetricCardSize {
  if (behavior === 'stock' || behavior === 'rate') return METRIC_CARD_SIZES[behavior];
  return METRIC_CARD_SIZES.flow;
}

export function getMetricCardBounds(
  position: { x: number; y: number },
  behavior: MetricBehavior,
): MetricCardBounds {
  const size = getMetricCardSize(behavior);
  return {
    ...position,
    ...size,
    right: position.x + size.width,
    bottom: position.y + size.height,
    centerX: position.x + size.width / 2,
    centerY: position.y + size.height / 2,
  };
}

export function getMetricPortPosition(
  position: { x: number; y: number },
  behavior: MetricBehavior,
  side: MetricPortSide,
): { x: number; y: number } {
  const bounds = getMetricCardBounds(position, behavior);
  return {
    x: side === 'input' ? bounds.x : bounds.right,
    y: bounds.centerY,
  };
}
