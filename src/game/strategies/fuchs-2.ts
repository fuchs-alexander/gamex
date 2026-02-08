import {
  type Direction,
  type GameState,
  type Point,
  movePoint,
  pointKey,
  wrapPoint
} from "../snake";
import {
  directionToTail,
  directions,
  evaluateMove,
  floodFillCount,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";


// --- Hamiltonian Cycle (Zigzag, cached) ---

let cachedSize = 0;
let cachedCycleIndex: Map<string, number> | null = null;

const buildCycleIndex = (size: number): Map<string, number> => {
  if (cachedCycleIndex && cachedSize === size) return cachedCycleIndex;

  const index = new Map<string, number>();
  let step = 0;
  for (let row = 0; row < size; row++) {
    if (row % 2 === 0) {
      for (let col = 0; col < size; col++) {
        index.set(pointKey({ x: col, y: row }), step++);
      }
    } else {
      for (let col = size - 1; col >= 0; col--) {
        index.set(pointKey({ x: col, y: row }), step++);
      }
    }
  }
  cachedSize = size;
  cachedCycleIndex = index;
  return index;
};

const cycleDist = (from: number, to: number, total: number): number =>
  (to - from + total) % total;


// --- Augmented Evaluation ---

type AugEval = MoveEvaluation & {
  immediateExits: number;
  compactness: number;
  pockets: number;
  hcDist: number;
};

const countExits = (
  head: Point,
  snake: Point[],
  obstacles: Point[],
  size: number
): number => {
  const blocked = new Set([
    ...snake.slice(0, -1).map(pointKey),
    ...obstacles.map(pointKey)
  ]);
  let exits = 0;
  for (const dir of directions) {
    const n = wrapPoint(movePoint(head, dir), size);
    if (!blocked.has(pointKey(n))) exits++;
  }
  return exits;
};

const getCompactness = (pos: Point, size: number, blocked: Set<string>): number => {
  let count = 0;
  for (const dir of directions) {
    const n = wrapPoint(movePoint(pos, dir), size);
    if (blocked.has(pointKey(n))) count++;
  }
  return count;
};

const countPockets = (pos: Point, size: number, blocked: Set<string>): number => {
  let pockets = 0;
  for (const dir of directions) {
    const n = wrapPoint(movePoint(pos, dir), size);
    if (!blocked.has(pointKey(n)) && floodFillCount(n, size, blocked) < 4) {
      pockets++;
    }
  }
  return pockets;
};


// --- Phase Scoring ---

const scoreEarly = (ev: AugEval, snakeLen: number, urgency: number): number => {
  let s = 0;
  s += ev.safe ? 10_000 : -5_000;
  s += ev.space * 15;
  s += ev.immediateExits * 200;
  if (ev.pathLength !== null) {
    const foodW = 1 + urgency * 3;
    s += (1000 / (ev.pathLength + 1)) * foodW;
  }
  if (ev.space < snakeLen) s -= 2000;
  if (ev.hcDist > 0) s += 50;
  return s;
};

const scoreMid = (
  ev: AugEval,
  snakeLen: number,
  shortest: number | null,
  urgency: number
): number => {
  let s = 0;
  s += ev.safe ? 12_000 : -10_000;
  s += ev.space * 20;
  s += ev.immediateExits * 300;
  s += ev.compactness * 120;
  s -= ev.pockets * 450;

  if (ev.pathLength !== null) {
    const progress = shortest !== null
      ? Math.max(0, shortest / Math.max(1, ev.pathLength))
      : 0;
    const foodW = 1 + urgency * 3;
    s += progress * 600 * foodW;
    s += (400 / (ev.pathLength + 1)) * foodW;
  }

  const crit = Math.max(8, Math.floor(snakeLen * 0.5));
  if (ev.space < crit) s -= (crit - ev.space) * 300;
  if (ev.hcDist > 0) s += 250;
  return s;
};

const scoreLate = (
  ev: AugEval,
  snakeLen: number,
  shortest: number | null,
  urgency: number
): number => {
  let s = 0;
  s += ev.safe ? 15_000 : -15_000;
  s += ev.space * 25;
  s += ev.immediateExits * 400;
  s += ev.compactness * 220;
  s -= ev.pockets * 700;

  if (ev.pathLength !== null) {
    const progress = shortest !== null
      ? Math.max(0, shortest / Math.max(1, ev.pathLength))
      : 0;
    const foodW = 1 + urgency * 4;
    s += progress * 400 * foodW;
    s += (250 / (ev.pathLength + 1)) * foodW;
  }

  const crit = Math.max(10, Math.floor(snakeLen * 0.8));
  if (ev.space < crit) s -= (crit - ev.space) * 500;

  // HC strongly preferred in late game for systematic board filling
  if (ev.hcDist > 0) {
    s += 600;
    if (ev.hcDist <= 3) s += 300;
  }
  return s;
};


// --- Main Strategy ---

export const pickFuchs2Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const total = size * size;
  const head = state.snake[0];

  // HC setup
  const cycleIndex = buildCycleIndex(size);
  const headIdx = cycleIndex.get(pointKey(head));

  const occupiedIndices = new Set<number>();
  for (let i = 1; i < state.snake.length - 1; i++) {
    const idx = cycleIndex.get(pointKey(state.snake[i]));
    if (idx !== undefined) occupiedIndices.add(idx);
  }

  let maxSafeDist = total;
  if (headIdx !== undefined) {
    for (let d = 1; d < total; d++) {
      if (occupiedIndices.has((headIdx + d) % total)) {
        maxSafeDist = d;
        break;
      }
    }
  }

  // Urgency: wie nah am Timeout?
  const urgency =
    state.timeSinceLastFruit !== undefined &&
    state.timeoutMs !== undefined &&
    state.timeoutMs > 0
      ? Math.min(1, state.timeSinceLastFruit / state.timeoutMs)
      : 0;

  // Evaluate all directions
  const rawEvals: MoveEvaluation[] = [];
  for (const dir of directions) {
    const ev = evaluateMove(state, size, dir);
    if (ev) rawEvals.push(ev);
  }

  if (rawEvals.length === 0) return directionToTail(state, size);

  // Dead-end filter
  const minSpace = Math.max(Math.floor(state.snake.length * 0.3), 8);
  const viable = rawEvals.filter(e => e.space >= minSpace);
  const pool = viable.length > 0 ? viable : rawEvals;

  // Food unreachable: chase tail or max space
  if (!isFoodReachable(state, size)) {
    const tailDir = directionToTail(state, size);
    if (tailDir && pool.some(e => e.direction === tailDir)) return tailDir;
    let best: MoveEvaluation | null = null;
    for (const e of pool) {
      if (!best || e.space > best.space) best = e;
    }
    return best?.direction ?? directionToTail(state, size);
  }

  // Augment evaluations
  const evals: AugEval[] = pool.map(ev => {
    const nextHead = wrapPoint(movePoint(head, ev.direction), size);
    const nextSnake = [nextHead, ...state.snake.slice(0, -1)];
    const blocked = new Set([
      ...nextSnake.map(pointKey),
      ...state.obstacles.map(pointKey)
    ]);

    let hcDist = 0;
    if (headIdx !== undefined) {
      const nextIdx = cycleIndex.get(pointKey(nextHead));
      if (nextIdx !== undefined) {
        const dist = cycleDist(headIdx, nextIdx, total);
        if (dist > 0 && dist <= maxSafeDist) {
          hcDist = dist;
        }
      }
    }

    return {
      ...ev,
      immediateExits: countExits(nextHead, nextSnake, state.obstacles, size),
      compactness: getCompactness(nextHead, size, blocked),
      pockets: countPockets(nextHead, size, blocked),
      hcDist
    };
  });

  // Shortest safe path (for progress ratio)
  let shortestSafe: number | null = null;
  for (const e of evals) {
    if (e.safe && e.pathLength !== null) {
      if (shortestSafe === null || e.pathLength < shortestSafe) {
        shortestSafe = e.pathLength;
      }
    }
  }

  // Score by phase
  const snakeLen = state.snake.length;
  const fruits = state.fruitsEaten;
  const scoreFn = fruits < 60
    ? (ev: AugEval) => scoreEarly(ev, snakeLen, urgency)
    : fruits < 150
      ? (ev: AugEval) => scoreMid(ev, snakeLen, shortestSafe, urgency)
      : (ev: AugEval) => scoreLate(ev, snakeLen, shortestSafe, urgency);

  let bestScore = -Infinity;
  let bestDir: Direction | null = null;
  for (const ev of evals) {
    const score = scoreFn(ev);
    if (score > bestScore) {
      bestScore = score;
      bestDir = ev.direction;
    }
  }

  return bestDir ?? directionToTail(state, size);
};
