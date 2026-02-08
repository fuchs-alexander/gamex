import {
  type Direction,
  type GameState,
  type Point,
  movePoint,
  wrapPoint,
  pointKey
} from "../snake";
import {
  bfsPathWithTiming,
  directionFromStep,
  directionToTail,
  directions,
  evaluateMove,
  floodFillCount,
  isFoodReachable,
  type MoveEvaluation
} from "./utils";

/* ══════════════════════════════════════════════════════
   Forge 4 — MIMO + Eck Mode
   Phase 1 (0-199):  MIMO Scoring (bewaehrt)
   Phase 2 (200+):   Eck Mode (Ecken-Navigation) + Aggressives Scoring
   ══════════════════════════════════════════════════════ */

// --- Eck Mode Hilfsfunktionen ---

const isOnBorder = (point: Point, size: number): boolean =>
  point.x === 0 || point.x === size - 1 || point.y === 0 || point.y === size - 1;

const borderClockwiseDirection = (head: Point, size: number): Direction | null => {
  if (head.y === 0 && head.x < size - 1) return "right";
  if (head.x === size - 1 && head.y < size - 1) return "down";
  if (head.y === size - 1 && head.x > 0) return "left";
  if (head.x === 0 && head.y > 0) return "up";
  return null;
};

const getCorners = (size: number): Point[] => [
  { x: 0, y: 0 },
  { x: 0, y: size - 1 },
  { x: size - 1, y: 0 },
  { x: size - 1, y: size - 1 }
];

const isFoodObstructed = (
  food: Point,
  size: number,
  blockedSet: Set<string>
): boolean => {
  let blockedNeighbors = 0;
  for (const dir of directions) {
    const neighbor = wrapPoint(movePoint(food, dir), size);
    if (blockedSet.has(pointKey(neighbor))) blockedNeighbors++;
  }
  return blockedNeighbors >= 2;
};

const pickEckModeDirection = (
  state: GameState,
  size: number,
  evaluations: MoveEvaluation[],
  minSpace: number
): Direction | null => {
  const head = state.snake[0];
  const viable = evaluations.filter((e) => e.space >= minSpace);
  const pool = viable.length > 0 ? viable : evaluations;

  // Bereits am Rand: clockwise folgen
  if (isOnBorder(head, size)) {
    const clockDir = borderClockwiseDirection(head, size);
    if (clockDir) {
      const clockEv = pool.find((e) => e.direction === clockDir);
      if (clockEv && clockEv.space >= minSpace) {
        return clockDir;
      }
    }
    // Clockwise blockiert: Max-Space
    let best: MoveEvaluation | null = null;
    for (const e of pool) {
      if (!best || e.space > best.space) best = e;
    }
    return best?.direction ?? null;
  }

  // Nicht am Rand: zum naechsten erreichbaren Eckpunkt navigieren
  const corners = getCorners(size);
  let bestCornerDir: Direction | null = null;
  let bestCornerDist = Infinity;

  for (const corner of corners) {
    const path = bfsPathWithTiming(head, corner, size, state.snake, state.obstacles);
    if (path && path.length > 1) {
      const dir = directionFromStep(head, path[1], size);
      const ev = pool.find((e) => e.direction === dir);
      if (ev && path.length - 1 < bestCornerDist) {
        bestCornerDist = path.length - 1;
        bestCornerDir = dir;
      }
    }
  }

  if (bestCornerDir) return bestCornerDir;

  // BFS zu Ecken gescheitert: Richtung zum naechsten Rand + Platz
  let bestBorderDir: Direction | null = null;
  let bestBorderScore = -Infinity;

  for (const ev of pool) {
    const nextHead = wrapPoint(movePoint(head, ev.direction), size);
    const distToBorder = Math.min(
      nextHead.x, size - 1 - nextHead.x,
      nextHead.y, size - 1 - nextHead.y
    );
    const score = -distToBorder + ev.space * 0.01;
    if (score > bestBorderScore) {
      bestBorderScore = score;
      bestBorderDir = ev.direction;
    }
  }

  return bestBorderDir;
};

