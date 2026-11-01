import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { EvaluationView, PlacementView, SiteView, SpeciesSummary } from './api';
import { DIRECTION_COLOR, GUILD_COLORS, STATUS_COLOR, clampToSite, fitView, gridStep, pixelToMetres, snap, type Point } from './model';

/**
 * The plan view. An SVG in metres, drawn through one transform. Drawing uses
 * the same verdicts as the inspector, so the canvas and the explanation never
 * disagree. Pointer input is direct: drag to move, drag the background to pan,
 * wheel to zoom, and drop a species from the list onto the plot.
 */

export interface LayerState {
  footprints: boolean;
  envelopes: boolean;
  arcs: boolean;
  labels: boolean;
  rings: boolean;
  grid: boolean;
}

interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface CanvasProps {
  site: SiteView;
  placements: PlacementView[];
  speciesByUrn: Map<string, SpeciesSummary>;
  evaluation: EvaluationView | null;
  selectedId: string | null;
  overrides: Record<string, Point>;
  layers: LayerState;
  suggestionPoint: Point | null;
  onSelect: (id: string | null) => void;
  onPreview: (id: string, point: Point) => void;
  onCommitMove: (placement: PlacementView, point: Point) => void;
  onDrop: (urn: string, point: Point) => void;
}

type Drag =
  | { kind: 'pan'; startX: number; startY: number; offsetX: number; offsetY: number }
  | { kind: 'move'; placement: PlacementView; origin: Point; start: Point; current: Point; moved: boolean };

const SPECIES_MIME = 'text/ppp-species';

