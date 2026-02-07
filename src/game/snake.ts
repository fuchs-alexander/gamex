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

export const spawnFood = (snake: Point[], size: number, rng: Rng): Point => {
  const occupied = new Set(snake.map(pointKey));
  const options: Point[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!occupied.has(`${x},${y}`)) {
        options.push({ x, y });
      }
    }
  }

  if (options.length === 0) {
    return { x: -1, y: -1 };
  }

  const index = Math.floor(rng() * options.length);
  return options[Math.min(index, options.length - 1)];
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
  const options: Point[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        options.push({ x, y });
      }
    }
  }

  const obstacles: Point[] = [];
  let available = options;
  for (let i = 0; i < count && available.length > 0; i += 1) {
    const index = Math.floor(rng() * available.length);
    const pick = available[Math.min(index, available.length - 1)];
    obstacles.push(pick);
    const pickKey = pointKey(pick);
    available = available.filter((point) => pointKey(point) !== pickKey);
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
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        options.push({ x, y });
      }
    }
  }

  if (options.length === 0) {
    return null;
  }

  const index = Math.floor(rng() * options.length);
  return options[Math.min(index, options.length - 1)];
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

  const obstacles = spawnObstacles(snake, size, obstacleCount, rng);

  return {
    snake,
    direction: "right",
    food: spawnFood([...snake, ...obstacles], size, rng),
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