export const pickForge4Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const snakeLen = state.snake.length;
  const fruitsEaten = state.fruitsEaten;
  const totalCells = size * size;
  const occupiedRatio = (snakeLen + state.obstacles.length) / totalCells;

  // Alle Moves evaluieren
  const evaluations: MoveEvaluation[] = [];
  for (const dir of directions) {
    const ev = evaluateMove(state, size, dir);
    if (ev) evaluations.push(ev);
  }

  if (evaluations.length === 0) {
    return directionToTail(state, size);
  }

  const foodMoves = evaluations.filter((e) => e.pathLength !== null);
  const foodReachable = foodMoves.length > 0;

  // ═══ PHASE 1: MIMO Scoring (0-199 Fruechte) ═══
  if (fruitsEaten < 200) {
    const foodReachableBfs = isFoodReachable(state, size);

    if (!foodReachableBfs) {
      let bestSpace: MoveEvaluation | null = null;
      for (const ev of evaluations) {
        if (!bestSpace || ev.space > bestSpace.space) {
          bestSpace = ev;
        }
      }
      return bestSpace?.direction ?? null;
    }

    let bestScore = -Infinity;
    let bestDir: Direction | null = null;

    for (const ev of evaluations) {
      let s = 0;
      s += (ev.space / (snakeLen * 2)) * 0.4;
      if (ev.safe) {
        s += 0.3;
      } else {
        s -= Math.max(0.1, 0.3 - (snakeLen / 50));
      }
      if (ev.pathLength !== null) {
        s += (1 / (ev.pathLength + 1)) * 0.2;
      }
      if (occupiedRatio > 0.5 && !ev.safe) {
        s -= 0.2;
      }
      if (s > bestScore) {
        bestScore = s;
        bestDir = ev.direction;
      }
    }

    if (bestDir === null || bestScore < 0) {
      return directionToTail(state, size);
    }
    return bestDir;
  }

  // ═══ PHASE 3: Eck Mode + Aggressives Scoring (200+ Fruechte) ═══

  const minSpace = Math.max(Math.floor(snakeLen * 0.2), 8);
  const viable = evaluations.filter((e) => e.space >= minSpace);
  const pool = viable.length > 0 ? viable : evaluations;

  // Eck Mode Aktivierung pruefen
  const head = state.snake[0];
  const blockedSet = new Set<string>([
    ...state.snake.map(pointKey),
    ...state.obstacles.map(pointKey)
  ]);
  const headSpace = floodFillCount(head, size, blockedSet);
  const lowSpace = headSpace < snakeLen * 0.4;
  const foodObstructed = isFoodObstructed(state.food, size, blockedSet);
  const eckModeActive = !foodReachable || (lowSpace && foodObstructed);

  if (eckModeActive) {
    const eckDir = pickEckModeDirection(state, size, evaluations, minSpace);
    if (eckDir) return eckDir;
  }

  // Aggressives Scoring wenn Eck Mode nicht aktiv
  if (!foodReachable) {
    const tailDir = directionToTail(state, size);
    if (tailDir && pool.some((e) => e.direction === tailDir)) {
      return tailDir;
    }
    let best: MoveEvaluation | null = null;
    for (const e of pool) {
      if (!best || e.space > best.space) best = e;
    }
    return best?.direction ?? directionToTail(state, size);
  }

  const t = Math.max(0, Math.min(1, (occupiedRatio - 0.35) / 0.25));
  const spaceW = 0.30 - 0.15 * t;
  const foodW = 0.35 + 0.15 * t;

  let bestScore = -Infinity;
  let bestDir: Direction | null = null;

  for (const ev of pool) {
    let s = 0;
    s += (ev.space / (snakeLen * 2)) * spaceW;
    if (ev.safe) {
      s += 0.20;
    } else {
      s -= Math.max(0.1, 0.20 - (snakeLen / 50));
    }
    if (ev.pathLength !== null) {
      s += (1 / (ev.pathLength + 1)) * foodW;
    }
    if (occupiedRatio > 0.5 && !ev.safe) {
      s -= 0.10;
    }
    if (s > bestScore) {
      bestScore = s;
      bestDir = ev.direction;
    }
  }

  // Kein Score < 0 Abbruch bei 200+ Fruechten — immer Food suchen
  return bestDir ?? directionToTail(state, size);
};
