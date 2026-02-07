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
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

/* ══════════════════════════════════════════════════════
   Martin Hulus 2 — Eigene Strategie
   Kernprinzip: Maximiere Bewegungsfreiheit,
   suche Essen nach Dringlichkeit
   ══════════════════════════════════════════════════════ */

/** Simulate next snake position after moving */
const simulateStep = (state: GameState, direction: Direction, size: number) => {
  const head = state.snake[0];
  const nextHead = wrapPoint(movePoint(head, direction), size);
  const ateFood = nextHead.x === state.food.x && nextHead.y === state.food.y;
  const nextSnake = [nextHead, ...state.snake];
  if (!ateFood) nextSnake.pop();
  return { nextHead, nextSnake };
};

/** Build the set of blocked cells after a simulated move */
const buildBlocked = (snake: Point[], obstacles: Point[]): Set<string> =>
  new Set<string>([
    ...snake.slice(0, -1).map(pointKey),
    ...obstacles.map(pointKey)
  ]);

/** Count open exits from a position (1 step) */
const countExits = (
  pos: Point,
  blocked: Set<string>,
  size: number
): number => {
  let exits = 0;
  for (const dir of directions) {
    const next = wrapPoint(movePoint(pos, dir), size);
    if (!blocked.has(pointKey(next))) exits++;
  }
  return exits;
};

/** 2-step reachability: how many unique cells can we reach in 2 moves
    (without backtracking). Looks further ahead than simple exit counting. */
const twoStepReach = (
  pos: Point,
  fromDir: Direction,
  blocked: Set<string>,
  size: number
): number => {
  const seen = new Set<string>([pointKey(pos)]);
  let count = 0;

  for (const dir1 of directions) {
    if (isOpposite(fromDir, dir1)) continue;
    const step1 = wrapPoint(movePoint(pos, dir1), size);
    const key1 = pointKey(step1);
    if (blocked.has(key1)) continue;
    if (!seen.has(key1)) {
      seen.add(key1);
      count++;
    }

    for (const dir2 of directions) {
      if (isOpposite(dir1, dir2)) continue;
      const step2 = wrapPoint(movePoint(step1, dir2), size);
      const key2 = pointKey(step2);
      if (!blocked.has(key2) && !seen.has(key2)) {
        seen.add(key2);
        count++;
      }
    }
  }
  return count;
};

/** Timer pressure: 0 = relaxed, 1 = critical.
    Starts rising at 40% of timeout, reaches 1.0 at 80%. */
const getTimerPressure = (state: GameState): number => {
  const elapsed = state.timeSinceLastFruit ?? 0;
  const timeout = state.timeoutMs ?? 10000;
  const ratio = elapsed / timeout;
  if (ratio < 0.4) return 0;
  return Math.min(1, (ratio - 0.4) / 0.4);
};

/** Dynamic minimum safe space — adapts to board congestion */
const minSafeSpace = (snakeLength: number, fillRatio: number): number => {
  const base = Math.max(8, Math.floor(snakeLength * 0.8));
  if (fillRatio > 0.5) return Math.floor(base * 1.4);
  if (fillRatio > 0.3) return Math.floor(base * 1.1);
  return base;
};

/** Score a single move — one smooth function, no phases */
const scoreMove = (
  state: GameState,
  size: number,
  evaluation: MoveEvaluation,
  pressure: number,
  fillRatio: number
): number => {
  const { nextHead, nextSnake } = simulateStep(state, evaluation.direction, size);
  const blocked = buildBlocked(nextSnake, state.obstacles);
  const snakeLength = state.snake.length;

  let score = 0;

  /* ── Safety: safe moves always preferred ── */
  if (evaluation.safe) {
    score += 10_000;
  } else {
    score -= 10_000 * (1 + fillRatio);
  }

  /* ── Space: survival metric ── */
  const spaceWeight = 15 + fillRatio * 15;
  score += evaluation.space * spaceWeight;

  const threshold = minSafeSpace(snakeLength, fillRatio);
  if (evaluation.space < threshold) {
    score -= (threshold - evaluation.space) * 400;
  }

  /* ── Mobility: 1-step exits + 2-step reach ── */
  const exits = countExits(nextHead, blocked, size);
  score += exits * 200;

  const reach = twoStepReach(nextHead, evaluation.direction, blocked, size);
  score += reach * 25;

  /* ── Food: urgency scales with timer pressure ── */
  const foodPath = evaluation.pathLength ?? Number.POSITIVE_INFINITY;
  if (Number.isFinite(foodPath)) {
    const baseFoodScore = 300 / (foodPath + 1);
    score += baseFoodScore * (1 + pressure * 2);
  }

  /* ── Stability: reduce unnecessary direction changes ── */
  if (evaluation.direction === state.direction) {
    score += 20;
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
  const fillRatio = (snakeLength + state.obstacles.length) / totalCells;
  const pressure = getTimerPressure(state);

  /* Evaluate all possible moves */
  const safeEvals: MoveEvaluation[] = [];
  const allEvals: MoveEvaluation[] = [];

  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (!evaluation) continue;
    allEvals.push(evaluation);
    if (evaluation.safe) safeEvals.push(evaluation);
  }

  /* Always prefer safe moves */
  const pool = safeEvals.length > 0 ? safeEvals : allEvals;
  if (pool.length === 0) return directionToTail(state, size);

  /* Food unreachable: survival mode */
  const foodReachable = isFoodReachable(state, size);
  if (!foodReachable) {
    const tailDir = directionToTail(state, size);
    if (tailDir) {
      const tailEval = pool.find((e) => e.direction === tailDir);
      if (tailEval && tailEval.safe) return tailDir;
    }
    let bestSpace: MoveEvaluation | null = null;
    for (const e of pool) {
      if (!bestSpace || e.space > bestSpace.space) bestSpace = e;
    }
    return bestSpace?.direction ?? directionToTail(state, size);
  }

  /* Score all moves and pick the best */
  let best: { direction: Direction; score: number } | null = null;
  for (const ev of pool) {
    const s = scoreMove(state, size, ev, pressure, fillRatio);
    if (!best || s > best.score) {
      best = { direction: ev.direction, score: s };
    }
  }

  return best?.direction ?? directionToTail(state, size);
};
