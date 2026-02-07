import {
  type Direction,
  type GameState,
  type Point,
  isOpposite,
  movePoint,
  pointKey,
  wrapPoint
} from "../snake";

export type MoveEvaluation = {
  direction: Direction;
  pathLength: number | null;
  safe: boolean;
  space: number;
};

export const directions: Direction[] = ["up", "down", "left", "right"];

const directionVectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const add = (a: Point, b: Point) => ({ x: a.x + b.x, y: a.y + b.y });

const neighbors = (point: Point, size: number): Point[] =>
  directions.map((dir) => wrapPoint(add(point, directionVectors[dir]), size));

export const floodFillCount = (
  start: Point,
  size: number,
  blocked: Set<string>
): number => {
  const queue: Point[] = [start];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = pointKey(current);
    if (visited.has(key) || blocked.has(key)) {
      continue;
    }
    visited.add(key);
    for (const next of neighbors(current, size)) {
      const nextKey = pointKey(next);
      if (!visited.has(nextKey) && !blocked.has(nextKey)) {
        queue.push(next);
      }
    }
  }

  return visited.size;
};

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export const directionFromStep = (
  start: Point,
  next: Point,
  size: number
): Direction => {
  const dx = (next.x - start.x + size) % size;
  const dy = (next.y - start.y + size) % size;

  if (dx === 1) return "right";
  if (dx === size - 1) return "left";
  if (dy === 1) return "down";
  return "up";
};

const parsePoint = (key: string): Point => {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
};

const buildFreeTimes = (snake: Point[]): Map<string, number> => {
  const freeTimes = new Map<string, number>();
  const length = snake.length;
  snake.forEach((point, index) => {
    freeTimes.set(pointKey(point), length - index);
  });
  return freeTimes;
};

export const bfsPathWithTiming = (
  start: Point,
  target: Point,
  size: number,
  snake: Point[],
  obstacles: Point[]
): Point[] | null => {
  const startKey = pointKey(start);
  const targetKey = pointKey(target);
  const obstacleSet = new Set(obstacles.map(pointKey));
  const freeTimes = buildFreeTimes(snake);
  const queue: Point[] = [start];
  const cameFrom = new Map<string, string | null>([[startKey, null]]);
  const distances = new Map<string, number>([[startKey, 0]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = pointKey(current);
    if (currentKey === targetKey) {
      break;
    }
    const distance = distances.get(currentKey) ?? 0;

    for (const next of neighbors(current, size)) {
      const nextKey = pointKey(next);
      if (cameFrom.has(nextKey) || obstacleSet.has(nextKey)) {
        continue;
      }
      const arrival = distance + 1;
      const freeAt = freeTimes.get(nextKey);
      if (freeAt !== undefined && arrival < freeAt) {
        continue;
      }
      cameFrom.set(nextKey, currentKey);
      distances.set(nextKey, arrival);
      queue.push(next);
    }
  }

  if (!cameFrom.has(targetKey)) {
    return null;
  }

  const path: Point[] = [];
  let currentKey: string | null = targetKey;
  while (currentKey) {
    path.push(parsePoint(currentKey));
    currentKey = cameFrom.get(currentKey) ?? null;
  }
  path.reverse();
  return path;
};

export const simulateSnakePath = (
  snake: Point[],
  path: Point[],
  food: Point
): Point[] => {
  const nextSnake = [...snake];
  for (let i = 1; i < path.length; i += 1) {
    const nextHead = path[i];
    nextSnake.unshift(nextHead);
    if (!samePoint(nextHead, food)) {
      nextSnake.pop();
    }
  }
  return nextSnake;
};

export const stepSnake = (snake: Point[], nextHead: Point, food: Point): Point[] => {
  const nextSnake = [nextHead, ...snake];
  if (!samePoint(nextHead, food)) {
    nextSnake.pop();
  }
  return nextSnake;
};

export const hasPathToTail = (
  snake: Point[],
  size: number,
  obstacles: Point[]
): boolean => {
  const head = snake[0];
  const tail = snake[snake.length - 1];
  return Boolean(bfsPathWithTiming(head, tail, size, snake, obstacles));
};

export const isFoodReachable = (state: GameState, size: number): boolean => {
  const head = state.snake[0];
  return Boolean(
    bfsPathWithTiming(head, state.food, size, state.snake, state.obstacles)
  );
};

export const directionToTail = (
  state: GameState,
  size: number
): Direction | null => {
  const head = state.snake[0];
  const tail = state.snake[state.snake.length - 1];
  const tailPath = bfsPathWithTiming(head, tail, size, state.snake, state.obstacles);
  if (tailPath && tailPath.length > 1) {
    const dir = directionFromStep(head, tailPath[1], size);
    if (!isOpposite(state.direction, dir)) {
      return dir;
    }
  }
  return null;
};

export const evaluateMove = (
  state: GameState,
  size: number,
  direction: Direction
): MoveEvaluation | null => {
  if (isOpposite(state.direction, direction)) {
    return null;
  }

  const head = state.snake[0];
  const blockedForMove = new Set<string>([
    ...state.snake.slice(0, -1).map(pointKey),
    ...state.obstacles.map(pointKey)
  ]);

  const nextHead = wrapPoint(movePoint(head, direction), size);
  if (blockedForMove.has(pointKey(nextHead))) {
    return null;
  }

  const nextSnake = stepSnake(state.snake, nextHead, state.food);
  const pathFromNext = bfsPathWithTiming(
    nextHead,
    state.food,
    size,
    nextSnake,
    state.obstacles
  );

  const pathLength = pathFromNext ? pathFromNext.length : null;
  let safe = false;
  let space = 0;

  if (pathFromNext) {
    const fullPath = [head, ...pathFromNext];
    const simulatedSnake = simulateSnakePath(state.snake, fullPath, state.food);
    safe = hasPathToTail(simulatedSnake, size, state.obstacles);
    const blockedAfterFood = new Set<string>([
      ...simulatedSnake.slice(0, -1).map(pointKey),
      ...state.obstacles.map(pointKey)
    ]);
    space = floodFillCount(simulatedSnake[0], size, blockedAfterFood);
  } else {
    const blockedAfterStep = new Set<string>([
      ...nextSnake.slice(0, -1).map(pointKey),
      ...state.obstacles.map(pointKey)
    ]);
    space = floodFillCount(nextHead, size, blockedAfterStep);
  }

  return {
    direction,
    pathLength,
    safe,
    space
  };
};
