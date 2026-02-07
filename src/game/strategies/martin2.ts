import {
  type Direction,
  type GameState,
  type Point,
  movePoint,
  pointKey,
  wrapPoint
} from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  floodFillCount,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

/* ══════════════════════════════════════════════════════
   Martin Hulus 2 — Halb MIMO Flash, Halb Fuchs 2
   ══════════════════════════════════════════════════════ */

// --- Fuchs-2 Helpers ---

const directionVectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const neighborPoints = (point: Point, size: number): Point[] =>
  directions.map((dir) =>
    wrapPoint({ x: point.x + directionVectors[dir].x, y: point.y + directionVectors[dir].y }, size)
  );

const compactness = (pos: Point, size: number, blocked: Set<string>): number => {
  let count = 0;
  for (const n of neighborPoints(pos, size)) {
    if (blocked.has(pointKey(n))) count++;
  }
  return count;
};

const countSmallPockets = (
  nextHead: Point,
  size: number,
  blocked: Set<string>
): number => {
  const freeNeighbors = neighborPoints(nextHead, size).filter(
    (n) => !blocked.has(pointKey(n))
  );
  let pockets = 0;
  for (const fn of freeNeighbors) {
    if (floodFillCount(fn, size, blocked) < 4) pockets++;
  }
  return pockets;
};

type AreaEvaluation = MoveEvaluation & {
  compactness: number;
  pockets: number;
  continuity: number;
  nextHead: Point;
};

const evaluateAreaMove = (
  state: GameState,
  size: number,
  evaluation: MoveEvaluation
): AreaEvaluation => {
  const head = state.snake[0];
  const nextHead = wrapPoint(movePoint(head, evaluation.direction), size);
  const nextSnake = [nextHead, ...state.snake.slice(0, -1)];
  const blocked = new Set<string>([
    ...nextSnake.map(pointKey),
    ...state.obstacles.map(pointKey)
  ]);
  return {
    ...evaluation,
    compactness: compactness(nextHead, size, blocked),
    pockets: countSmallPockets(nextHead, size, blocked),
    continuity: evaluation.direction === state.direction ? 1 : 0,
    nextHead
  };
};

// --- Phase 1: MIMO Flash Scoring (0-69 Fruechte) ---

const scoreMimoMove = (
  evaluation: MoveEvaluation,
  snakeLength: number,
  occupiedRatio: number,
  foodReachable: boolean
): number => {
  let score = 0;

  const spaceScore = evaluation.space / (snakeLength * 2);
  score += spaceScore * 0.4;

  if (evaluation.safe) {
    score += 0.3;
  } else {
    const unsafePenalty = Math.max(0.1, 0.3 - (snakeLength / 50));
    score -= unsafePenalty;
  }

  if (foodReachable && evaluation.pathLength !== null) {
    const pathScore = 1 / (evaluation.pathLength + 1);
    score += pathScore * 0.2;
  }

  if (occupiedRatio > 0.5) {
    if (!evaluation.safe) {
      score -= 0.2;
    }
  }

  return score;
};

// --- Phase 2: Fuchs-2 Balanced (70-179 Fruechte) ---

const scorePhase2Move = (
  evaluation: MoveEvaluation,
  minSafePath: number,
  maxSpace: number,
  occupiedRatio: number
): number => {
  let score = 0;

  if (evaluation.safe) {
    score += 0.6;
  } else {
    score -= 0.3;
    if (occupiedRatio > 0.4) score -= 0.2;
  }

  if (evaluation.pathLength !== null && minSafePath < Infinity) {
    const pathDelta = evaluation.pathLength - minSafePath;
    const tolerance = occupiedRatio < 0.3 ? 2 : occupiedRatio < 0.5 ? 3 : 5;
    if (pathDelta <= tolerance) {
      score += (0.25 - pathDelta * 0.04);
    }
  }

  if (maxSpace > 0) {
    score += (evaluation.space / maxSpace) * 0.20;
  }

  return score;
};

// --- Phase 3: Fuchs-2 Space-Filling (180+ Fruechte) ---

