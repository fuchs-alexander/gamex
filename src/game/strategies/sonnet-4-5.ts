import { type Direction, type GameState } from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

const computeOccupiedRatio = (state: GameState, size: number): number => {
  const totalCells = size * size;
  const occupiedCells = state.snake.length + state.obstacles.length;
  return occupiedCells / totalCells;
};

const computeMinimumSafeSpace = (snakeLength: number): number => {
  return Math.max(snakeLength * 1.2, 15);
};

const scoreMove = (
  evaluation: MoveEvaluation,
  state: GameState,
  maxPath: number,
  maxSpace: number,
  occupiedRatio: number,
  foodReachable: boolean
): number => {
  const snakeLength = state.snake.length;
  let pathWeight: number;
  let spaceWeight: number;
  let safetyWeight: number;

  if (occupiedRatio < 0.12) {
    pathWeight = 0.45;
    spaceWeight = 0.35;
    safetyWeight = 0.2;
  } else if (occupiedRatio < 0.25) {
    pathWeight = 0.35;
    spaceWeight = 0.4;
    safetyWeight = 0.25;
  } else if (occupiedRatio < 0.45) {
    pathWeight = 0.2;
    spaceWeight = 0.45;
    safetyWeight = 0.35;
  } else if (occupiedRatio < 0.65) {
    pathWeight = 0.1;
    spaceWeight = 0.5;
    safetyWeight = 0.4;
  } else {
    pathWeight = 0.05;
    spaceWeight = 0.55;
    safetyWeight = 0.4;
  }

  let score = 0;

  if (evaluation.pathLength !== null && foodReachable && maxPath > 0) {
    const normalizedPath = evaluation.pathLength / maxPath;
    score += pathWeight * (1 - normalizedPath);
  }

  if (maxSpace > 0) {
    const normalizedSpace = evaluation.space / maxSpace;
    score += spaceWeight * normalizedSpace;
  }

  if (evaluation.safe) {
    score += safetyWeight;
  } else {
    const unsafePenalty = safetyWeight * (0.5 + occupiedRatio);
    score -= unsafePenalty;
  }

  const minSafeSpace = computeMinimumSafeSpace(snakeLength);
  if (evaluation.space >= minSafeSpace) {
    score += 0.15;
  }

  if (evaluation.space < snakeLength) {
    score -= 0.3;
  }

  if (occupiedRatio > 0.5 && !evaluation.safe) {
    score -= 0.4;
  }

  return score;
};

export const pickSonnet45Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const occupiedRatio = computeOccupiedRatio(state, size);
  const foodReachable = isFoodReachable(state, size);

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

  if (!foodReachable) {
    const safeEvals = evaluations.filter((e) => e.safe);
    const pool = safeEvals.length > 0 ? safeEvals : evaluations;
    
    let bestSpace: MoveEvaluation | null = null;
    for (const evaluation of pool) {
      if (!bestSpace || evaluation.space > bestSpace.space) {
        bestSpace = evaluation;
      }
    }

    const tailDir = directionToTail(state, size);
    if (tailDir) {
      const tailEval = evaluations.find((e) => e.direction === tailDir);
      if (
        tailEval &&
        tailEval.safe &&
        bestSpace &&
        tailEval.space >= bestSpace.space * 0.8
      ) {
        return tailDir;
      }
    }

    return bestSpace?.direction ?? tailDir;
  }

  let maxPath = 0;
  let maxSpace = 0;
  for (const evaluation of evaluations) {
    if (evaluation.pathLength !== null && evaluation.pathLength > maxPath) {
      maxPath = evaluation.pathLength;
    }
    if (evaluation.space > maxSpace) {
      maxSpace = evaluation.space;
    }
  }

  if (occupiedRatio < 0.15) {
    let bestScore = -Infinity;
    let bestDir: Direction | null = null;

    for (const evaluation of evaluations) {
      const score = scoreMove(
        evaluation,
        state,
        maxPath,
        maxSpace,
        occupiedRatio,
        foodReachable
      );
      if (score > bestScore) {
        bestScore = score;
        bestDir = evaluation.direction;
      }
    }

    return bestDir ?? directionToTail(state, size);
  }

  const safeEvals = evaluations.filter((e) => e.safe);

  if (safeEvals.length > 0) {
    let bestScore = -Infinity;
    let bestDir: Direction | null = null;

    for (const evaluation of safeEvals) {
      const score = scoreMove(
        evaluation,
        state,
        maxPath,
        maxSpace,
        occupiedRatio,
        foodReachable
      );
      if (score > bestScore) {
        bestScore = score;
        bestDir = evaluation.direction;
      }
    }

    return bestDir ?? directionToTail(state, size);
  }

  if (occupiedRatio > 0.5) {
    const tailDir = directionToTail(state, size);
    if (tailDir) {
      return tailDir;
    }
  }

  let bestScore = -Infinity;
  let bestDir: Direction | null = null;

  for (const evaluation of evaluations) {
    const score = scoreMove(
      evaluation,
      state,
      maxPath,
      maxSpace,
      occupiedRatio,
      foodReachable
    );
    if (score > bestScore) {
      bestScore = score;
      bestDir = evaluation.direction;
    }
  }

  return bestDir ?? directionToTail(state, size);
};
