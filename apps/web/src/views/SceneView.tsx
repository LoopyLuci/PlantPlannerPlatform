import { useEffect, useMemo, useRef, useState } from 'react';
import type { DesignView, EvaluationView, SpeciesSummary } from '../api';
import { type Point } from '../model';
import { PlantScene } from '../Scene3D';
import { sceneShapes } from '../scene';
import { ElevationView } from './ElevationView';
import { PlantList } from './PlantList';

export interface SceneViewProps {
  design: DesignView | null;
  evaluation: EvaluationView | null;
  speciesByUrn: Map<string, SpeciesSummary>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, to: Point) => void;
}

/**
 * The perspective window. Drag a plant to move it; the same move is saved
 * through the same write path as the plan, so the two windows always agree.
 * Without WebGL, the side elevation takes its place.
 */
export function SceneView(props: SceneViewProps) {
  const { design, evaluation, speciesByUrn, selectedId } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PlantScene | null>(null);
  const callbacks = useRef({ onSelect: props.onSelect, onMove: props.onMove });
  const [webgl, setWebgl] = useState<'checking' | 'available' | 'missing'>('checking');

  useEffect(() => {
    callbacks.current = { onSelect: props.onSelect, onMove: props.onMove };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      sceneRef.current = new PlantScene(container, {
        onSelect: (id) => callbacks.current.onSelect(id),
        onMove: (id, to) => callbacks.current.onMove(id, to),
      });
      setWebgl('available');
    } catch {
      setWebgl('missing');
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const shapes = useMemo(
    () => (design ? sceneShapes(design, evaluation, speciesByUrn) : []),
    [design, evaluation, speciesByUrn],
  );

  useEffect(() => {
    const stage = containerRef.current;
    if (design && sceneRef.current && stage) {
      // Timing for the 100 ms gate (ADR-0009): from handing the shapes to the scene to the next frame drawn.
      // Written as data attributes so the browser test can read it without a global.
      const started = performance.now();
      sceneRef.current.setDesign({ widthM: design.site.widthM, depthM: design.site.depthM }, shapes);
      requestAnimationFrame(() => {
        stage.dataset.renderMs = (performance.now() - started).toFixed(1);
        stage.dataset.renderCount = String(Number(stage.dataset.renderCount ?? '0') + 1);
      });
    }
  }, [design, shapes]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedId);
  }, [selectedId]);

  return (
    <div className="scene-layout">
      {webgl === 'missing' && (
        <p className="banner-inline" role="status">
          The 3D view needs WebGL, which this browser does not provide. The side elevation shows the same plants.
        </p>
      )}
      <div ref={containerRef} className="scene-stage" hidden={webgl === 'missing'} />
      {webgl === 'missing' && (
        <ElevationView design={design} shapes={shapes} selectedId={selectedId} onSelect={props.onSelect} />
      )}
      {webgl !== 'missing' && (
        <>
          <p className="muted small">
            Drag a plant to move it, drag the background to turn the view, and scroll to zoom. The plan and this view
            always show the same positions. The list below works from the keyboard.
          </p>
          <PlantList shapes={shapes} selectedId={selectedId} onSelect={props.onSelect} />
        </>
      )}
    </div>
  );
}
