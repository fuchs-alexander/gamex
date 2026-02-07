import {
  isOpposite,
  movePoint,
  pointKey,
  type Direction,
  type GameState,
  wrapPoint
} from "../snake";
import { directionToTail, directions, evaluateMove, type MoveEvaluation } from "./utils";

type Candidate = {
  evaluation: MoveEvaluation;
  score: number;
};

const minSurvivalSpace = (snakeLength: number) =>
  Math.max(8, Math.floor(snakeLength * 0.9));

const nextSnakeAfterMove = (state: GameState, direction: Direction, size: number) => {
  const head = state.snake[0];
  const nextHead = wrapPoint(movePoint(head, direction), size);
  const ateFood = nextHead.x === state.food.x && nextHead.y === state.food.y;
  const nextSnake = [nextHead, ...state.snake];
  if (!ateFood) {
    nextSnake.pop();
  }
  return { nextHead, nextSnake };
};

const countImmediateExits = (
  head: { x: number; y: number },
  snake: GameState["snake"],
  obstacles: GameState["obstacles"],
  size: number
) => {
  const blocked = new Set<string>([
    ...snake.slice(0, -1).map(pointKey),
    ...obstacles.map(pointKey)
  ]);
  let exits = 0;
  for (const dir of directions) {
    const next = wrapPoint(movePoint(head, dir), size);
    if (!blocked.has(pointKey(next))) {
      exits += 1;
    }
  }
  return exits;
};

const countFutureOptions = (
  head: { x: number; y: number },
  snake: GameState["snake"],
  obstacles: GameState["obstacles"],
  size: number,
  previousDirection: Direction
) => {
  const blocked = new Set<string>([
    ...snake.slice(0, -1).map(pointKey),
    ...obstacles.map(pointKey)
  ]);
  let options = 0;
  for (const dir of directions) {
    if (isOpposite(previousDirection, dir)) {
      continue;
    }
    const next = wrapPoint(movePoint(head, dir), size);
    if (!blocked.has(pointKey(next))) {
      options += 1;
    }
  }
  return options;
};

const scoreMove = (
  state: GameState,
  size: number,
  evaluation: MoveEvaluation,
  shortestSafePath: number | null
) => {
  const { nextHead, nextSnake } = nextSnakeAfterMove(state, evaluation.direction, size);
  const immediateExits = countImmediateExits(
    nextHead,
    nextSnake,
    state.obstacles,
    size
  );
  const futureOptions = countFutureOptions(
    nextHead,
    nextSnake,
    state.obstacles,
    size,
    evaluation.direction
  );
  const criticalSpace = minSurvivalSpace(state.snake.length);
  const foodPath = evaluation.pathLength ?? Number.POSITIVE_INFINITY;
  const pathProgress =
    shortestSafePath === null || !Number.isFinite(foodPath)
      ? 0
      : Math.max(0, shortestSafePath / Math.max(1, foodPath));

  let score = 0;

  // Primary objective: stay in positions that keep long-term mobility.
  score += evaluation.safe ? 10_000 : -10_000;
  score += evaluation.space * 20;
  score += immediateExits * 250;
  score += futureOptions * 180;

  // Secondary objective: still move toward food when it is safely reachable.
  score += pathProgress * 900;
  if (Number.isFinite(foodPath)) {
    score += 250 / (foodPath + 1);
  }

  // Avoid entering cramped pockets unless there is no alternative.
  if (evaluation.space < criticalSpace) {
    score -= (criticalSpace - evaluation.space) * 420;
  }

  // Small stability bias to reduce jitter.
  if (evaluation.direction === state.direction) {
    score += 24;
  }

  return score;
};

export const pickCodex53Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const safeEvaluations: MoveEvaluation[] = [];
  const fallbackEvaluations: MoveEvaluation[] = [];

  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (!evaluation) {
      continue;
    }
    fallbackEvaluations.push(evaluation);
    if (evaluation.safe) {
      safeEvaluations.push(evaluation);
    }
  }

  const pool = safeEvaluations.length > 0 ? safeEvaluations : fallbackEvaluations;
  if (pool.length === 0) {
    return directionToTail(state, size);
  }

  let shortestSafePath: number | null = null;
  for (const evaluation of safeEvaluations) {
    if (evaluation.pathLength === null) {
      continue;
    }
    if (shortestSafePath === null || evaluation.pathLength < shortestSafePath) {
      shortestSafePath = evaluation.pathLength;
    }
  }

  let best: Candidate | null = null;
  for (const evaluation of pool) {
    const score = scoreMove(state, size, evaluation, shortestSafePath);
    if (!best || score > best.score) {
      best = { evaluation, score };
    }
  }

  if (best) {
    return best.evaluation.direction;
  }

  return directionToTail(state, size);
};
