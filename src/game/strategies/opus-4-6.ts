import { type Direction, type GameState } from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

/**
 * Path-first Scoring mit Toleranz-System.
 * Primaer: Pfad-Delta zum kuerzesten safe Pfad.
 * Toleranz steigt mit Belegung - innerhalb Toleranz zaehlt Space als Tiebreaker.
 * Ausserhalb Toleranz: starke Pfad-Penalty, Space kaum relevant.
 */
const scoreSafeMove = (
  evaluation: MoveEvaluation,
  minPath: number,
  maxSpace: number,
  occupiedRatio: number
): number => {
  if (evaluation.pathLength === null) return -1;

  const pathDelta = evaluation.pathLength - minPath;
  const tolerance = occupiedRatio < 0.3 ? 2 : occupiedRatio < 0.5 ? 3 : 4;
  const normSpace = maxSpace > 0 ? evaluation.space / maxSpace : 0;

  if (pathDelta <= tolerance) {
    return 1 - pathDelta * 0.15 + normSpace * 0.12;
  }
  return 1 - pathDelta * 0.3 + normSpace * 0.05;
};

export const pickOpus46Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const totalCells = size * size;
  const occupiedRatio =
    (state.snake.length + state.obstacles.length) / totalCells;

  // Alle gueltigen Zuege evaluieren
  const evaluations: MoveEvaluation[] = [];
  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (evaluation) {
      evaluations.push(evaluation);
    }
  }

  if (evaluations.length === 0) {
    return directionToTail(state, size);
  }

  // Sackgassen-Filter: Zuege vermeiden die weniger Platz bieten
  // als die Schlange lang ist (= wird sich selbst einkesseln)
  const minSpace = Math.max(Math.floor(state.snake.length * 0.3), 10);
  const viable = evaluations.filter((e) => e.space >= minSpace);
  const pool = viable.length > 0 ? viable : evaluations;

  // Food unreachable: Schwanz jagen (schafft natuerlichen Zyklus, oeffnet Platz)
  if (!isFoodReachable(state, size)) {
    const tailDir = directionToTail(state, size);
    if (tailDir && pool.some((e) => e.direction === tailDir)) {
      return tailDir;
    }
    let best: MoveEvaluation | null = null;
    for (const e of pool) {
      if (!best || e.space > best.space) {
        best = e;
      }
    }
    return best?.direction ?? directionToTail(state, size);
  }

  // IMMER safe > unsafe - kein Gambling auch nicht im fruehen Spiel
  const safePool = pool.filter((e) => e.safe);

  if (safePool.length > 0) {
    // Normalisierung nur ueber safe Zuege
    let minPath = Infinity;
    let maxSpace = 0;
    for (const e of safePool) {
      if (e.pathLength !== null && e.pathLength < minPath) {
        minPath = e.pathLength;
      }
      if (e.space > maxSpace) {
        maxSpace = e.space;
      }
    }
    if (minPath === Infinity) minPath = 1;

    let bestScore = -Infinity;
    let bestDir: Direction | null = null;
    for (const e of safePool) {
      const score = scoreSafeMove(e, minPath, maxSpace, occupiedRatio);
      if (score > bestScore) {
        bestScore = score;
        bestDir = e.direction;
      }
    }
    return bestDir;
  }

  // Kein safe Zug: Ueberlebens-Modus - Kombination aus Pfad + Space
  let maxUnsafeSpace = 0;
  let maxUnsafePath = 0;
  for (const e of pool) {
    if (e.space > maxUnsafeSpace) maxUnsafeSpace = e.space;
    if (e.pathLength !== null && e.pathLength > maxUnsafePath) maxUnsafePath = e.pathLength;
  }

  let bestUnsafeScore = -Infinity;
  let bestUnsafe: MoveEvaluation | null = null;
  for (const e of pool) {
    const hasPath = e.pathLength !== null ? 0.4 : 0;
    const normSpace = maxUnsafeSpace > 0 ? e.space / maxUnsafeSpace : 0;
    const pathScore = e.pathLength !== null && maxUnsafePath > 1
      ? 1 - (e.pathLength - 1) / (maxUnsafePath - 1)
      : 0;
    const score = hasPath + normSpace * 0.4 + pathScore * 0.2;
    if (score > bestUnsafeScore) {
      bestUnsafeScore = score;
      bestUnsafe = e;
    }
  }
  return bestUnsafe?.direction ?? directionToTail(state, size);
};
