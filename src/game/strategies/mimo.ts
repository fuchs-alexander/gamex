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


const scoreMove = (
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


export const pickMimoDirection = (
  state: GameState,
  size: number
): Direction | null => {
  const snakeLength = state.snake.length;
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
    const score = scoreMove(evaluation, snakeLength, occupiedRatio, foodReachable);
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