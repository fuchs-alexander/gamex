import {
  type Direction,
  type GameState
} from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  type MoveEvaluation
} from "./utils";

/* ══════════════════════════════════════════════════════
   Forge 3 — Martin3
   ══════════════════════════════════════════════════════ */

// --- MIMO-Style Scoring (ab 100 Fruechte) ---

const scoreMimoMove = (
  evaluation: MoveEvaluation,
  snakeLength: number,
  occupiedRatio: number,
  foodReachable: boolean
): number => {
  let score = 0;

  // Space: starkes Signal (40%)
  const spaceScore = evaluation.space / (snakeLength * 2);
  score += spaceScore * 0.4;

  // Safety: wichtig (30%)
  if (evaluation.safe) {
    score += 0.3;
  } else {
    const unsafePenalty = Math.max(0.1, 0.3 - (snakeLength / 50));
    score -= unsafePenalty;
  }

  // Pfad zum Futter (20%)
  if (foodReachable && evaluation.pathLength !== null) {
    const pathScore = 1 / (evaluation.pathLength + 1);
    score += pathScore * 0.2;
  }

  // Extra Penalty wenn Board voll und unsafe
  if (occupiedRatio > 0.5 && !evaluation.safe) {
    score -= 0.2;
  }

  return score;
};

// --- Hauptfunktion ---

export const pickForge3Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const snakeLength = state.snake.length;
  const fruitsEaten = state.fruitsEaten;
  const totalCells = size * size;
  const occupiedRatio = (snakeLength + state.obstacles.length) / totalCells;

  // Alle Moves evaluieren
  const evaluations: MoveEvaluation[] = [];
  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (evaluation) evaluations.push(evaluation);
  }

  if (evaluations.length === 0) {
    return directionToTail(state, size);
  }

  const foodMoves = evaluations.filter((e) => e.pathLength !== null);
  const safeFoodMoves = foodMoves.filter((e) => e.safe);
  const foodReachable = foodMoves.length > 0;

  // === PHASE 2: MIMO-Kombi (100+ Fruechte) ===
  if (fruitsEaten >= 100) {
    // Dead-End-Filter
    const minSpace = Math.max(Math.floor(snakeLength * 0.3), 10);
    const viable = evaluations.filter((e) => e.space >= minSpace);
    const pool = viable.length > 0 ? viable : evaluations;

    if (!foodReachable) {
      // Tail-Chase
      const tailDir = directionToTail(state, size);
      if (tailDir && pool.some((e) => e.direction === tailDir)) {
        return tailDir;
      }
      // Max-Space Fallback
      let best: MoveEvaluation | null = null;
      for (const e of pool) {
        if (!best || e.space > best.space) best = e;
      }
      return best?.direction ?? directionToTail(state, size);
    }

    // MIMO-Scoring auf gefilterten Pool
    let bestScore = -Infinity;
    let bestDir: Direction | null = null;
    for (const e of pool) {
      const score = scoreMimoMove(e, snakeLength, occupiedRatio, foodReachable);
      if (score > bestScore) {
        bestScore = score;
        bestDir = e.direction;
      }
    }

    if (bestDir === null || bestScore < 0) {
      return directionToTail(state, size);
    }

    return bestDir;
  }

  // === PHASE 1: Aggressiv (0-99 Fruechte) ===

  if (foodMoves.length > 0) {
    // Bevorzuge sichere Moves die Futter erreichen
    const pool = safeFoodMoves.length > 0 ? safeFoodMoves : foodMoves;

    // Kuerzester Pfad, Space-Tiebreaker, vertikal bevorzugt
    let best: MoveEvaluation | null = null;
    for (const e of pool) {
      if (!best
        || e.pathLength! < best.pathLength!
        || (e.pathLength === best.pathLength && e.space > best.space)
        || (e.pathLength === best.pathLength && e.space === best.space
            && (e.direction === "up" || e.direction === "down"))
      ) {
        best = e;
      }
    }

    // Trap-Schutz: wenn bester Move in Sackgasse fuehrt, nimm mehr Space
    if (best) {
      const spaceThreshold = snakeLength < 20 ? snakeLength : snakeLength * 0.5;
      if (best.space < spaceThreshold && evaluations.some((e) => e.space >= spaceThreshold)) {
        let safest: MoveEvaluation | null = null;
        for (const e of evaluations) {
          if (e.space >= spaceThreshold && (!safest || e.space > safest.space)) {
            safest = e;
          }
        }
        if (safest) return safest.direction;
      }
    }

    return best?.direction ?? directionToTail(state, size);
  }

  // === SAFETY MODE: Kein Move kann Futter erreichen ===

  // 1. Tail-Chase
  const tailDir = directionToTail(state, size);
  if (tailDir && evaluations.some((e) => e.direction === tailDir)) {
    return tailDir;
  }

  // 2. Max-Space
  let best: MoveEvaluation | null = null;
  for (const e of evaluations) {
    if (!best || e.space > best.space) {
      best = e;
    }
  }
  return best?.direction ?? null;
};
