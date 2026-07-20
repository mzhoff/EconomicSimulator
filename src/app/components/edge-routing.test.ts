import { describe, expect, it } from 'vitest';
import { getConnectionPath } from './edge-routing';

describe('edge routing', () => {
  const start = { x: 100, y: 200 };
  const end = { x: 300, y: 50 };

  it('builds a cubic Bezier with controls leaving the selected faces', () => {
    expect(getConnectionPath(start, end, 'top', 'bottom', 'curved')).toMatch(
      /^M 100 200 C 100 [\d.]+, 300 [\d.]+, 300 50$/,
    );
  });

  it('builds a rounded orthogonal route', () => {
    const path = getConnectionPath(start, end, 'top', 'bottom', 'orthogonal');
    expect(path).toContain(' Q ');
    expect(path).not.toContain(' C ');
  });

  it('builds a direct line', () => {
    expect(getConnectionPath(start, end, 'top', 'bottom', 'straight')).toBe(
      'M 100 200 L 300 50',
    );
  });
});
