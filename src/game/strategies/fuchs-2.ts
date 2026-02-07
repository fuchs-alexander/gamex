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


// --- Lokale Helpers ---

const directionVectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const neighborPoints = (point: Point, size: number): Point[] =>
  directions.map((dir) =>
    wrapPoint({ x: point.x + directionVectors[dir].x, y: point.y + directionVectors[dir].y }, size)
  );

const compactness = (pos: Point, size: number, blocked: Set<string>): number => {
  let count = 0;
  for (const n of neighborPoints(pos, size)) {
    if (blocked.has(pointKey(n))) {
      count++;
    }
  }
  return count;
};

const countSmallPockets = (
  nextHead: Point,
  size: number,
  blocked: Set<string>
): number => {
  const freeNeighbors = neighborPoints(nextHead, size).filter(
    (n) => !blocked.has(pointKey(n))
  );

  let pockets = 0;
  for (const fn of freeNeighbors) {
    const regionSize = floodFillCount(fn, size, blocked);
    if (regionSize < 4) {
      pockets++;
    }
  }
  return pockets;
};

const directionContinuity = (direction: Direction, currentDirection: Direction): number =>
  direction === currentDirection ? 1 : 0;

type AreaEvaluation = MoveEvaluation & {
  compactness: number;
  pockets: number;
  continuity: number;
  nextHead: Point;
};

const evaluateAreaMove = (
  state: GameState,
  size: number,
  evaluation: MoveEvaluation
): AreaEvaluation => {
  const head = state.snake[0];
  const nextHead = wrapPoint(movePoint(head, evaluation.direction), size);

  const nextSnake = [nextHead, ...state.snake.slice(0, -1)];
  const blocked = new Set<string>([
    ...nextSnake.map(pointKey),
    ...state.obstacles.map(pointKey)
  ]);

  return {
    ...evaluation,
    compactness: compactness(nextHead, size, blocked),
    pockets: countSmallPockets(nextHead, size, blocked),
    continuity: directionContinuity(evaluation.direction, state.direction),
    nextHead
  };
};


// --- Phase 1: Ultra-Aggressiv (0-69 Fruechte) ---

const scorePhase1Move = (
  evaluation: MoveEvaluation,
  snakeLength: number,
  urgency: number
): number => {
  let score = 0;

  // Pfad dominiert alles
  const pathWeight = 0.75 + urgency * 0.10; // 0.75 bis 0.85
  if (evaluation.pathLength !== null) {
    score += (1 / (evaluation.pathLength + 1)) * pathWeight;
  }

  // Safety nur als Bonus, kein Penalty
  if (evaluation.safe) {
    score += 0.05;
  }

  // Trap-Schutz: harter Penalty bei zu wenig Space
  const spaceThreshold = snakeLength < 20 ? snakeLength : snakeLength * 0.5;
  if (evaluation.space < spaceThreshold) {
    score -= 0.5;
  }

  // Space nur als Tiebreaker
  score += (evaluation.space / (snakeLength * 2 + 1)) * 0.01;

  return score;
};


// --- Phase 2: Balanced (70-179 Fruechte) ---

const scorePhase2Move = (
  evaluation: MoveEvaluation,
  minSafePath: number,
  maxSpace: number,
  occupiedRatio: number
): number => {
  let score = 0;

  // Safety: starkes Signal
  if (evaluation.safe) {
    score += 0.6;
  } else {
    score -= 0.3;
    if (occupiedRatio > 0.4) {
      score -= 0.2;
    }
  }

  // Pfad mit Toleranz-System
  if (evaluation.pathLength !== null && minSafePath < Infinity) {
    const pathDelta = evaluation.pathLength - minSafePath;
    const tolerance = occupiedRatio < 0.3 ? 2 : occupiedRatio < 0.5 ? 3 : 5;
    if (pathDelta <= tolerance) {
      score += (0.25 - pathDelta * 0.04);
    }
  }

  // Space normalisiert
  if (maxSpace > 0) {
    score += (evaluation.space / maxSpace) * 0.20;
  }

  return score;
};


// --- Phase 3: Space-Filling (180+ Fruechte) ---