export function Canvas(props: CanvasProps) {
  const { site, placements, speciesByUrn, evaluation, selectedId, overrides, layers, suggestionPoint } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [viewState, setViewState] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  const drag = useRef<Drag | null>(null);

  const fitKey = `${site.widthM}x${site.depthM}`;
  useEffect(() => {
    setViewState(null);
  }, [fitKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const view = viewState ?? fitView(site, size);
  viewRef.current = view;

  // Wheel zoom must be non-passive so the page does not scroll while zooming.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = viewRef.current;
      if (!current) return;
      const rect = svg.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const scale = Math.min(400, Math.max(15, current.scale * Math.exp(-event.deltaY * 0.0015)));
      const m = pixelToMetres({ x: px, y: py }, current);
      setViewState({ scale, offsetX: px - m.x * scale, offsetY: py - m.y * scale });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const toMetres = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    const px = event.clientX - (rect?.left ?? 0);
    const py = event.clientY - (rect?.top ?? 0);
    return pixelToMetres({ x: px, y: py }, view);
  };

  const positionOf = (p: PlacementView): Point => overrides[p.id] ?? { x: p.x, y: p.y };

  const onBackgroundDown = (event: ReactPointerEvent<SVGRectElement>) => {
    drag.current = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      offsetX: view.offsetX,
      offsetY: view.offsetY,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onPlacementDown = (event: ReactPointerEvent<SVGGElement>, placement: PlacementView) => {
    event.stopPropagation();
    props.onSelect(placement.id);
    const origin = positionOf(placement);
    drag.current = { kind: 'move', placement, origin, start: toMetres(event), current: origin, moved: false };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current) return;
    if (current.kind === 'pan') {
      setViewState({
        scale: view.scale,
        offsetX: current.offsetX + (event.clientX - current.startX),
        offsetY: current.offsetY + (event.clientY - current.startY),
      });
      return;
    }
    const m = toMetres(event);
    const delta = { x: m.x - current.start.x, y: m.y - current.start.y };
    if (!current.moved && Math.hypot(delta.x, delta.y) * view.scale < 4) return;
    current.moved = true;
    const next = clampToSite({ x: snap(current.origin.x + delta.x), y: snap(current.origin.y + delta.y) }, site);
    current.current = next;
    props.onPreview(current.placement.id, next);
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.kind === 'pan') {
      const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      if (moved < 4) props.onSelect(null);
      return;
    }
    if (current.moved) props.onCommitMove(current.placement, current.current);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(SPECIES_MIME)) event.preventDefault();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const urn = event.dataTransfer.getData(SPECIES_MIME);
    if (!urn) return;
    event.preventDefault();
    const m = toMetres(event);
    props.onDrop(urn, clampToSite({ x: snap(m.x), y: snap(m.y) }, site));
  };

  const grid = useMemo(() => {
    const step = gridStep(view.scale);
    const lines: { key: string; x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let i = 0; i * step <= site.widthM + 1e-9; i += 1) {
      const x = Number((i * step).toFixed(3));
      lines.push({ key: `v${i}`, x1: x, y1: 0, x2: x, y2: site.depthM, major: i % 2 === 0 });
    }
    for (let i = 0; i * step <= site.depthM + 1e-9; i += 1) {
      const y = Number((i * step).toFixed(3));
      lines.push({ key: `h${i}`, x1: 0, y1: y, x2: site.widthM, y2: y, major: i % 2 === 0 });
    }
    return lines;
  }, [site.widthM, site.depthM, view.scale]);

  const companionEdges = useMemo(
    () => (evaluation?.verdicts ?? []).filter((v) => v.rule === 'companion' && v.neighborPlacementId),
    [evaluation],
  );
  const byId = useMemo(() => new Map(placements.map((p) => [p.id, p])), [placements]);
  const arcOpacity = companionEdges.length > 20 ? 0.5 : 1;

  return (
    <div
      ref={wrapRef}
      className="canvas"
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid="canvas"
    >
      <svg
        ref={svgRef}
        className="plan"
        width={size.width}
        height={size.height}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`Plan of ${site.name}, ${site.widthM} by ${site.depthM} metres, with ${placements.length} plants`}
      >
        <rect x={0} y={0} width={size.width} height={size.height} className="plan-bg" onPointerDown={onBackgroundDown} />
        <g transform={`translate(${view.offsetX} ${view.offsetY}) scale(${view.scale})`}>
          <rect x={0} y={0} width={site.widthM} height={site.depthM} className="site-rect" vectorEffect="non-scaling-stroke" />
          {layers.grid &&
            grid.map((line) => (
              <line
                key={line.key}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                className={line.major ? 'grid-major' : 'grid-minor'}
                vectorEffect="non-scaling-stroke"
              />
            ))}

          {layers.arcs &&
            companionEdges.map((edge, index) => {
              const a = byId.get(edge.placementId);
              const b = edge.neighborPlacementId ? byId.get(edge.neighborPlacementId) : undefined;
              if (!a || !b) return null;
              const pa = positionOf(a);
              const pb = positionOf(b);
              const dx = pb.x - pa.x;
              const dy = pb.y - pa.y;
              const length = Math.hypot(dx, dy) || 1;
              const bulge = 0.25;
              const cx = (pa.x + pb.x) / 2 - (dy / length) * bulge;
              const cy = (pa.y + pb.y) / 2 + (dx / length) * bulge;
              const dash = edge.direction === 'antagonistic' ? '4 4' : edge.direction === 'neutral' ? '1 3' : undefined;
              return (
                <path
                  key={`arc-${index}`}
                  d={`M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`}
                  fill="none"
                  stroke={DIRECTION_COLOR[edge.direction ?? 'neutral']}
                  strokeWidth={1.5}
                  strokeDasharray={dash}
                  strokeOpacity={arcOpacity}
                  vectorEffect="non-scaling-stroke"
                  className="arc"
                >
                  <title>{edge.message}</title>
                </path>
              );
            })}

          {placements.map((p) => {
            const species = speciesByUrn.get(p.speciesUrn);
            const at = positionOf(p);
            const color = GUILD_COLORS[species?.guildLayer ?? 'understory'];
            const status = evaluation?.placements[p.id]?.status ?? 'unknown';
            const footprint = p.footprintM;
            const spread = species?.traits.matureSpreadM ?? null;
            const isSelected = p.id === selectedId;
            return (
              <g
                key={p.id}
                transform={`translate(${at.x} ${at.y})`}
                className={`plant${isSelected ? ' is-selected' : ''}`}
                onPointerDown={(event) => onPlacementDown(event, p)}
                role="presentation"
                data-placement-id={p.id}
              >
                {layers.envelopes && spread !== null && (
                  <circle r={spread / 2} fill="none" stroke={color} strokeOpacity={0.45} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                )}
                {layers.footprints && (
                  <circle r={footprint / 2} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                )}
                {layers.rings && status !== 'pass' && (
                  <circle
                    r={footprint / 2}
                    fill="none"
                    stroke={STATUS_COLOR[status]}
                    strokeWidth={3}
                    strokeDasharray={status === 'warn' ? '6 4' : status === 'unknown' ? '2 3' : undefined}
                    vectorEffect="non-scaling-stroke"
                    className={`ring ring-${status}`}
                  />
                )}
                {isSelected && (
                  <circle r={footprint / 2 + 0.05} fill="none" stroke="#4A7C59" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                )}
                {p.pinned && <rect x={footprint / 2 - 0.09} y={-footprint / 2 - 0.02} width={0.09} height={0.09} className="pin-mark" vectorEffect="non-scaling-stroke" />}
                <circle r={0.035} fill="#4A524D" />
                <circle r={Math.max(footprint / 2, 12 / view.scale)} fill="transparent" />
              </g>
            );
          })}

          {suggestionPoint && (
            <circle cx={suggestionPoint.x} cy={suggestionPoint.y} r={0.12} className="suggest-point" vectorEffect="non-scaling-stroke" />
          )}
        </g>

        {layers.labels &&
          view.scale >= 40 &&
          placements.map((p) => {
            const species = speciesByUrn.get(p.speciesUrn);
            const at = positionOf(p);
            const x = view.offsetX + at.x * view.scale;
            const y = view.offsetY + (at.y - p.footprintM / 2) * view.scale - 6;
            return (
              <text key={`label-${p.id}`} x={x} y={y} textAnchor="middle" className="plant-label">
                {species?.commonName ?? p.speciesUrn}
              </text>
            );
          })}

      </svg>
    </div>
  );
}
