import { type Direction, type GameState } from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

const betterByPathThenSpace = (
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

const betterBySpaceThenPath = (
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

export const pickBalancedDirection = (
  state: GameState,
  size: number
): Direction | null => {
  if (!isFoodReachable(state, size)) {
    return null;
  }

  let bestSafe: MoveEvaluation | null = null;
  let bestUnsafe: MoveEvaluation | null = null;

  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (!evaluation) {
      continue;
    }

    if (evaluation.safe) {
      if (betterByPathThenSpace(evaluation, bestSafe)) {
        bestSafe = evaluation;
      }
    } else if (betterBySpaceThenPath(evaluation, bestUnsafe)) {
      bestUnsafe = evaluation;
    }
  }

  if (bestSafe) {
    return bestSafe.direction;
  }

  if (bestUnsafe) {
    return bestUnsafe.direction;
  }

  return directionToTail(state, size);
};
