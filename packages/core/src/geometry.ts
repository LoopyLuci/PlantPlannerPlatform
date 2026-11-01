export interface Point {
  x: number;
  y: number;
}

/** Euclidean distance in metres between two points in site coordinates. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Rounds to two decimals for display and stable comparisons. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
