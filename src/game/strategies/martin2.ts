import {
  type Direction,
  type GameState,
  type Point,
  isOpposite,
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
   Helpers
   ══════════════════════════════════════════════════════ */

const directionVectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const neighborPoints = (point: Point, size: number): Point[] =>
  directions.map((dir) =>
    wrapPoint(
      { x: point.x + directionVectors[dir].x, y: point.y + directionVectors[dir].y },
      size
    )
  );

/* Codex 5-3: free exits from a position */
const countImmediateExits = (
  head: Point,
  snake: Point[],
  obstacles: Point[],
  size: number
): number => {
  const blocked = new Set<string>([
    ...snake.slice(0, -1).map(pointKey),
    ...obstacles.map(pointKey)
  ]);
  let exits = 0;
  for (const dir of directions) {
    const next = wrapPoint(movePoint(head, dir), size);
    if (!blocked.has(pointKey(next))) exits += 1;
  }
  return exits;
};

/* Codex 5-3: non-backtracking options */
const countFutureOptions = (
  head: Point,
  snake: Point[],
  obstacles: Point[],
  size: number,
  previousDirection: Direction
): number => {
  const blocked = new Set<string>([
    ...snake.slice(0, -1).map(pointKey),
    ...obstacles.map(pointKey)
  ]);
  let options = 0;
  for (const dir of directions) {
    if (isOpposite(previousDirection, dir)) continue;
    const next = wrapPoint(movePoint(head, dir), size);
    if (!blocked.has(pointKey(next))) options += 1;
  }
  return options;
};

/* Fuchs: compactness (wall/body hugging) */
const compactness = (pos: Point, size: number, blocked: Set<string>): number => {
  let count = 0;
  for (const n of neighborPoints(pos, size)) {
    if (blocked.has(pointKey(n))) count++;
  }
  return count;
};

/* Fuchs: detect tiny unusable pockets */
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

/* Codex 5-3: simulate next snake */
const nextSnakeAfterMove = (state: GameState, direction: Direction, size: number) => {
  const head = state.snake[0];
  const nextHead = wrapPoint(movePoint(head, direction), size);
  const ateFood = nextHead.x === state.food.x && nextHead.y === state.food.y;
  const nextSnake = [nextHead, ...state.snake];
  if (!ateFood) nextSnake.pop();
  return { nextHead, nextSnake };
};

/* Codex 5-3: critical space threshold */
const minSurvivalSpace = (snakeLength: number) =>
  Math.max(8, Math.floor(snakeLength * 0.9));

/* ══════════════════════════════════════════════════════
   Einzige Score-Funktion: Codex 5-3 Basis + Adaptive
   Quellen: Codex 5-3, Sonnet 4-5, Opus 4-6, Fuchs,
            Fuchs-2, MIMO, Balanced, Cautious, Space,
            Aggressive, Gemini, Codex 5-2
   ══════════════════════════════════════════════════════ */

const scoreMove = (
  state: GameState,
  size: number,
  evaluation: MoveEvaluation,
  shortestSafePath: number | null,
  occupiedRatio: number
): number => {
  const { nextHead, nextSnake } = nextSnakeAfterMove(state, evaluation.direction, size);
  const snakeLength = state.snake.length;

  const immediateExits = countImmediateExits(nextHead, nextSnake, state.obstacles, size);
  const futureOptions = countFutureOptions(
    nextHead, nextSnake, state.obstacles, size, evaluation.direction
  );

  const criticalSpace = minSurvivalSpace(snakeLength);
  const foodPath = evaluation.pathLength ?? Number.POSITIVE_INFINITY;
  const pathProgress =
    shortestSafePath === null || !Number.isFinite(foodPath)
      ? 0
      : Math.max(0, shortestSafePath / Math.max(1, foodPath));

  let score = 0;

  /* ── Codex 5-3: Safety (immer aktiv) ── */
  if (evaluation.safe) {
    score += 10_000;
  } else {
    score -= occupiedRatio > 0.5 ? 20_000 : 10_000; // Sonnet 4-5: stärker bei hoher Belegung
  }

  /* ── Codex 5-3: Space (adaptiv gewichtet) ── */
  const spaceWeight = occupiedRatio < 0.25 ? 20
    : occupiedRatio < 0.50 ? 22
    : 25; // Sonnet 4-5 + Fuchs-2: steigt mit Belegung
  score += evaluation.space * spaceWeight;

  /* ── Codex 5-3: Exits + Future Options ── */
  score += immediateExits * 250;
  score += futureOptions * 180;

  /* ── Codex 5-3: Path progress ── */
  score += pathProgress * 900;

  /* ── Codex 5-3 + MIMO: Food bonus (stärker im Early Game) ── */
  if (Number.isFinite(foodPath)) {
    const foodMultiplier = occupiedRatio < 0.25 ? 1.2 : 1.0; // MIMO/Sonnet: early = aggressiver
    score += (250 / (foodPath + 1)) * foodMultiplier;
  }

  /* ── Codex 5-3: Cramped penalty ── */
  if (evaluation.space < criticalSpace) {
    score -= (criticalSpace - evaluation.space) * 420;
  }

  /* ── Fuchs + Fuchs-2: Late-Game compactness + pockets (ratio > 0.4) ── */
  if (occupiedRatio > 0.4) {
    const blocked = new Set<string>([
      ...nextSnake.map(pointKey),
      ...state.obstacles.map(pointKey)
    ]);
    score += compactness(nextHead, size, blocked) * 50;
    score -= countSmallPockets(nextHead, size, blocked) * 60;
  }

  /* ── Fuchs-2: Continuity bonus (late game) ── */
  if (occupiedRatio > 0.5 && evaluation.direction === state.direction) {
    score += 30;
  }

  /* ── Codex 5-3: Stability bias ── */
  if (evaluation.direction === state.direction) {
    score += 24;
  }

  return score;
};

/* ══════════════════════════════════════════════════════
   Hauptfunktion
   ══════════════════════════════════════════════════════ */

export const pickMartin2Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const snakeLength = state.snake.length;
  const totalCells = size * size;
  const occupiedRatio = (snakeLength + state.obstacles.length) / totalCells;

  /* ── Alle Moves evaluieren ── */
  const safeEvaluations: MoveEvaluation[] = [];
  const fallbackEvaluations: MoveEvaluation[] = [];

  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (!evaluation) continue;
    fallbackEvaluations.push(evaluation);
    if (evaluation.safe) safeEvaluations.push(evaluation);
  }

  /* ── Codex 5-3: Safe pool bevorzugt ── */
  const pool = safeEvaluations.length > 0 ? safeEvaluations : fallbackEvaluations;
  if (pool.length === 0) return directionToTail(state, size);

  /* ── Sonnet 4-5 + Codex 5-2: Food unreachable fallback ── */
  const foodReachable = isFoodReachable(state, size);
  if (!foodReachable) {
    // Sonnet 4-5: Tail-Chase wenn safe genug
    const tailDir = directionToTail(state, size);
    if (tailDir) {
      const tailEval = pool.find((e) => e.direction === tailDir);
      if (tailEval && tailEval.safe) return tailDir;
    }
    // Codex 5-2: Safe max-space fallback
    let bestSpace: MoveEvaluation | null = null;
    for (const e of pool) {
      if (!bestSpace || e.space > bestSpace.space) bestSpace = e;
    }
    return bestSpace?.direction ?? directionToTail(state, size);
  }

  /* ── Codex 5-3: shortestSafePath für pathProgress ── */
  let shortestSafePath: number | null = null;
  for (const ev of safeEvaluations) {
    if (ev.pathLength === null) continue;
    if (shortestSafePath === null || ev.pathLength < shortestSafePath) {
      shortestSafePath = ev.pathLength;
    }
  }

  /* ── Score und beste Richtung wählen ── */
  let best: { direction: Direction; score: number } | null = null;
  for (const ev of pool) {
    const s = scoreMove(state, size, ev, shortestSafePath, occupiedRatio);
    if (!best || s > best.score) {
      best = { direction: ev.direction, score: s };
    }
  }

  return best?.direction ?? directionToTail(state, size);
};
