import {
  type Direction,
  type GameState,
  type Point,
  movePoint,
  wrapPoint,
  pointKey
} from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  isFoodReachable,
  floodFillCount,
  type MoveEvaluation
} from "./utils";

const isOnBorder = (point: Point, size: number): boolean =>
  point.x === 0 || point.x === size - 1 || point.y === 0 || point.y === size - 1;

const borderClockwiseDirection = (head: Point, size: number): Direction | null => {
  if (head.y === 0 && head.x < size - 1) return "right";
  if (head.x === size - 1 && head.y < size - 1) return "down";
  if (head.y === size - 1 && head.x > 0) return "left";
  if (head.x === 0 && head.y > 0) return "up";
  return null;
};

const stepSnakeForward = (snake: Point[], nextHead: Point): Point[] => {
  const next = [nextHead, ...snake];
  next.pop();
  return next;
};

type ScoredMove = {
  direction: Direction;
  score: number;
  evaluation: MoveEvaluation;
};

export const pickMartinDirection = (
  state: GameState,
  size: number
): Direction | null => {
  const head = state.snake[0];
  const timeSinceLastFruit = state.timeSinceLastFruit ?? 0;
  const timeoutMs = state.timeoutMs ?? 10000;

  const urgency = Math.min(1, timeSinceLastFruit / timeoutMs);

  const totalCells = size * size;
  const maxSpace = totalCells - state.snake.length - state.obstacles.length;
  const minRequiredSpace = Math.max(state.snake.length * 0.3, 10);

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

  const foodReachable = isFoodReachable(state, size);

  const scored: ScoredMove[] = evaluations.map((ev) => {
    let score = 0;
    const nextHead = wrapPoint(movePoint(head, ev.direction), size);
    const nextSnake = stepSnakeForward(state.snake, nextHead);

    // Safety: always top priority
    if (ev.safe) {
      score += 10;
    } else {
      score -= 5;
    }

    // Dead-end filter
    const blocked = new Set<string>([
      ...nextSnake.slice(0, -1).map(pointKey),
      ...state.obstacles.map(pointKey)
    ]);
    const immediateSpace = floodFillCount(nextHead, size, blocked);
    if (immediateSpace < minRequiredSpace) {
      score -= 20;
    }

    // Space score (always important)
    const normSpace = maxSpace > 0 ? ev.space / maxSpace : 0;
    score += normSpace * 3;

    // Border affinity (decreases with urgency)
    const borderWeight = Math.max(0, 1 - urgency * 1.25);
    if (borderWeight > 0 && isOnBorder(nextHead, size)) {
      score += 2.0 * borderWeight;
      const clockwiseDir = borderClockwiseDirection(nextHead, size);
      if (clockwiseDir === ev.direction) {
        score += 1.5 * borderWeight;
      }
    }

    // Food seeking (always active, scales with urgency)
    if (ev.pathLength !== null && foodReachable) {
      const foodWeight = urgency < 0.5 ? 0.3 : urgency < 0.8 ? 0.6 + (urgency - 0.5) * 2 : 1.0;
      score += (1 / (ev.pathLength + 1)) * 8 * foodWeight;
    }

    // Stability: prefer current direction
    if (ev.direction === state.direction) {
      score += 0.1;
    }

    return { direction: ev.direction, score, evaluation: ev };
  });

  scored.sort((a, b) => b.score - a.score);

  // Prefer safe moves
  const safeMoves = scored.filter((m) => m.evaluation.safe);
  if (safeMoves.length > 0) {
    return safeMoves[0].direction;
  }

  // Fallback: moves with enough space
  const spaciousMoves = scored.filter(
    (m) => {
      const nextHead = wrapPoint(movePoint(head, m.direction), size);
      const nextSnake = stepSnakeForward(state.snake, nextHead);
      const blocked = new Set<string>([
        ...nextSnake.slice(0, -1).map(pointKey),
        ...state.obstacles.map(pointKey)
      ]);
      return floodFillCount(nextHead, size, blocked) >= minRequiredSpace;
    }
  );
  if (spaciousMoves.length > 0) {
    return spaciousMoves[0].direction;
  }

  // Fallback: any move by score
  if (scored.length > 0) {
    return scored[0].direction;
  }

  // Last resort: direction to tail
  return directionToTail(state, size);
};
