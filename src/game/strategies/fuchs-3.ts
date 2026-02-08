import { type Direction, type GameState } from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

export const pickFuchs3Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const snakeLen = state.snake.length;
  const totalCells = size * size;
  const occupiedRatio = (snakeLen + state.obstacles.length) / totalCells;
  const foodReachable = isFoodReachable(state, size);

  const evaluations: MoveEvaluation[] = [];
  for (const dir of directions) {
    const ev = evaluateMove(state, size, dir);
    if (ev) evaluations.push(ev);
  }

  if (evaluations.length === 0) return directionToTail(state, size);

  if (!foodReachable) {
    let bestSpace: MoveEvaluation | null = null;
    for (const ev of evaluations) {
      if (!bestSpace || ev.space > bestSpace.space) bestSpace = ev;
    }
    return bestSpace?.direction ?? null;
  }

  const t = Math.max(0, Math.min(1, (occupiedRatio - 0.40) / 0.30));
  const spaceW = 0.40 - 0.12 * t;
  const foodW = 0.20 + 0.15 * t;

  let bestScore = -Infinity;
  let bestDir: Direction | null = null;

  for (const ev of evaluations) {
    let s = 0;

    s += (ev.space / (snakeLen * 2)) * spaceW;

    if (ev.safe) {
      s += 0.3;
    } else {
      s -= Math.max(0.1, 0.3 - (snakeLen / 50));
    }

    if (ev.pathLength !== null) {
      s += (1 / (ev.pathLength + 1)) * foodW;
    }

    if (occupiedRatio > 0.5 && !ev.safe) {
      s -= 0.2;
    }

    if (s > bestScore) {
      bestScore = s;
      bestDir = ev.direction;
    }
  }

  if (bestDir === null || bestScore < 0) return directionToTail(state, size);
  return bestDir;
};
