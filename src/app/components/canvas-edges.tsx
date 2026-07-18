import { memo, useMemo } from 'react';
import type { Edge, GraphFocusState, MetricDef } from './metric-engine';

const CARD_WIDTH = 272;
const CARD_HEIGHT = 112;

const COLORS = {
  calculation: '#94a3b8',
  backbone: '#64748b',
  influence: '#8b5cf6',
  upstream: '#0284c7',
  downstream: '#7c3aed',
  connecting: '#0f766e',
  positive: '#059669',
  negative: '#dc2626',
  neutralImpact: '#64748b',
  warning: '#d97706',
  error: '#dc2626',
} as const;

interface CanvasEdgesProps {
  edges: Edge[];
  metrics: Record<string, MetricDef>;
  focus: GraphFocusState;
  impactDeltas?: Record<string, number>;
  scale: number;
  hoveredEdgeKey: string | null;
  onHoveredEdgeChange: (edge: Edge | null) => void;
}

interface EdgePresentation {
  color: string;
  screenWidth: number;
  opacity: number;
  markerId: keyof typeof MARKER_COLORS;
  dash?: number[];
  label: string;
}

interface ProblemPaths {
  error: Set<string>;
  warning: Set<string>;
}

const MARKER_COLORS = {
  calculation: COLORS.calculation,
  backbone: COLORS.backbone,
  influence: COLORS.influence,
  upstream: COLORS.upstream,
  downstream: COLORS.downstream,
  connecting: COLORS.connecting,
  positive: COLORS.positive,
  negative: COLORS.negative,
  neutralImpact: COLORS.neutralImpact,
  warning: COLORS.warning,
  error: COLORS.error,
} as const;

const edgeKey = (edge: Edge): string => `${edge.from}-${edge.to}`;
const rounded = (value: number): number => Math.round(value * 10) / 10;

function computeProblemPaths(
  edges: Edge[],
  metrics: Record<string, MetricDef>,
  backboneEdges: Set<string>,
): ProblemPaths {
  const calculationEdges = edges.filter((edge) => edge.type === 'calc');
  const adjacency = new Map<string, Edge[]>();
  for (const edge of calculationEdges) {
    const outgoing = adjacency.get(edge.from) ?? [];
    outgoing.push(edge);
    adjacency.set(edge.from, outgoing);
  }

  const pathsForStatus = (status: 'error' | 'warning'): Set<string> => {
    const roots = Object.values(metrics)
      .filter((metric) => metric.validationStatus === status)
      .map((metric) => metric.id);
    const result = new Set<string>();
    const visited = new Set(roots);
    const queue = [...roots];

    for (const edge of edges) {
      if (visited.has(edge.from) || visited.has(edge.to)) result.add(edgeKey(edge));
    }
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of adjacency.get(current) ?? []) {
        const key = edgeKey(edge);
        if (backboneEdges.has(key)) result.add(key);
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
    return result;
  };

  return {
    error: pathsForStatus('error'),
    warning: pathsForStatus('warning'),
  };
}

function connectionPath(x1: number, y1: number, x2: number, y2: number, scale: number): string {
  if (Math.abs(y2 - y1) < 0.5) return `M ${rounded(x1)} ${rounded(y1)} H ${rounded(x2)}`;
  const middleX = (x1 + x2) / 2;
  if (x2 <= x1 + 40 / scale) {
    return `M ${rounded(x1)} ${rounded(y1)} C ${rounded(middleX)} ${rounded(y1)}, ${rounded(middleX)} ${rounded(y2)}, ${rounded(x2)} ${rounded(y2)}`;
  }

  const direction = y2 > y1 ? 1 : -1;
  const radius = Math.min(12 / scale, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 6);
  return [
    `M ${rounded(x1)} ${rounded(y1)}`,
    `H ${rounded(middleX - radius)}`,
    `Q ${rounded(middleX)} ${rounded(y1)} ${rounded(middleX)} ${rounded(y1 + direction * radius)}`,
    `V ${rounded(y2 - direction * radius)}`,
    `Q ${rounded(middleX)} ${rounded(y2)} ${rounded(middleX + radius)} ${rounded(y2)}`,
    `H ${rounded(x2)}`,
  ].join(' ');
}

