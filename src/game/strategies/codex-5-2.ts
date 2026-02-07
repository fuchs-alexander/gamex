import { type Direction, type GameState } from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

const byShortestPathThenSpace = (
  candidate: MoveEvaluation,
  current: MoveEvaluation | null
): boolean => {
  if (!current) {
    return true;
  }
  const currentLen = current.pathLength ?? Number.POSITIVE_INFINITY;
  const candidateLen = candidate.pathLength ?? Number.POSITIVE_INFINITY;
  if (candidateLen < currentLen) {
    return true;
  }
  if (candidateLen === currentLen && candidate.space > current.space) {
    return true;
  }
  return false;
};

const bySpaceThenPath = (
  candidate: MoveEvaluation,
  current: MoveEvaluation | null
): boolean => {
  if (!current) {
    return true;
  }
  if (candidate.space > current.space) {
    return true;
  }
  if (
    candidate.space === current.space &&
    (candidate.pathLength ?? Number.POSITIVE_INFINITY) <
      (current.pathLength ?? Number.POSITIVE_INFINITY)
  ) {
    return true;
  }
  return false;
};

const spaceThreshold = (snakeLength: number) =>
  Math.max(8, Math.floor(snakeLength * 0.9));

export const pickCodex52Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const reachable = isFoodReachable(state, size);

  let bestSafe: MoveEvaluation | null = null;
  let bestSafeWide: MoveEvaluation | null = null;
  let bestFood: MoveEvaluation | null = null;
  let bestSpace: MoveEvaluation | null = null;

  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (!evaluation) {
      continue;
    }

    if (evaluation.safe) {
      if (byShortestPathThenSpace(evaluation, bestSafe)) {
        bestSafe = evaluation;
      }
      if (evaluation.space >= spaceThreshold(state.snake.length)) {
        if (byShortestPathThenSpace(evaluation, bestSafeWide)) {
          bestSafeWide = evaluation;
        }
      }
    }

    if (evaluation.pathLength !== null) {
      if (byShortestPathThenSpace(evaluation, bestFood)) {
        bestFood = evaluation;
      }
    }

    if (bySpaceThenPath(evaluation, bestSpace)) {
      bestSpace = evaluation;
    }
  }

  if (!reachable) {
    const tailDir = directionToTail(state, size);
    return tailDir ?? bestSpace?.direction ?? null;
  }

  if (bestSafeWide) {
    return bestSafeWide.direction;
  }

  if (bestSafe) {
    return bestSafe.direction;
  }

  if (bestFood) {
    return bestFood.direction;
  }

  return directionToTail(state, size) ?? bestSpace?.direction ?? null;
};
