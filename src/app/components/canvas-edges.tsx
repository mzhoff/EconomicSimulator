import { type Edge, type MetricDef } from './metric-engine';

const CARD_W = 272; // 17rem
const CARD_H = 112;

interface CanvasEdgesProps {
  edges: Edge[];
  metrics: Record<string, MetricDef>;
  highlightedEdges: Set<string>;
  impactActive: boolean;
}

export function CanvasEdges({ edges, metrics, highlightedEdges, impactActive }: CanvasEdgesProps) {
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <defs>
        <marker id="arrow-default" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <path d="M 0 0 L 8 3 L 0 6 Z" fill="var(--border)" />
        </marker>
        <marker id="arrow-highlight" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <path d="M 0 0 L 8 3 L 0 6 Z" fill="var(--primary)" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const fromMetric = metrics[edge.from];
        const toMetric = metrics[edge.to];
        if (!fromMetric?.position || !toMetric?.position) return null;

        const relationKey = `${edge.from}-${edge.to}`;
        const key = `${edge.type}-${relationKey}`;
        const highlighted = highlightedEdges.has(relationKey);
        const x1 = fromMetric.position.x + CARD_W;
        const y1 = fromMetric.position.y + CARD_H / 2;
        const x2 = toMetric.position.x;
        const y2 = toMetric.position.y + CARD_H / 2;
        const midX = (x1 + x2) / 2;
        const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

        return (
          <path
            key={key}
            d={d}
            fill="none"
            stroke={highlighted && impactActive ? 'var(--primary)' : 'var(--border)'}
            strokeWidth={highlighted && impactActive ? 2.5 : 1.5}
            strokeDasharray={edge.type === 'influence' ? '6 4' : 'none'}
            opacity={highlighted && impactActive ? 1 : 0.6}
            markerEnd={highlighted && impactActive ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
          />
        );
      })}
    </svg>
  );
}
