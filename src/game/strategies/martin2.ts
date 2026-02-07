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
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

/* ── Helpers (from MIMO) ── */

const computeOccupiedRatio = (state: GameState, size: number): number => {
  const totalCells = size * size;
  return (state.snake.length + state.obstacles.length) / totalCells;
};

/* ── Helpers (from Martin) ── */

const isOnBorder = (point: Point, size: number): boolean =>
  point.x === 0 || point.x === size - 1 || point.y === 0 || point.y === size - 1;

const borderClockwiseDirection = (head: Point, size: number): Direction | null => {
  if (head.y === 0 && head.x < size - 1) return "right";
  if (head.x === size - 1 && head.y < size - 1) return "down";
  if (head.y === size - 1 && head.x > 0) return "left";
  if (head.x === 0 && head.y > 0) return "up";
  return null;
};

/* ── Obstacle proximity detection ── */

const countNearbyObstacles = (
  pos: Point,
  size: number,
  obstacles: Point[]
): number => {
  const obstacleSet = new Set(obstacles.map(pointKey));
  const neighbors = [
    wrapPoint({ x: pos.x + 1, y: pos.y }, size),
    wrapPoint({ x: pos.x - 1, y: pos.y }, size),
    wrapPoint({ x: pos.x, y: pos.y + 1 }, size),
    wrapPoint({ x: pos.x, y: pos.y - 1 }, size)
  ];
  let count = 0;
  for (const n of neighbors) {
    if (obstacleSet.has(pointKey(n))) count++;
  }
  return count;
};

/* ── Phase 1: Frucht-Jäger (< 100 Früchte) — MIMO-style ── */

const scorePhase1 = (
  evaluation: MoveEvaluation,
  nextHead: Point,
  state: GameState,
  size: number,
  occupiedRatio: number,
  foodReachable: boolean
): number => {
  const snakeLength = state.snake.length;
  let score = 0;

  // Space score (MIMO)
  const spaceScore = evaluation.space / (snakeLength * 2);
  score += spaceScore * 0.4;

  // Safety (MIMO)
  if (evaluation.safe) {
    score += 0.3;
  } else {
    const unsafePenalty = Math.max(0.1, 0.3 - (snakeLength / 50));
    score -= unsafePenalty;
  }

  // Food seeking (MIMO)
  if (foodReachable && evaluation.pathLength !== null) {
    const pathScore = 1 / (evaluation.pathLength + 1);
    score += pathScore * 0.2;
  }

  // Extra unsafe penalty at high occupation (MIMO)
  if (occupiedRatio > 0.5 && !evaluation.safe) {
    score -= 0.2;
  }

  // Obstacle avoidance
  const nearObstacles = countNearbyObstacles(nextHead, size, state.obstacles);
  score -= nearObstacles * 0.15;

  return score;
};

/* ── Phase 2: Kreis-Modus (>= 100 Früchte) ── */
/* Kreist am Rand. Nur wenn Timer < 10s: Frucht holen. */

const scorePhase2 = (
  evaluation: MoveEvaluation,
  nextHead: Point,
  state: GameState,
  size: number,
  foodReachable: boolean,
  timerUrgent: boolean
): number => {
  let score = 0;

  // Safety
  if (evaluation.safe) {
    score += 0.3;
  } else {
    score -= 0.3;
  }

  // Space
  const snakeLength = state.snake.length;
  const spaceScore = evaluation.space / (snakeLength * 2);
  score += spaceScore * 0.3;

  if (timerUrgent) {
    // Timer unter 10s: maximal aggressiv Frucht holen
    if (foodReachable && evaluation.pathLength !== null) {
      const pathScore = 1 / (evaluation.pathLength + 1);
      score += pathScore * 1.5;
    }
    // Kürzester Pfad dominiert alles
    if (evaluation.pathLength !== null) {
      score -= evaluation.pathLength * 0.05;
    }
  } else {
    // Normal: am Rand kreisen
    if (isOnBorder(nextHead, size)) {
      score += 0.4;
      const clockwiseDir = borderClockwiseDirection(nextHead, size);
      if (clockwiseDir === evaluation.direction) {
        score += 0.3;
      }
    }
  }

  // Obstacle avoidance
  const nearObstacles = countNearbyObstacles(nextHead, size, state.obstacles);
  score -= nearObstacles * 0.15;

  return score;
};

/* ── Main strategy ── */

export const pickMartin2Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const occupiedRatio = computeOccupiedRatio(state, size);
  const foodReachable = isFoodReachable(state, size);
  const phase2 = state.fruitsEaten >= 100;
  const timeSinceLastFruit = state.timeSinceLastFruit ?? 0;
  const timeoutMs = state.timeoutMs ?? 30000;
  const timeRemaining = timeoutMs - timeSinceLastFruit;
  const timerUrgent = timeRemaining <= 10000;

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

  // Food unreachable fallback (MIMO): pick max space
  if (!foodReachable) {
    let bestSpace: MoveEvaluation | null = null;
    for (const evaluation of evaluations) {
      if (!bestSpace || evaluation.space > bestSpace.space) {
        bestSpace = evaluation;
      }
    }
    return bestSpace?.direction ?? directionToTail(state, size);
  }

  const head = state.snake[0];
  let bestScore = -Infinity;
  let bestDirection: Direction | null = null;

  for (const evaluation of evaluations) {
    const nextHead = wrapPoint(movePoint(head, evaluation.direction), size);

    const score = phase2
      ? scorePhase2(evaluation, nextHead, state, size, foodReachable, timerUrgent)
      : scorePhase1(evaluation, nextHead, state, size, occupiedRatio, foodReachable);

    if (score > bestScore) {
      bestScore = score;
      bestDirection = evaluation.direction;
    }
  }

  if (bestDirection === null || bestScore < 0) {
    return directionToTail(state, size);
  }

  return bestDirection;
};
