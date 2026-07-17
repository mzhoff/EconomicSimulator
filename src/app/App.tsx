import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  createDefaultModel, computeMetrics, computeImpact, autoLayout, scenarios,
  type ModelState, type MetricDef, type CatalogMetric, type MetricKind, type MetricDomain, type MetricRole,
} from './components/metric-engine';
import { MetricCard } from './components/metric-card';
import { CanvasEdges } from './components/canvas-edges';
import { InputPanel } from './components/input-panel';
import { InspectorPanel } from './components/inspector-panel';
import { BottomToolbar } from './components/bottom-toolbar';
import { InfiniteCanvas, useCanvasControls } from './components/infinite-canvas';
import { MetricCatalogDialog } from './components/metric-catalog-dialog';
import { Zap, RotateCcw } from 'lucide-react';

const CONTENT_W = 2000;
const CONTENT_H = 1400;

export default function App() {
  const [model, setModel] = useState<ModelState>(createDefaultModel);
  const [scenarioKey, setScenarioKey] = useState('base');
  const [inputOverrides, setInputOverrides] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState('ltvCac');
  const [impactActive, setImpactActive] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const { transform, setTransform, zoomIn, zoomOut, fitToView } = useCanvasControls();
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // Dragging state
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origPos: { x: number; y: number } } | null>(null);

  const allCollapsed = !leftOpen && !rightOpen;

  // Fit on mount
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    fitToView(width, height, CONTENT_W, CONTENT_H);
  }, [fitToView]);

  const handleFitToView = useCallback(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    fitToView(width, height, CONTENT_W, CONTENT_H);
  }, [fitToView]);

  // ── Computed metrics ──
  const current = useMemo(() => computeMetrics(model, scenarioKey, inputOverrides), [model, scenarioKey, inputOverrides]);

  const impactMap = useMemo(() => {
    if (!impactActive) return {};
    return computeImpact(selectedId, model, scenarioKey, inputOverrides, current);
  }, [impactActive, selectedId, model, scenarioKey, inputOverrides, current]);

  const highlightedEdges = useMemo(() => {
    return new Set(
      model.edges
        .filter((e) => e.from === selectedId || e.to === selectedId)
        .map((e) => `${e.from}-${e.to}`)
    );
  }, [selectedId, model.edges]);

  // ── Input overrides ──
  const handleChangeInput = useCallback((id: string, value: number) => {
    setInputOverrides((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleResetInput = useCallback((id: string) => {
    setInputOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleResetAll = useCallback(() => {
    setScenarioKey('base');
    setInputOverrides({});
  }, []);

  const handleToggleAll = useCallback(() => {
    if (allCollapsed) { setLeftOpen(true); setRightOpen(true); }
    else { setLeftOpen(false); setRightOpen(false); }
  }, [allCollapsed]);

  // ── Drag card on canvas ──
  const handleStartDrag = useCallback((id: string, e: React.PointerEvent) => {
    const metric = model.metrics[id];
    if (!metric) return;
    draggingRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origPos: { ...metric.position },
    };

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = (ev.clientX - draggingRef.current.startX) / transform.scale;
      const dy = (ev.clientY - draggingRef.current.startY) / transform.scale;
      const origX = draggingRef.current.origPos.x;
      const origY = draggingRef.current.origPos.y;
      setModel(prev => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          [id]: {
            ...prev.metrics[id],
            position: {
              x: origX + dx,
              y: origY + dy,
            },
          },
        },
      }));
    };

    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [model.metrics, transform.scale]);

  // ── Add metric from catalog ──
  const handleAddFromCatalog = useCallback((cat: CatalogMetric) => {
    setModel(prev => {
      if (prev.metrics[cat.id]) return prev; // already exists

      // Find a free position
      const positions = Object.values(prev.metrics).map(m => m.position);
      const maxX = positions.length > 0 ? Math.max(...positions.map(p => p.x)) : 0;
      const maxY = positions.length > 0 ? Math.max(...positions.map(p => p.y)) : 0;

      const newMetric: MetricDef = {
        id: cat.id,
        name: cat.name,
        kind: cat.kind,
        unit: cat.unit,
        unitType: cat.unitType,
        value: cat.defaultValue,
        description: cat.description,
        domain: cat.domain,
        role: cat.role,
        status: cat.formula && cat.dependencies ? 'valid' : (cat.kind === 'input' ? 'valid' : 'incomplete'),
        formula: cat.formula,
        formulaDisplay: cat.formulaDisplay,
        position: { x: maxX + 380, y: 80 + Math.random() * 200 },
        col: 0,
      };

      // Auto-add edges for dependencies that exist in the model
      const newEdges = [...prev.edges];
      if (cat.dependencies) {
        for (const depId of cat.dependencies) {
          if (prev.metrics[depId] && !newEdges.some(e => e.from === depId && e.to === cat.id)) {
            newEdges.push({ from: depId, to: cat.id, type: 'calc', sign: 1 });
          }
        }
      }

      return {
        metrics: { ...prev.metrics, [cat.id]: newMetric },
        edges: newEdges,
      };
    });
    setSelectedId(cat.id);
  }, []);

  // ── Add custom metric ──
  const handleAddCustom = useCallback((data: {
    name: string; kind: MetricKind; unit: string; description: string; domain: MetricDomain; role: MetricRole; defaultValue: number;
  }) => {
    const id = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    setModel(prev => {
      if (prev.metrics[id]) return prev;

      const positions = Object.values(prev.metrics).map(m => m.position);
      const maxX = positions.length > 0 ? Math.max(...positions.map(p => p.x)) : 0;

      const unitTypeMap: Record<string, string> = { '₽': 'currency', '%': 'percent', 'x': 'ratio', 'users': 'count', 'mo': 'duration', 'pts': 'score' };

      const newMetric: MetricDef = {
        id,
        name: data.name,
        kind: data.kind,
        unit: data.unit,
        unitType: (unitTypeMap[data.unit] || 'count') as any,
        value: data.defaultValue,
        description: data.description,
        domain: data.domain,
        role: data.role,
        status: data.kind === 'input' ? 'valid' : 'draft',
        position: { x: maxX + 380, y: 80 + Math.random() * 200 },
        col: 0,
      };

      return { ...prev, metrics: { ...prev.metrics, [id]: newMetric } };
    });
    setSelectedId(id);
  }, []);

  // ── Delete metric ──
  const handleDeleteMetric = useCallback((id: string) => {
    setModel(prev => {
      const newMetrics = { ...prev.metrics };
      delete newMetrics[id];
      const newEdges = prev.edges.filter(e => e.from !== id && e.to !== id);
      return { metrics: newMetrics, edges: newEdges };
    });
    setSelectedId(prev => prev === id ? Object.keys(model.metrics).find(k => k !== id) || '' : prev);
  }, [model.metrics]);

  // ── Update metric metadata ──
  const handleUpdateMetric = useCallback((id: string, updates: Partial<Pick<MetricDef, 'name' | 'description' | 'domain' | 'role'>>) => {
    setModel(prev => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        [id]: { ...prev.metrics[id], ...updates },
      },
    }));
  }, []);

  // ── Auto-layout ──
  const handleAutoLayout = useCallback(() => {
    const positions = autoLayout(model);
    setModel(prev => {
      const newMetrics = { ...prev.metrics };
      for (const [id, pos] of Object.entries(positions)) {
        if (newMetrics[id]) {
          newMetrics[id] = { ...newMetrics[id], position: pos };
        }
      }
      return { ...prev, metrics: newMetrics };
    });
    // Fit after layout
    setTimeout(() => {
      handleFitToView();
    }, 50);
  }, [model, handleFitToView]);

  const existingIds = useMemo(() => new Set(Object.keys(model.metrics)), [model.metrics]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="relative z-40 flex items-center justify-between border-b border-border bg-card px-[1.25rem] py-[0.5rem]" style={{ minHeight: '3.25rem' }}>
        <div className="flex items-center gap-[0.75rem]">
          <div className="flex items-center gap-[0.375rem]">
            <Zap className="size-[1rem] text-foreground" />
            <span className="text-[0.875rem] text-foreground" style={{ fontWeight: 600 }}>Metric Graph OS</span>
          </div>
          <span className="text-[0.6875rem] text-muted-foreground hidden sm:block">Unit Economics Model</span>
          <span className="text-[0.5625rem] bg-secondary text-muted-foreground rounded-full px-[0.5rem] py-[0.0625rem] hidden sm:block" style={{ fontWeight: 500 }}>
            {Object.keys(model.metrics).length} metrics · {model.edges.length} edges
          </span>
        </div>

        <div className="flex items-center gap-[0.375rem]">
          <div className="flex items-center rounded-[var(--radius-lg)] border border-border bg-background p-[0.125rem]">
            {Object.entries(scenarios).map(([key, scenario]) => (
              <button
                key={key}
                onClick={() => setScenarioKey(key)}
                className={`rounded-[var(--radius-md)] px-[0.625rem] py-[0.25rem] text-[0.6875rem] transition-all cursor-pointer ${
                  scenarioKey === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                style={{ fontWeight: 500 }}
              >
                {scenario.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleResetAll}
            className="flex items-center gap-[0.25rem] rounded-[var(--radius-lg)] border border-border px-[0.5rem] py-[0.3125rem] text-[0.6875rem] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            style={{ fontWeight: 500 }}
          >
            <RotateCcw className="size-[0.75rem]" />
            Reset
          </button>
        </div>
      </header>

      {/* Canvas area */}
      <div ref={canvasAreaRef} className="relative flex-1 overflow-hidden">
        <InfiniteCanvas
          contentWidth={CONTENT_W}
          contentHeight={CONTENT_H}
          transform={transform}
          setTransform={setTransform}
        >
          <CanvasEdges edges={model.edges} metrics={current} highlightedEdges={highlightedEdges} impactActive={true} />
          {Object.values(current).map((metric) => (
            <MetricCard
              key={metric.id}
              metric={metric}
              selected={metric.id === selectedId}
              onSelect={setSelectedId}
              onDelete={handleDeleteMetric}
              onStartDrag={handleStartDrag}
              delta={impactActive && impactMap[metric.id] !== undefined && metric.id !== selectedId ? impactMap[metric.id] : undefined}
              impactActive={impactActive}
            />
          ))}
        </InfiniteCanvas>

        {/* Overlay panels */}
        <InputPanel
          metrics={current}
          model={model}
          inputOverrides={inputOverrides}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChangeInput={handleChangeInput}
          onReset={handleResetInput}
          collapsed={!leftOpen}
          onToggle={() => setLeftOpen((v) => !v)}
        />

        <InspectorPanel
          metrics={current}
          model={model}
          selectedId={selectedId}
          scenarioKey={scenarioKey}
          scenarios={scenarios}
          collapsed={!rightOpen}
          onToggle={() => setRightOpen((v) => !v)}
          onUpdateMetric={handleUpdateMetric}
          onSelect={setSelectedId}
        />

        <BottomToolbar
          allCollapsed={allCollapsed}
          onToggleAll={handleToggleAll}
          impactActive={impactActive}
          onToggleImpact={() => setImpactActive((v) => !v)}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFitToView={handleFitToView}
          onAutoLayout={handleAutoLayout}
          onAddMetric={() => setCatalogOpen(true)}
          scale={transform.scale}
        />
      </div>

      {/* Metric Catalog Dialog */}
      <MetricCatalogDialog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onAddFromCatalog={handleAddFromCatalog}
        onAddCustom={handleAddCustom}
        existingIds={existingIds}
      />
    </div>
  );
}