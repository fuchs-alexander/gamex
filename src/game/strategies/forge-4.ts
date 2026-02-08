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
   Forge 4 — Forge 3 aggressiv + Fuchs 3 adaptiv
   Phase 1 (0-99):  Forge 3 aggressiv (kuerzester Pfad)
   Phase 2 (100+):  Fuchs 3 adaptive Gewichte + Dead-End-Filter
   ══════════════════════════════════════════════════════ */

export const pickForge4Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const snakeLen = state.snake.length;
  const fruitsEaten = state.fruitsEaten;
  const totalCells = size * size;
  const occupiedRatio = (snakeLen + state.obstacles.length) / totalCells;

  // Alle Moves evaluieren
  const evaluations: MoveEvaluation[] = [];
  for (const dir of directions) {
    const ev = evaluateMove(state, size, dir);
    if (ev) evaluations.push(ev);
  }

  if (evaluations.length === 0) {
    return directionToTail(state, size);
  }

  const foodMoves = evaluations.filter((e) => e.pathLength !== null);
  const safeFoodMoves = foodMoves.filter((e) => e.safe);
  const foodReachable = foodMoves.length > 0;

  // ═══ PHASE 1: Forge 3 Aggressiv (0-99 Fruechte) ═══
  if (fruitsEaten < 100) {
    if (foodMoves.length > 0) {
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

      // Trap-Schutz: wenn bester Move in Sackgasse fuehrt
      if (best) {
        const spaceThreshold = snakeLen < 20 ? snakeLen : snakeLen * 0.5;
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

    // Kein Food erreichbar: Tail-Chase oder Max-Space
    const tailDir = directionToTail(state, size);
    if (tailDir && evaluations.some((e) => e.direction === tailDir)) {
      return tailDir;
    }
    let best: MoveEvaluation | null = null;
    for (const e of evaluations) {
      if (!best || e.space > best.space) best = e;
    }
    return best?.direction ?? null;
  }

  // ═══ PHASE 2: Fuchs 3 Scoring + Dead-End-Filter (100+ Fruechte) ═══

  // Dead-End-Filter (aus Forge 3)
  const minSpace = Math.max(Math.floor(snakeLen * 0.3), 10);
  const viable = evaluations.filter((e) => e.space >= minSpace);
  const pool = viable.length > 0 ? viable : evaluations;

  // Kein Futter erreichbar: Tail-Chase oder Max-Space
  if (!foodReachable) {
    const tailDir = directionToTail(state, size);
    if (tailDir && pool.some((e) => e.direction === tailDir)) {
      return tailDir;
    }
    let best: MoveEvaluation | null = null;
    for (const e of pool) {
      if (!best || e.space > best.space) best = e;
    }
    return best?.direction ?? directionToTail(state, size);
  }

  // Fuchs 3 adaptive Gewichte
  const t = Math.max(0, Math.min(1, (occupiedRatio - 0.40) / 0.30));
  const spaceW = 0.40 - 0.12 * t;
  const foodW = 0.20 + 0.15 * t;

  let bestScore = -Infinity;
  let bestDir: Direction | null = null;

  for (const ev of pool) {
    let s = 0;

    s += (ev.space / (snakeLen * 2)) * spaceW;

    if (ev.safe) {
      s += 0.3;
    } else {
      s -= Math.max(0.1, 0.3 - (snakeLen / 50));
    }

    if (ev.pathLength !== null) {
      s += (1 / (ev.pathLength + 1)) * foodW;
    }

    if (occupiedRatio > 0.5 && !ev.safe) {
      s -= 0.2;
    }

    if (s > bestScore) {
      bestScore = s;
      bestDir = ev.direction;
    }
  }

  if (bestDir === null || bestScore < 0) {
    return directionToTail(state, size);
  }
  return bestDir;
};