function edgePresentation(
  edge: Edge,
  metrics: Record<string, MetricDef>,
  focus: GraphFocusState,
  impactDeltas: Record<string, number> | undefined,
  problemPaths: ProblemPaths,
): EdgePresentation {
  const key = edgeKey(edge);
  const fromMetric = metrics[edge.from];
  const toMetric = metrics[edge.to];
  const isDirect = focus.directEdges.has(key);
  const isRelevant = focus.relevantEdges.has(key);
  const hasError = problemPaths.error.has(key);
  const hasWarning = problemPaths.warning.has(key);
  const relationLabel = edge.type === 'influence'
    ? `Influence ${edge.sign >= 0 ? '+' : '−'} · confidence ${edge.confidence}`
    : `Calculation → ${toMetric?.name ?? edge.to}`;

  if (hasError) {
    return { color: COLORS.error, screenWidth: 3.5, opacity: 1, markerId: 'error', label: `Проблемный расчётный путь → ${toMetric?.name ?? edge.to}` };
  }
  if (hasWarning) {
    return { color: COLORS.warning, screenWidth: 3.25, opacity: 1, markerId: 'warning', label: `Guardrail-путь → ${toMetric?.name ?? edge.to}` };
  }
  if (focus.mode === 'analysis' && focus.analysisEdges.has(key)) {
    const delta = impactDeltas?.[edge.to] ?? 0;
    const markerId = delta > 0.0001 ? 'positive' : delta < -0.0001 ? 'negative' : 'neutralImpact';
    const color = markerId === 'positive' ? COLORS.positive : markerId === 'negative' ? COLORS.negative : COLORS.neutralImpact;
    return {
      color,
      screenWidth: Math.min(4.75, 2.75 + Math.abs(delta) / 12),
      opacity: 1,
      markerId,
      dash: edge.type === 'influence' ? [8, 6] : undefined,
      label: `Impact ${delta > 0 ? '+' : ''}${delta.toFixed(1)}% → ${toMetric?.name ?? edge.to}`,
    };
  }
  if (focus.mode === 'focus' && focus.upstreamEdges.has(key)) {
    return {
      color: COLORS.upstream,
      screenWidth: isDirect ? 3.5 : 2.75,
      opacity: isDirect ? 1 : 0.82,
      markerId: 'upstream',
      label: `Upstream → ${toMetric?.name ?? edge.to}`,
    };
  }
  if (focus.mode === 'focus' && focus.downstreamEdges.has(key)) {
    return {
      color: COLORS.downstream,
      screenWidth: isDirect ? 3.5 : 2.75,
      opacity: isDirect ? 1 : 0.82,
      markerId: 'downstream',
      label: `Downstream → ${toMetric?.name ?? edge.to}`,
    };
  }
  if (focus.mode === 'multi' && focus.connectingEdges.has(key)) {
    return {
      color: COLORS.connecting,
      screenWidth: isDirect ? 3.75 : 3,
      opacity: 1,
      markerId: 'connecting',
      label: `Путь между выбранными → ${toMetric?.name ?? edge.to}`,
    };
  }
  if (isDirect && edge.type === 'influence') {
    return {
      color: COLORS.influence,
      screenWidth: 3,
      opacity: 1,
      markerId: 'influence',
      dash: [8, 6],
      label: relationLabel,
    };
  }
  if (focus.mode !== 'structure' && !isRelevant) {
    return {
      color: edge.type === 'influence' ? COLORS.influence : COLORS.calculation,
      screenWidth: edge.type === 'influence' ? 1.6 : 1.35,
      opacity: 0.11,
      markerId: edge.type === 'influence' ? 'influence' : 'calculation',
      dash: edge.type === 'influence' ? [8, 6] : undefined,
      label: relationLabel,
    };
  }
  if (edge.type === 'influence') {
    return {
      color: COLORS.influence,
      screenWidth: 1.9,
      opacity: 0.68,
      markerId: 'influence',
      dash: [8, 6],
      label: relationLabel,
    };
  }
  if (focus.backboneEdges.has(key)) {
    return {
      color: COLORS.backbone,
      screenWidth: 1.9,
      opacity: 0.72,
      markerId: 'backbone',
      label: relationLabel,
    };
  }
  return {
    color: COLORS.calculation,
    screenWidth: 1.45,
    opacity: 0.4,
    markerId: 'calculation',
    label: relationLabel,
  };
}

