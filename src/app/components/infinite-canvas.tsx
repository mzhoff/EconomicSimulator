import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ViewportState } from './metric-engine';

export interface CanvasPoint {
  x: number;
  y: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_FACTOR = 0.001;

export function useCanvasControls(initial: ViewportState = { x: 0, y: 0, scale: 1 }) {
  const [transform, setTransform] = useState<ViewportState>(() => initial);

  const zoomIn = useCallback(() => {
    setTransform((current) => ({ ...current, scale: Math.min(current.scale * 1.1, MAX_SCALE) }));
  }, []);

  const zoomOut = useCallback(() => {
    setTransform((current) => ({ ...current, scale: Math.max(current.scale * 0.9, MIN_SCALE) }));
  }, []);

  const fitToView = useCallback((containerW: number, containerH: number, contentW: number, contentH: number) => {
    const padTop = 80;
    const padBottom = 100;
    const padX = 60;
    const availableWidth = containerW - padX * 2;
    const availableHeight = containerH - padTop - padBottom;
    const scale = Math.max(0.05, Math.min(availableWidth / contentW, availableHeight / contentH, 1.5));
    setTransform({
      x: (containerW - contentW * scale) / 2,
      y: padTop + (availableHeight - contentHeight(contentH) * scale) / 2,
      scale,
    });
  }, []);

  return { transform, setTransform, zoomIn, zoomOut, fitToView };
}

function contentHeight(value: number): number {
  return Math.max(value, 1);
}

interface CanvasProps {
  children: ReactNode;
  contentWidth: number;
  contentHeight: number;
  transform: ViewportState;
  setTransform: React.Dispatch<React.SetStateAction<ViewportState>>;
  onBackgroundPointerDown?: (point: CanvasPoint, event: React.PointerEvent<HTMLDivElement>) => void;
  onBackgroundPointerMove?: (point: CanvasPoint, event: React.PointerEvent<HTMLDivElement>) => void;
  onBackgroundPointerUp?: (point: CanvasPoint, event: React.PointerEvent<HTMLDivElement>) => void;
}

export function InfiniteCanvas({
  children,
  contentWidth,
  contentHeight: canvasContentHeight,
  transform,
  setTransform,
  onBackgroundPointerDown,
  onBackgroundPointerMove,
  onBackgroundPointerUp,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const selectionPointerRef = useRef<number | null>(null);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const toWorldPoint = useCallback((clientX: number, clientY: number): CanvasPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    const localX = clientX - (rect?.left ?? 0);
    const localY = clientY - (rect?.top ?? 0);
    return {
      x: (localX - transform.x) / transform.scale,
      y: (localY - transform.y) / transform.scale,
    };
  }, [transform.scale, transform.x, transform.y]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    if (event.ctrlKey || event.metaKey) {
      const rect = container.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      setTransform((current) => {
        const factor = Math.exp(-event.deltaY * ZOOM_FACTOR);
        const nextScale = Math.max(MIN_SCALE, Math.min(current.scale * factor, MAX_SCALE));
        const worldX = (cursorX - current.x) / current.scale;
        const worldY = (cursorY - current.y) / current.scale;
        return {
          x: cursorX - worldX * nextScale,
          y: cursorY - worldY * nextScale,
          scale: nextScale,
        };
      });
      return;
    }

    setTransform((current) => ({
      ...current,
      x: current.x - (event.shiftKey ? event.deltaY : event.deltaX),
      y: current.y - (event.shiftKey ? event.deltaX : event.deltaY),
    }));
  }, [setTransform]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      isPanningRef.current = true;
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        tx: transform.x,
        ty: transform.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest('[data-canvas-interactive="true"]')) return;
    selectionPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    onBackgroundPointerDown?.(toWorldPoint(event.clientX, event.clientY), event);
  }, [onBackgroundPointerDown, toWorldPoint, transform.x, transform.y]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      const deltaX = event.clientX - panStartRef.current.x;
      const deltaY = event.clientY - panStartRef.current.y;
      setTransform((current) => ({
        ...current,
        x: panStartRef.current.tx + deltaX,
        y: panStartRef.current.ty + deltaY,
      }));
      return;
    }
    if (selectionPointerRef.current === event.pointerId) {
      onBackgroundPointerMove?.(toWorldPoint(event.clientX, event.clientY), event);
    }
  }, [onBackgroundPointerMove, setTransform, toWorldPoint]);

  const finishPointerInteraction = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
    }
    if (selectionPointerRef.current === event.pointerId) {
      onBackgroundPointerUp?.(toWorldPoint(event.clientX, event.clientY), event);
      selectionPointerRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [onBackgroundPointerUp, toWorldPoint]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const preventMiddleAutoScroll = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };
    element.addEventListener('mousedown', preventMiddleAutoScroll);
    return () => element.removeEventListener('mousedown', preventMiddleAutoScroll);
  }, []);

  let gridSize = 20 * transform.scale;
  if (gridSize < 15) gridSize *= 2;
  const gridOffsetX = transform.x % gridSize;
  const gridOffsetY = transform.y % gridSize;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundColor: '#edeff3',
        backgroundImage: 'radial-gradient(circle, #c8ccd4 1px, transparent 1px)',
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${gridOffsetX}px ${gridOffsetY}px`,
        cursor: isPanning ? 'grabbing' : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerInteraction}
      onPointerCancel={finishPointerInteraction}
    >
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          width: contentWidth,
          height: canvasContentHeight,
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
