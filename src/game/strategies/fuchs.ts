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


// --- Phase 1: MIMO-Logik (< 200 Fruechte) ---

const scoreMimoMove = (
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


// --- Phase 2: Flaechen-Modus (>= 200 Fruechte) ---

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

// Zaehlt wie viele Nachbar-Zellen belegt sind (Wand-/Koerper-Hugging).
// Hoeherer Wert = kompaktere Fahrweise, weniger Luecken.
const compactness = (pos: Point, size: number, blocked: Set<string>): number => {
  let count = 0;
  for (const n of neighborPoints(pos, size)) {
    if (blocked.has(pointKey(n))) {
      count++;
    }
  }
  return count;
};

// Zaehlt isolierte kleine Hohlraeume die ein Zug erzeugen wuerde
const countSmallPockets = (
  nextHead: Point,
  size: number,
  blocked: Set<string>
): number => {
  // blocked enthält schon den neuen Kopf
  const freeNeighbors = neighborPoints(nextHead, size).filter(
    (n) => !blocked.has(pointKey(n))
  );

  let pockets = 0;
  for (const fn of freeNeighbors) {
    const regionSize = floodFillCount(fn, size, blocked);
    // Sehr kleiner Hohlraum (< 4 Zellen) = Luecke die nie sinnvoll genutzt wird
    if (regionSize < 4) {
      pockets++;
    }
  }
  return pockets;
};

type AreaEvaluation = MoveEvaluation & {
  compactness: number;
  pockets: number;
  nextHead: Point;
};

const evaluateAreaMove = (
  state: GameState,
  size: number,
  evaluation: MoveEvaluation
): AreaEvaluation => {
  const head = state.snake[0];
  const nextHead = wrapPoint(movePoint(head, evaluation.direction), size);

  // Blocked-Set nach diesem Zug (Schlange bewegt sich, Schwanz faellt weg)
  const nextSnake = [nextHead, ...state.snake.slice(0, -1)];
  const blocked = new Set<string>([
    ...nextSnake.map(pointKey),
    ...state.obstacles.map(pointKey)
  ]);

  return {
    ...evaluation,
    compactness: compactness(nextHead, size, blocked),
    pockets: countSmallPockets(nextHead, size, blocked),
    nextHead
  };
};

const scoreAreaMove = (
  eval_: AreaEvaluation,
  minPath: number,
  maxSpace: number,
  occupiedRatio: number
): number => {
  let score = 0;

  // Safety ist Pflicht im Area-Modus
  if (eval_.safe) {
    score += 1.0;
  } else {
    score -= 0.5;
  }

  // Kompaktheit: starkes Signal gegen Luecken (0-4 Nachbarn belegt)
  // 2+ belegte Nachbarn = entlang Wand/Koerper fahren
  score += eval_.compactness * 0.25;

  // Pocket-Penalty: jeder kleine Hohlraum wird bestraft
  score -= eval_.pockets * 0.3;

  // Space: normalisiert, moderates Gewicht
  if (maxSpace > 0) {
    score += (eval_.space / maxSpace) * 0.2;
  }

  // Pfad zum Essen: nur schwaches Gewicht, Ueberleben > Fressen
  if (eval_.pathLength !== null && minPath > 0) {
    const pathDelta = eval_.pathLength - minPath;
    const tolerance = occupiedRatio < 0.5 ? 3 : 5;
    if (pathDelta <= tolerance) {
      score += 0.1 - pathDelta * 0.02;
    }
  }

  return score;
};


// --- Hauptfunktion ---

export const pickFuchsDirection = (
  state: GameState,
  size: number
): Direction | null => {
  const areaMode = state.fruitsEaten >= 200;
  const snakeLength = state.snake.length;
  const totalCells = size * size;
  const occupiedRatio = (snakeLength + state.obstacles.length) / totalCells;
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

  // --- Phase 1: MIMO ---
  if (!areaMode) {
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
      const score = scoreMimoMove(evaluation, snakeLength, occupiedRatio, foodReachable);
      if (score > bestScore) {
        bestScore = score;
        bestDirection = evaluation.direction;
      }
    }
    if (bestDirection === null || bestScore < 0) {
      return directionToTail(state, size);
    }
    return bestDirection;
  }

  // --- Phase 2: Flaechen-Modus ---

  // Sackgassen-Filter (wie Opus 4.6)
  const minSpace = Math.max(Math.floor(snakeLength * 0.3), 10);
  const viable = evaluations.filter((e) => e.space >= minSpace);
  const pool = viable.length > 0 ? viable : evaluations;

  // Food unreachable: Schwanz jagen (natuerlicher Zyklus)
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

  // Area-Evaluierung mit Kompaktheit und Pocket-Erkennung
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
    const score = scoreAreaMove(e, minPath, maxSpace, occupiedRatio);
    if (score > bestScore) {
      bestScore = score;
      bestDir = e.direction;
    }
  }

  return bestDir ?? directionToTail(state, size);
};
