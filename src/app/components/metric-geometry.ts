import type { MetricBehavior } from '../../core/model';

export type BuilderMetricBehavior = Extract<MetricBehavior, 'stock' | 'flow' | 'rate' | 'one_off'>;

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

export type MetricPortSide = 'left' | 'right' | 'top' | 'bottom';

export const METRIC_PORT_SIDES: MetricPortSide[] = ['left', 'right', 'top', 'bottom'];

const METRIC_CARD_SIZES: Record<BuilderMetricBehavior, MetricCardSize> = {
  stock: {
    width: 272,
    height: 224,
    borderRadius: 14,
  },
  flow: {
    width: 272,
    height: 156,
    borderRadius: 14,
  },
  rate: {
    width: 224,
    height: 104,
    borderRadius: 18,
  },
  one_off: {
    width: 248,
    height: 124,
    borderRadius: 14,
  },
};

export function getMetricCardSize(behavior: MetricBehavior): MetricCardSize {
  return METRIC_CARD_SIZES[behavior];
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
  if (side === 'left') return { x: bounds.x, y: bounds.centerY };
  if (side === 'right') return { x: bounds.right, y: bounds.centerY };
  if (side === 'top') return { x: bounds.centerX, y: bounds.y };
  return { x: bounds.centerX, y: bounds.bottom };
}

export function getSmartMetricPorts(
  sourcePosition: { x: number; y: number },
  sourceBehavior: MetricBehavior,
  targetPosition: { x: number; y: number },
  targetBehavior: MetricBehavior,
): {
  source: { side: MetricPortSide; point: { x: number; y: number } };
  target: { side: MetricPortSide; point: { x: number; y: number } };
} {
  const sourceBounds = getMetricCardBounds(sourcePosition, sourceBehavior);
  const targetBounds = getMetricCardBounds(targetPosition, targetBehavior);
  const deltaX = targetBounds.centerX - sourceBounds.centerX;
  const deltaY = targetBounds.centerY - sourceBounds.centerY;
  const normalizedX = Math.abs(deltaX) / Math.max(1, (sourceBounds.width + targetBounds.width) / 2);
  const normalizedY = Math.abs(deltaY) / Math.max(1, (sourceBounds.height + targetBounds.height) / 2);

  const [sourceSide, targetSide]: [MetricPortSide, MetricPortSide] = normalizedX >= normalizedY
    ? deltaX >= 0
      ? ['right', 'left']
      : ['left', 'right']
    : deltaY >= 0
      ? ['bottom', 'top']
      : ['top', 'bottom'];

  return {
    source: {
      side: sourceSide,
      point: getMetricPortPosition(sourcePosition, sourceBehavior, sourceSide),
    },
    target: {
      side: targetSide,
      point: getMetricPortPosition(targetPosition, targetBehavior, targetSide),
    },
  };
}
