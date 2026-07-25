import { describe, expect, it } from 'vitest';
import {
  getMetricCardBounds,
  getMetricCardSize,
  getMetricPortPosition,
  getSmartMetricPorts,
} from './metric-geometry';

describe('metric card geometry', () => {
  it('uses a compact near-square for Stock', () => {
    expect(getMetricCardSize('stock')).toEqual({
      width: 272,
      height: 224,
      borderRadius: 14,
    });
  });

  it('gives Flow enough height for a wrapped formula', () => {
    expect(getMetricCardSize('flow')).toEqual({
      width: 272,
      height: 156,
      borderRadius: 14,
    });
  });

  it('uses the smallest and roundest card for Rate', () => {
    expect(getMetricCardSize('rate')).toEqual({
      width: 224,
      height: 104,
      borderRadius: 18,
    });
  });

  it('uses a ticket-like intermediate size for One-off', () => {
    expect(getMetricCardSize('one_off')).toEqual({
      width: 248,
      height: 124,
      borderRadius: 14,
    });
  });

  it('places connection ports on all four card faces', () => {
    expect(getMetricCardBounds({ x: 100, y: 40 }, 'rate')).toMatchObject({
      right: 324,
      bottom: 144,
      centerX: 212,
      centerY: 92,
    });
    expect(getMetricPortPosition({ x: 100, y: 40 }, 'rate', 'left')).toEqual({
      x: 100,
      y: 92,
    });
    expect(getMetricPortPosition({ x: 100, y: 40 }, 'rate', 'right')).toEqual({
      x: 324,
      y: 92,
    });
    expect(getMetricPortPosition({ x: 100, y: 40 }, 'rate', 'top')).toEqual({
      x: 212,
      y: 40,
    });
    expect(getMetricPortPosition({ x: 100, y: 40 }, 'rate', 'bottom')).toEqual({
      x: 212,
      y: 144,
    });
  });

  it('chooses ports from the relative card positions', () => {
    const vertical = getSmartMetricPorts(
      { x: 100, y: 300 },
      'flow',
      { x: 100, y: 20 },
      'flow',
    );
    expect(vertical.source.side).toBe('top');
    expect(vertical.target.side).toBe('bottom');

    const horizontal = getSmartMetricPorts(
      { x: 100, y: 100 },
      'rate',
      { x: 600, y: 140 },
      'flow',
    );
    expect(horizontal.source.side).toBe('right');
    expect(horizontal.target.side).toBe('left');
  });
});
