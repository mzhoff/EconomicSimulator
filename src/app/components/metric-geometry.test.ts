import { describe, expect, it } from 'vitest';
import {
  getMetricCardBounds,
  getMetricCardSize,
  getMetricPortPosition,
} from './metric-geometry';

describe('metric card geometry', () => {
  it('uses a large square for Stock', () => {
    expect(getMetricCardSize('stock')).toEqual({
      width: 272,
      height: 272,
      borderRadius: 14,
    });
  });

  it('uses a compact rectangle for Flow', () => {
    expect(getMetricCardSize('flow')).toEqual({
      width: 272,
      height: 112,
      borderRadius: 14,
    });
  });

  it('uses the smallest and roundest card for Rate', () => {
    expect(getMetricCardSize('rate')).toEqual({
      width: 224,
      height: 88,
      borderRadius: 18,
    });
  });

  it('uses a ticket-like intermediate size for One-off', () => {
    expect(getMetricCardSize('one_off')).toEqual({
      width: 248,
      height: 104,
      borderRadius: 14,
    });
  });

  it('places connection ports in the vertical center of each card', () => {
    expect(getMetricCardBounds({ x: 100, y: 40 }, 'rate')).toMatchObject({
      right: 324,
      bottom: 128,
      centerX: 212,
      centerY: 84,
    });
    expect(getMetricPortPosition({ x: 100, y: 40 }, 'rate', 'input')).toEqual({
      x: 100,
      y: 84,
    });
    expect(getMetricPortPosition({ x: 100, y: 40 }, 'rate', 'output')).toEqual({
      x: 324,
      y: 84,
    });
  });
});
