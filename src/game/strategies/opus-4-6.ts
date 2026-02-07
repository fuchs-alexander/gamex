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
  maxPath: number,
  maxSpace: number,
  occupiedRatio: number
): number => {
  let pathWeight: number;
  let spaceWeight: number;
  let safetyBonus: number;

  if (occupiedRatio < 0.15) {
    // Fruehes Spiel: aggressiv Futter jagen
    pathWeight = 0.7;
    spaceWeight = 0.2;
    safetyBonus = 0.1;
  } else if (occupiedRatio < 0.4) {
    // Mittleres Spiel: ausgewogen
    pathWeight = 0.35;
    spaceWeight = 0.35;
    safetyBonus = 0.3;
  } else {
    // Spaetes Spiel: defensiv, Platz sichern
    pathWeight = 0.1;
    spaceWeight = 0.5;
    safetyBonus = 0.4;
  }

  const normalizedPath =
    evaluation.pathLength !== null && maxPath > 0
      ? evaluation.pathLength / maxPath
      : 1;

  const normalizedSpace = maxSpace > 0 ? evaluation.space / maxSpace : 0;

  let score =
    pathWeight * (1 - normalizedPath) + spaceWeight * normalizedSpace;

  if (evaluation.safe) {
    score += safetyBonus;
  }

  return score;
};

export const pickOpus46Direction = (
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

  // Bei unerreichbarem Futter: Platz maximieren
  if (!foodReachable) {
    let best: MoveEvaluation | null = null;
    for (const evaluation of evaluations) {
      if (!best || evaluation.space > best.space) {
        best = evaluation;
      }
    }
    return best?.direction ?? null;
  }

  // Normalisierungswerte berechnen
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

  // Fruehes Spiel: auch unsafe Zuege akzeptieren wenn deutlich besser
  if (occupiedRatio < 0.15) {
    let bestScore = -Infinity;
    let bestDir: Direction | null = null;
    for (const evaluation of evaluations) {
      const score = scoreMove(evaluation, maxPath, maxSpace, occupiedRatio);
      if (score > bestScore) {
        bestScore = score;
        bestDir = evaluation.direction;
      }
    }
    return bestDir;
  }

  // Ab mittlerem Spiel: safe bevorzugen, unsafe nur als Fallback
  const safeEvals = evaluations.filter((e) => e.safe);
  const pool = safeEvals.length > 0 ? safeEvals : evaluations;

  let bestScore = -Infinity;
  let bestDir: Direction | null = null;
  for (const evaluation of pool) {
    const score = scoreMove(evaluation, maxPath, maxSpace, occupiedRatio);
    if (score > bestScore) {
      bestScore = score;
      bestDir = evaluation.direction;
    }
  }

  return bestDir ?? directionToTail(state, size);
};
