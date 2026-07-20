import type { CanvasPoint } from './infinite-canvas';
import type { MetricPortSide } from './metric-geometry';

export type EdgeLineStyle = 'curved' | 'orthogonal' | 'straight';

const rounded = (value: number): number => Math.round(value * 10) / 10;

const SIDE_VECTORS: Record<MetricPortSide, CanvasPoint> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

export function getPortSideVector(side: MetricPortSide): CanvasPoint {
  return SIDE_VECTORS[side];
}

export function oppositeMetricPortSide(side: MetricPortSide): MetricPortSide {
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  if (side === 'top') return 'bottom';
  return 'top';
}

function straightPath(start: CanvasPoint, end: CanvasPoint): string {
  return `M ${rounded(start.x)} ${rounded(start.y)} L ${rounded(end.x)} ${rounded(end.y)}`;
}

function curvedPath(
  start: CanvasPoint,
  end: CanvasPoint,
  sourceSide: MetricPortSide,
  targetSide: MetricPortSide,
  scale: number,
): string {
  const sourceVector = getPortSideVector(sourceSide);
  const targetVector = getPortSideVector(targetSide);
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const handle = Math.min(260 / scale, Math.max(40 / scale, distance * 0.42));
  const control1 = {
    x: start.x + sourceVector.x * handle,
    y: start.y + sourceVector.y * handle,
  };
  const control2 = {
    x: end.x + targetVector.x * handle,
    y: end.y + targetVector.y * handle,
  };

  return [
    `M ${rounded(start.x)} ${rounded(start.y)}`,
    `C ${rounded(control1.x)} ${rounded(control1.y)},`,
    `${rounded(control2.x)} ${rounded(control2.y)},`,
    `${rounded(end.x)} ${rounded(end.y)}`,
  ].join(' ');
}

function removeRedundantPoints(points: CanvasPoint[]): CanvasPoint[] {
  const unique = points.filter((point, index) => (
    index === 0
    || point.x !== points[index - 1]!.x
    || point.y !== points[index - 1]!.y
  ));

  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true;
    const previous = unique[index - 1]!;
    const next = unique[index + 1]!;
    const vertical = previous.x === point.x && point.x === next.x;
    const horizontal = previous.y === point.y && point.y === next.y;
    return !vertical && !horizontal;
  });
}

function orthogonalPoints(
  start: CanvasPoint,
  end: CanvasPoint,
  sourceSide: MetricPortSide,
  targetSide: MetricPortSide,
  scale: number,
): CanvasPoint[] {
  const sourceVector = getPortSideVector(sourceSide);
  const targetVector = getPortSideVector(targetSide);
  const lead = 28 / scale;
  const sourceLead = {
    x: start.x + sourceVector.x * lead,
    y: start.y + sourceVector.y * lead,
  };
  const targetLead = {
    x: end.x + targetVector.x * lead,
    y: end.y + targetVector.y * lead,
  };
  const sourceHorizontal = sourceVector.x !== 0;
  const targetHorizontal = targetVector.x !== 0;

  if (sourceHorizontal && targetHorizontal) {
    const middleX = (sourceLead.x + targetLead.x) / 2;
    return removeRedundantPoints([
      start,
      sourceLead,
      { x: middleX, y: sourceLead.y },
      { x: middleX, y: targetLead.y },
      targetLead,
      end,
    ]);
  }

  if (!sourceHorizontal && !targetHorizontal) {
    const middleY = (sourceLead.y + targetLead.y) / 2;
    return removeRedundantPoints([
      start,
      sourceLead,
      { x: sourceLead.x, y: middleY },
      { x: targetLead.x, y: middleY },
      targetLead,
      end,
    ]);
  }

  const corner = sourceHorizontal
    ? { x: targetLead.x, y: sourceLead.y }
    : { x: sourceLead.x, y: targetLead.y };
  return removeRedundantPoints([start, sourceLead, corner, targetLead, end]);
}

function orthogonalPath(
  start: CanvasPoint,
  end: CanvasPoint,
  sourceSide: MetricPortSide,
  targetSide: MetricPortSide,
  scale: number,
): string {
  const points = orthogonalPoints(start, end, sourceSide, targetSide, scale);
  if (points.length < 2) return straightPath(start, end);

  const commands = [`M ${rounded(points[0]!.x)} ${rounded(points[0]!.y)}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const radius = Math.min(
      12 / scale,
      Math.hypot(current.x - previous.x, current.y - previous.y) / 2,
      Math.hypot(next.x - current.x, next.y - current.y) / 2,
    );
    const entry = {
      x: current.x + (previous.x - current.x) * radius / Math.max(1, Math.hypot(previous.x - current.x, previous.y - current.y)),
      y: current.y + (previous.y - current.y) * radius / Math.max(1, Math.hypot(previous.x - current.x, previous.y - current.y)),
    };
    const exit = {
      x: current.x + (next.x - current.x) * radius / Math.max(1, Math.hypot(next.x - current.x, next.y - current.y)),
      y: current.y + (next.y - current.y) * radius / Math.max(1, Math.hypot(next.x - current.x, next.y - current.y)),
    };
    commands.push(
      `L ${rounded(entry.x)} ${rounded(entry.y)}`,
      `Q ${rounded(current.x)} ${rounded(current.y)} ${rounded(exit.x)} ${rounded(exit.y)}`,
    );
  }
  const last = points[points.length - 1]!;
  commands.push(`L ${rounded(last.x)} ${rounded(last.y)}`);
  return commands.join(' ');
}

export function getConnectionPath(
  start: CanvasPoint,
  end: CanvasPoint,
  sourceSide: MetricPortSide,
  targetSide: MetricPortSide,
  lineStyle: EdgeLineStyle,
  scale = 1,
): string {
  const safeScale = Math.max(scale, 0.05);
  if (lineStyle === 'straight') return straightPath(start, end);
  if (lineStyle === 'orthogonal') {
    return orthogonalPath(start, end, sourceSide, targetSide, safeScale);
  }
  return curvedPath(start, end, sourceSide, targetSide, safeScale);
}