const scorePhase3Move = (
  eval_: AreaEvaluation,
  minPath: number,
  maxSpace: number,
  occupiedRatio: number
): number => {
  let score = 0;

  // Safety ist absolutes Muss
  if (eval_.safe) {
    score += 1.5;
  } else {
    score -= 1.0;
  }

  // Kompaktheit: starkes Signal fuer Wall/Body-Hugging
  score += eval_.compactness * 0.30;

  // Pocket-Penalty: staerker als Fuchs original
  score -= eval_.pockets * 0.50;

  // Continuity: laengere gerade Segmente = weniger Luecken
  score += eval_.continuity * 0.15;

  // Space normalisiert
  if (maxSpace > 0) {
    score += (eval_.space / maxSpace) * 0.20;
  }

  // Pfad zum Essen: sehr schwaches Gewicht
  if (eval_.pathLength !== null && minPath > 0) {
    const pathDelta = eval_.pathLength - minPath;
    const tolerance = occupiedRatio < 0.5 ? 3 : 5;
    if (pathDelta <= tolerance) {
      score += 0.10 - pathDelta * 0.02;
    }
  }

  return score;
};


// --- Hauptfunktion ---

export const pickFuchs2Direction = (
  state: GameState,
  size: number
): Direction | null => {
  const fruitsEaten = state.fruitsEaten;
  const snakeLength = state.snake.length;
  const totalCells = size * size;
  const occupiedRatio = (snakeLength + state.obstacles.length) / totalCells;
  const foodReachable = isFoodReachable(state, size);

  // Urgency fuer Phase 1: wie nah am Timeout?
  const timeSinceLastFruit = state.timeSinceLastFruit ?? 0;
  const timeoutMs = state.timeoutMs ?? 10000;
  const urgency = Math.min(1, timeSinceLastFruit / timeoutMs);

  // Phase bestimmen
  const phase = fruitsEaten < 70 ? 1 : fruitsEaten < 180 ? 2 : 3;

  // Alle Moves evaluieren
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

  // === Phase 1: Ultra-Aggressiv ===
  if (phase === 1) {
    if (!foodReachable) {
      // Max-Space Move statt Tail-Chase (schneller)
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
      const score = scorePhase1Move(evaluation, snakeLength, urgency);
      if (score > bestScore) {
        bestScore = score;
        bestDirection = evaluation.direction;
      }
    }
    return bestDirection;
  }

  // === Phase 2 & 3: Dead-End-Filter ===
  const minSpace = Math.max(Math.floor(snakeLength * 0.3), 10);
  const viable = evaluations.filter((e) => e.space >= minSpace);
  const pool = viable.length > 0 ? viable : evaluations;

  // === Phase 2: Balanced ===
  if (phase === 2) {
    if (!foodReachable) {
      // Tail-Chase (natuerlicher Zyklus)
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

    // Safe-Pool bevorzugen
    const safePool = pool.filter((e) => e.safe);
    const scoringPool = safePool.length > 0 ? safePool : pool;

    let minSafePath = Infinity;
    let maxSpace = 0;
    for (const e of scoringPool) {
      if (e.pathLength !== null && e.pathLength < minSafePath) minSafePath = e.pathLength;
      if (e.space > maxSpace) maxSpace = e.space;
    }

    let bestScore = -Infinity;
    let bestDir: Direction | null = null;
    for (const e of scoringPool) {
      const score = scorePhase2Move(e, minSafePath, maxSpace, occupiedRatio);
      if (score > bestScore) {
        bestScore = score;
        bestDir = e.direction;
      }
    }
    return bestDir ?? directionToTail(state, size);
  }

  // === Phase 3: Space-Filling ===

  // Food unreachable: Schwanz jagen
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

  // Area-Evaluierung mit Kompaktheit, Pocket-Erkennung und Continuity
  const areaEvals = pool.map((e) => evaluateAreaMove(state, size, e));

  // Safe bevorzugen
  const safePool = areaEvals.filter((e) => e.safe);
  const scoringPool = safePool.length > 0 ? safePool : areaEvals;

  let minPath = Infinity;
  let maxSpace = 0;
  for (const e of scoringPool) {
    if (e.pathLength !== null && e.pathLength < minPath) minPath = e.pathLength;
    if (e.space > maxSpace) maxSpace = e.space;
  }
  if (minPath === Infinity) minPath = 1;

  let bestScore = -Infinity;
  let bestDir: Direction | null = null;
  for (const e of scoringPool) {
    const score = scorePhase3Move(e, minPath, maxSpace, occupiedRatio);
    if (score > bestScore) {
      bestScore = score;
      bestDir = e.direction;
    }
  }

  return bestDir ?? directionToTail(state, size);
};
