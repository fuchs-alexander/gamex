import { type Direction, type GameState } from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

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

export const pickSpaceDirection = (
  state: GameState,
  size: number
): Direction | null => {
  if (!isFoodReachable(state, size)) {
    return null;
  }

  let best: MoveEvaluation | null = null;

  for (const dir of directions) {
    const evaluation = evaluateMove(state, size, dir);
    if (!evaluation) {
      continue;
    }

    if (betterBySpace(evaluation, best)) {
      best = evaluation;
    }
  }

  if (best) {
    return best.direction;
  }

  return directionToTail(state, size);
};
