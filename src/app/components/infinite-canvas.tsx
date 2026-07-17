import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react';

interface Transform {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_FACTOR = 0.001;

interface InfiniteCanvasProps {
  children: ReactNode;
  contentWidth: number;
  contentHeight: number;
  onZoomChange?: (scale: number) => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  fitToView?: () => void;
}

export function useCanvasControls() {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });

  const zoomIn = useCallback(() => {
    setTransform((t) => {
      const newScale = Math.min(t.scale * 1.1, MAX_SCALE);
      return { ...t, scale: newScale };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setTransform((t) => {
      const newScale = Math.max(t.scale * 0.9, MIN_SCALE);
      return { ...t, scale: newScale };
    });
  }, []);

  const fitToView = useCallback((containerW: number, containerH: number, contentW: number, contentH: number) => {
    const padTop = 80;
    const padBottom = 100;
    const padX = 60;
    const availW = containerW - padX * 2;
    const availH = containerH - padTop - padBottom;
    const scaleX = availW / contentW;
    const scaleY = availH / contentH;
    const scale = Math.max(0.05, Math.min(Math.min(scaleX, scaleY), 1.5));
    const x = (containerW - contentW * scale) / 2;
    const y = padTop + (availH - contentH * scale) / 2;
    setTransform({ x, y, scale });
  }, []);

  return { transform, setTransform, zoomIn, zoomOut, fitToView };
}

interface CanvasProps {
  children: ReactNode;
  contentWidth: number;
  contentHeight: number;
  transform: Transform;
  setTransform: React.Dispatch<React.SetStateAction<Transform>>;
}

export function InfiniteCanvas({ children, contentWidth, contentHeight, transform, setTransform }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const middleButtonDown = useRef(false);

  // Ctrl+Wheel → zoom to cursor point
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    setTransform((t) => {
      const factor = Math.exp(-e.deltaY * ZOOM_FACTOR);
      const newScale = Math.max(MIN_SCALE, Math.min(t.scale * factor, MAX_SCALE));
      // Keep point under cursor stationary
      const wx = (cursorX - t.x) / t.scale;
      const wy = (cursorY - t.y) / t.scale;
      const newX = cursorX - wx * newScale;
      const newY = cursorY - wy * newScale;
      return { x: newX, y: newY, scale: newScale };
    });
  }, [setTransform]);

  // Middle mouse button pan
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Middle button (button === 1)
    if (e.button === 1) {
      e.preventDefault();
      middleButtonDown.current = true;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [transform.x, transform.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setTransform((t) => ({ ...t, x: panStart.current.tx + dx, y: panStart.current.ty + dy }));
  }, [setTransform]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || middleButtonDown.current) {
      isPanning.current = false;
      middleButtonDown.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  // Attach passive:false wheel listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Prevent default middle-click auto-scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventMiddle = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    el.addEventListener('mousedown', preventMiddle);
    return () => el.removeEventListener('mousedown', preventMiddle);
  }, []);

  // Adaptive grid
  let gridSize = 20 * transform.scale;
  if (gridSize < 15) gridSize *= 2;
  const gridOffsetX = transform.x % gridSize;
  const gridOffsetY = transform.y % gridSize;

  const cursorStyle = isPanning.current ? 'grabbing' : middleButtonDown.current ? 'grab' : 'default';

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundColor: '#edeff3',
        backgroundImage: `radial-gradient(circle, #c8ccd4 1px, transparent 1px)`,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${gridOffsetX}px ${gridOffsetY}px`,
        cursor: cursorStyle,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          width: contentWidth,
          height: contentHeight,
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