const scorePhase3Move = (
  eval_: AreaEvaluation,
  minPath: number,
  maxSpace: number,
  occupiedRatio: number
): number => {
  let score = 0;

  if (eval_.safe) {
    score += 1.5;
  } else {
    score -= 1.0;
  }

  score += eval_.compactness * 0.30;
  score -= eval_.pockets * 0.50;
  score += eval_.continuity * 0.15;

  if (maxSpace > 0) {
    score += (eval_.space / maxSpace) * 0.20;
  }

  if (eval_.pathLength !== null && minPath > 0) {
    const pathDelta = eval_.pathLength - minPath;
    const tolerance = occupiedRatio < 0.5 ? 3 : 5;
    if (pathDelta <= tolerance) {
      score += 0.10 - pathDelta * 0.02;
    }
  }

  return score;
};

// --- Hauptfunktion ---

export const pickMartin2Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const fruitsEaten = state.fruitsEaten;
  const snakeLength = state.snake.length;
  const totalCells = size * size;
  const occupiedRatio = (snakeLength + state.obstacles.length) / totalCells;
  const foodReachable = isFoodReachable(state, size);

  const phase = fruitsEaten < 70 ? 1 : fruitsEaten < 180 ? 2 : 3;

  // Alle Moves evaluieren
  const evaluations: MoveEvaluation[] = [];
  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (evaluation) evaluations.push(evaluation);
  }

  if (evaluations.length === 0) {
    return directionToTail(state, size);
  }

  // === Phase 1: MIMO Flash ===
  if (phase === 1) {
    if (!foodReachable) {
      let bestSpace: MoveEvaluation | null = null;
      for (const evaluation of evaluations) {
        if (!bestSpace || evaluation.space > bestSpace.space) {
          bestSpace = evaluation;
        }
      }
      return bestSpace?.direction ?? null;
    }

    let bestScore = -Infinity;
    let bestDirection: Direction | null = null;
    for (const evaluation of evaluations) {
      const score = scoreMimoMove(evaluation, snakeLength, occupiedRatio, foodReachable);
      if (score > bestScore) {
        bestScore = score;
        bestDirection = evaluation.direction;
      }
    }

    if (bestDirection === null || bestScore < 0) {
      return directionToTail(state, size);
    }

    return bestDirection;
  }

  // === Phase 2 & 3: Fuchs-2 mit Dead-End-Filter ===
  const minSpace = Math.max(Math.floor(snakeLength * 0.3), 10);
  const viable = evaluations.filter((e) => e.space >= minSpace);
  const pool = viable.length > 0 ? viable : evaluations;

  // === Phase 2: Fuchs-2 Balanced ===
  if (phase === 2) {
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

    const safePool = pool.filter((e) => e.safe);
    const scoringPool = safePool.length > 0 ? safePool : pool;

    let minSafePath = Infinity;
    let maxSpace = 0;
    for (const e of scoringPool) {
      if (e.pathLength !== null && e.pathLength < minSafePath) minSafePath = e.pathLength;
      if (e.space > maxSpace) maxSpace = e.space;
    }

    let bestScore = -Infinity;
    let bestDir: Direction | null = null;
    for (const e of scoringPool) {
      const score = scorePhase2Move(e, minSafePath, maxSpace, occupiedRatio);
      if (score > bestScore) {
        bestScore = score;
        bestDir = e.direction;
      }
    }
    return bestDir ?? directionToTail(state, size);
  }

  // === Phase 3: Fuchs-2 Space-Filling ===
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

  const areaEvals = pool.map((e) => evaluateAreaMove(state, size, e));

  const safePool = areaEvals.filter((e) => e.safe);
  const scoringPool = safePool.length > 0 ? safePool : areaEvals;

  let minPath = Infinity;
  let maxSpace = 0;
  for (const e of scoringPool) {
    if (e.pathLength !== null && e.pathLength < minPath) minPath = e.pathLength;
    if (e.space > maxSpace) maxSpace = e.space;
  }
  if (minPath === Infinity) minPath = 1;

  let bestScore = -Infinity;
  let bestDir: Direction | null = null;
  for (const e of scoringPool) {
    const score = scorePhase3Move(e, minPath, maxSpace, occupiedRatio);
    if (score > bestScore) {
      bestScore = score;
      bestDir = e.direction;
    }
  }

  return bestDir ?? directionToTail(state, size);
};
