export type Color = 'white' | 'black';

export interface PointStack {
  color: Color;
  count: number;
}

/**
 * Board indices are 0..23. From White's perspective index i is point i+1.
 * White moves from high indices to low (24 -> 1) and bears off from indices 0..5.
 * Black moves from low indices to high (1 -> 24) and bears off from indices 18..23.
 */
export interface Board {
  points: (PointStack | null)[];
  bar: Record<Color, number>;
  off: Record<Color, number>;
}

export type From = number | 'bar';
export type To = number | 'off';

export interface Step {
  from: From;
  to: To;
  die: number;
  hit: boolean;
}

export type Play = Step[];

export type Dice = [number, number];
