export type Direction = "up" | "down" | "left" | "right";
export type GameStatus = "ready" | "running" | "paused" | "gameover";

export type Point = {
  x: number;
  y: number;
};

export type GameState = {
  snake: Point[];
  direction: Direction;
  food: Point;
  obstacles: Point[];
  lastSpawnedObstacle: Point | null;
  score: number;
  fruitsEaten: number;
  status: GameStatus;
  lastEatSimTime?: number;
  timeSinceLastFruit?: number;
  timeoutMs?: number;
};

export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

export const isOpposite = (a: Direction, b: Direction) =>
  (a === "up" && b === "down") ||
  (a === "down" && b === "up") ||
  (a === "left" && b === "right") ||
  (a === "right" && b === "left");

export const movePoint = (point: Point, direction: Direction): Point => {
  switch (direction) {
    case "up":
      return { x: point.x, y: point.y - 1 };
    case "down":
      return { x: point.x, y: point.y + 1 };
    case "left":
      return { x: point.x - 1, y: point.y };
    case "right":
      return { x: point.x + 1, y: point.y };
  }
};

export const pointKey = (point: Point) => `${point.x},${point.y}`;

export const wrapPoint = (point: Point, size: number): Point => ({
  x: (point.x + size) % size,
  y: (point.y + size) % size
});

const isInnerPoint = (point: Point, size: number): boolean =>
  point.x > 0 && point.x < size - 1 && point.y > 0 && point.y < size - 1;

const orthogonalNeighbors = (point: Point, size: number): Point[] => [
  wrapPoint({ x: point.x + 1, y: point.y }, size),
  wrapPoint({ x: point.x - 1, y: point.y }, size),
  wrapPoint({ x: point.x, y: point.y + 1 }, size),
  wrapPoint({ x: point.x, y: point.y - 1 }, size)
];

const freeExitCount = (point: Point, occupied: Set<string>, size: number): number => {
  let exits = 0;
  for (const neighbor of orthogonalNeighbors(point, size)) {
    if (!occupied.has(pointKey(neighbor))) {
      exits += 1;
    }
  }
  return exits;
};

const createsAdditionalDeadEnds = (
  occupied: Set<string>,
  candidate: Point,
  size: number
): boolean => {
  const candidateKey = pointKey(candidate);
  if (occupied.has(candidateKey)) {
    return true;
  }

  // Local dead-end delta:
  // adding an obstacle only changes dead-end state of candidate and direct neighbors.
  let deadEndDelta = 0;

  const candidateExitsBefore = freeExitCount(candidate, occupied, size);
  if (candidateExitsBefore <= 1) {
    deadEndDelta -= 1;
  }

  const seenNeighborKeys = new Set<string>();
  for (const neighbor of orthogonalNeighbors(candidate, size)) {
    const neighborKey = pointKey(neighbor);
    if (seenNeighborKeys.has(neighborKey) || occupied.has(neighborKey)) {
      continue;
    }
    seenNeighborKeys.add(neighborKey);

    const exitsBefore = freeExitCount(neighbor, occupied, size);
    const exitsAfter = Math.max(0, exitsBefore - 1);
    const wasDeadEnd = exitsBefore <= 1;
    const isDeadEnd = exitsAfter <= 1;

    if (!wasDeadEnd && isDeadEnd) {
      deadEndDelta += 1;
    } else if (wasDeadEnd && !isDeadEnd) {
      deadEndDelta -= 1;
    }
  }

  return deadEndDelta > 0;
};

const firstObstacleCandidate = (options: Point[], size: number): Point => {
  const center = (size - 1) / 2;
  return options.reduce((best, current) => {
    const bestDist = Math.abs(best.x - center) + Math.abs(best.y - center);
    const currentDist = Math.abs(current.x - center) + Math.abs(current.y - center);
    if (currentDist < bestDist) {
      return current;
    }
    if (currentDist > bestDist) {
      return best;
    }
    if (current.y < best.y) {
      return current;
    }
    if (current.y > best.y) {
      return best;
    }
    return current.x < best.x ? current : best;
  });
};

export const spawnFood = (snake: Point[], size: number, rng: Rng): Point => {
  const occupied = new Set(snake.map(pointKey));
  const options: Point[] = [];
  const safeOptions: Point[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        const point = { x, y };
        options.push(point);
        let exits = 0;
        const neighbors = [
          wrapPoint({ x: x + 1, y }, size),
          wrapPoint({ x: x - 1, y }, size),
          wrapPoint({ x, y: y + 1 }, size),
          wrapPoint({ x, y: y - 1 }, size)
        ];
        for (const neighbor of neighbors) {
          if (!occupied.has(pointKey(neighbor))) {
            exits += 1;
          }
        }
        if (exits >= 2) {
          safeOptions.push(point);
        }
      }
    }
  }

  const pool = safeOptions.length > 0 ? safeOptions : options;

  if (pool.length === 0) {
    return { x: -1, y: -1 };
  }

  const index = Math.floor(rng() * pool.length);
  return pool[Math.min(index, pool.length - 1)];
};

