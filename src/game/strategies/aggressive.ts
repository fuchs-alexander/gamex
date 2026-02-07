import { type Direction, type GameState } from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

const betterByShortestPath = (
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

const betterBySpace = (
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

export const pickAggressiveDirection = (
  state: GameState,
  size: number
): Direction | null => {
  if (!isFoodReachable(state, size)) {
    return null;
  }

  let bestPath: MoveEvaluation | null = null;
  let bestSpace: MoveEvaluation | null = null;

  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (!evaluation) {
      continue;
    }

    if (evaluation.pathLength !== null) {
      if (betterByShortestPath(evaluation, bestPath)) {
        bestPath = evaluation;
      }
    } else if (betterBySpace(evaluation, bestSpace)) {
      bestSpace = evaluation;
    }
  }

  if (bestPath) {
    return bestPath.direction;
  }

  if (bestSpace) {
    return bestSpace.direction;
  }

  return directionToTail(state, size);
};