export const CanvasEdges = memo(function CanvasEdges({
  edges,
  metrics,
  focus,
  impactDeltas,
  scale,
  hoveredEdgeKey,
  onHoveredEdgeChange,
}: CanvasEdgesProps) {
  const safeScale = Math.max(scale, 0.05);
  const markerWidth = 9 / safeScale;
  const markerHeight = 7 / safeScale;
  const problemPaths = useMemo(
    () => computeProblemPaths(edges, metrics, focus.backboneEdges),
    [edges, focus.backboneEdges, metrics],
  );

  return (
    <svg
      aria-label="Связи между метриками"
      className="absolute inset-0"
      style={{ zIndex: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
    >
      <defs>
        {Object.entries(MARKER_COLORS).map(([id, color]) => (
          <marker
            key={id}
            id={`edge-arrow-${id}`}
            markerUnits="userSpaceOnUse"
            markerWidth={markerWidth}
            markerHeight={markerHeight}
            viewBox="0 0 9 7"
            refX="8.2"
            refY="3.5"
            orient="auto"
          >
            <path d="M 0 0.6 L 8.2 3.5 L 0 6.4 Z" fill={color} />
          </marker>
        ))}
      </defs>

      {edges.map((edge) => {
        const fromMetric = metrics[edge.from];
        const toMetric = metrics[edge.to];
        if (!fromMetric?.position || !toMetric?.position) return null;

        const relationKey = edgeKey(edge);
        const renderKey = `${edge.type}-${relationKey}`;
        const presentation = edgePresentation(edge, metrics, focus, impactDeltas, problemPaths);
        const isHovered = hoveredEdgeKey === relationKey;
        const x1 = fromMetric.position.x + CARD_WIDTH;
        const y1 = fromMetric.position.y + CARD_HEIGHT / 2;
        const x2 = toMetric.position.x;
        const y2 = toMetric.position.y + CARD_HEIGHT / 2;
        const path = connectionPath(x1, y1, x2, y2, safeScale);
        const screenWidth = isHovered ? Math.max(presentation.screenWidth + 0.75, 3.25) : presentation.screenWidth;
        const strokeWidth = screenWidth / safeScale;
        const dashArray = presentation.dash?.map((value) => value / safeScale).join(' ');
        const labelX = (x1 + x2) / 2;
        const labelY = (y1 + y2) / 2 - 16 / safeScale;
        const labelWidth = Math.min(260, Math.max(118, presentation.label.length * 6.2 + 18)) / safeScale;
        const labelHeight = 24 / safeScale;
        const labelFontSize = 10.5 / safeScale;
        const showPorts = isHovered || focus.relevantEdges.has(relationKey);

        return (
          <g key={renderKey} data-edge-key={relationKey}>
            <path
              d={path}
              fill="none"
              stroke={presentation.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isHovered ? 1 : presentation.opacity}
              markerEnd={`url(#edge-arrow-${presentation.markerId})`}
              style={{ transition: 'opacity 140ms ease, stroke 140ms ease, stroke-width 140ms ease' }}
            />
            {showPorts ? (
              <>
                <circle cx={x1} cy={y1} r={3.25 / safeScale} fill={presentation.color} opacity={isHovered ? 1 : 0.85} />
                <circle cx={x2} cy={y2} r={3.25 / safeScale} fill={presentation.color} opacity={isHovered ? 1 : 0.85} />
              </>
            ) : null}
            {edge.type === 'influence' && presentation.opacity > 0.2 ? (
              <g transform={`translate(${x2 - 16 / safeScale} ${y2 - 10 / safeScale})`}>
                <circle r={7 / safeScale} fill="#ffffff" stroke={presentation.color} strokeWidth={1.5 / safeScale} />
                <text
                  x={0}
                  y={3.5 / safeScale}
                  textAnchor="middle"
                  fill={presentation.color}
                  fontSize={10 / safeScale}
                  fontWeight={700}
                >
                  {edge.sign >= 0 ? '+' : '−'}
                </text>
              </g>
            ) : null}
            {isHovered ? (
              <g>
                <rect
                  x={labelX - labelWidth / 2}
                  y={labelY - labelHeight / 2}
                  width={labelWidth}
                  height={labelHeight}
                  rx={7 / safeScale}
                  fill="#ffffff"
                  stroke={presentation.color}
                  strokeWidth={1.25 / safeScale}
                  opacity={0.98}
                />
                <text
                  x={labelX}
                  y={labelY + 3.5 / safeScale}
                  textAnchor="middle"
                  fill="#334155"
                  fontSize={labelFontSize}
                  fontWeight={600}
                >
                  {presentation.label}
                </text>
              </g>
            ) : null}
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={16 / safeScale}
              pointerEvents="stroke"
              onPointerEnter={() => onHoveredEdgeChange(edge)}
              onPointerLeave={() => onHoveredEdgeChange(null)}
            >
              <title>{presentation.label}</title>
            </path>
          </g>
        );
      })}
    </svg>
  );
});