export const spawnObstacles = (
  snake: Point[],
  size: number,
  count: number,
  rng: Rng
): Point[] => {
  if (count <= 0) {
    return [];
  }

  const occupied = new Set(snake.map(pointKey));
  const obstacles: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const options: Point[] = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const point = { x, y };
        const key = pointKey(point);
        if (!occupied.has(key) && isInnerPoint(point, size)) {
          options.push(point);
        }
      }
    }

    if (options.length === 0) {
      break;
    }

    const safeOptions = options.filter(
      (point) => !createsAdditionalDeadEnds(occupied, point, size)
    );
    if (safeOptions.length === 0) {
      break;
    }

    const pick =
      i === 0
        ? firstObstacleCandidate(safeOptions, size)
        : safeOptions[Math.min(Math.floor(rng() * safeOptions.length), safeOptions.length - 1)];
    obstacles.push(pick);
    occupied.add(pointKey(pick));
  }

  return obstacles;
};

export const spawnObstacle = (
  occupiedPoints: Point[],
  size: number,
  rng: Rng
): Point | null => {
  const occupied = new Set(occupiedPoints.map(pointKey));
  const options: Point[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const point = { x, y };
      const key = pointKey(point);
      if (!occupied.has(key) && isInnerPoint(point, size)) {
        options.push(point);
      }
    }
  }

  if (options.length === 0) {
    return null;
  }

  const safeOptions = options.filter(
    (point) => !createsAdditionalDeadEnds(occupied, point, size)
  );
  if (safeOptions.length === 0) {
    return null;
  }

  const index = Math.floor(rng() * safeOptions.length);
  return safeOptions[Math.min(index, safeOptions.length - 1)];
};

export const createInitialState = (
  size: number,
  obstacleCount: number,
  rng: Rng = defaultRng
): GameState => {
  const mid = Math.floor(size / 2);
  const snake: Point[] = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid }
  ];

  const initialFood: Point = { x: mid, y: Math.max(1, mid - 3) };
  const obstacles = spawnObstacles([...snake, initialFood], size, obstacleCount, rng);

  return {
    snake,
    direction: "right",
    food: initialFood,
    obstacles,
    lastSpawnedObstacle: null,
    score: 0,
    fruitsEaten: 0,
    status: "ready"
  };
};

export const applyDirection = (
  state: GameState,
  direction: Direction
): GameState => {
  if (isOpposite(state.direction, direction)) {
    return state;
  }

  if (state.status === "ready") {
    return { ...state, direction, status: "running" };
  }

  return { ...state, direction };
};

export const stepGame = (
  state: GameState,
  size: number,
  rng: Rng = defaultRng
): GameState => {
  if (state.status !== "running") {
    return state;
  }

  const head = state.snake[0];
  const nextHead = wrapPoint(movePoint(head, state.direction), size);

  const bodyToCheck = state.snake.slice(0, -1).map(pointKey);
  const bodySet = new Set(bodyToCheck);
  const obstacleSet = new Set(state.obstacles.map(pointKey));

  if (bodySet.has(pointKey(nextHead)) || obstacleSet.has(pointKey(nextHead))) {
    return { ...state, status: "gameover" };
  }

  const ateFood = nextHead.x === state.food.x && nextHead.y === state.food.y;
  const nextSnake = [nextHead, ...state.snake];

  if (!ateFood) {
    nextSnake.pop();
  }

  if (ateFood) {
    const nextFruits = state.fruitsEaten + 1;
    const shouldSpawnObstacle = nextFruits % 5 === 0;
    const nextObstacle = shouldSpawnObstacle
      ? spawnObstacle([...nextSnake, ...state.obstacles], size, rng)
      : null;
    const obstacles = nextObstacle
      ? [...state.obstacles, nextObstacle]
      : state.obstacles;
    const lastSpawnedObstacle = nextObstacle
      ? nextObstacle
      : state.lastSpawnedObstacle;
    const nextFood = spawnFood([...nextSnake, ...obstacles], size, rng);
    const noFood = nextFood.x < 0;
    return {
      ...state,
      snake: nextSnake,
      food: nextFood,
      obstacles,
      lastSpawnedObstacle,
      score: state.score + 1,
      fruitsEaten: nextFruits,
      status: noFood ? "gameover" : state.status
    };
  }

  return {
    ...state,
    snake: nextSnake
  };
};

export const togglePause = (state: GameState): GameState => {
  if (state.status === "running") {
    return { ...state, status: "paused" };
  }

  if (state.status === "paused") {
    return { ...state, status: "running" };
  }

  return state;
};
