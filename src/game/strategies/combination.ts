import { type Direction, type GameState } from "../snake";
import { directionToTail, directions, evaluateMove, isFoodReachable } from "./utils";
import { pickBalancedDirection } from "./balanced";
import { pickAggressiveDirection } from "./aggressive";
import { pickCautiousDirection } from "./cautious";
import { pickSpaceDirection } from "./space";
import { pickCodex52Direction } from "./codex-5-2";
import { pickCodex53Direction } from "./codex-5-3";
import { pickGeminiDirection } from "./gemini-3-pro-preview";
import { pickOpus46Direction } from "./opus-4-6";
import { pickMimoDirection } from "./mimo";
import { pickSonnet45Direction } from "./sonnet-4-5";
import { pickFuchsDirection } from "./fuchs";
import { pickMartinDirection } from "./martin";
import { pickFuchs2Direction } from "./fuchs-2";
import { pickMartin2Direction } from "./martin2";
import { pickForge3Direction } from "./forge-3";
import { pickFuchs3Direction } from "./fuchs-3";
import { pickForge4Direction } from "./forge-4";

const allStrategies: ((state: GameState, size: number) => Direction | null)[] = [
  pickBalancedDirection,
  pickAggressiveDirection,
  pickCautiousDirection,
  pickSpaceDirection,
  pickCodex52Direction,
  pickCodex53Direction,
  pickGeminiDirection,
  pickOpus46Direction,
  pickMimoDirection,
  pickSonnet45Direction,
  pickFuchsDirection,
  pickMartinDirection,
  pickFuchs2Direction,
  pickMartin2Direction,
  pickForge3Direction,
  pickFuchs3Direction,
  pickForge4Direction
];

export const pickCombinationDirection = (
  state: GameState,
  size: number
): Direction | null => {
  const votes: Record<Direction, number> = { up: 0, down: 0, left: 0, right: 0 };

  for (const strategy of allStrategies) {
    const dir = strategy(state, size);
    if (dir) {
      votes[dir]++;
    }
  }

  const maxVotes = Math.max(...Object.values(votes));
  if (maxVotes === 0) {
    return directionToTail(state, size);
  }

  const winners = directions.filter((d) => votes[d] === maxVotes);
  if (winners.length === 1) {
    return winners[0];
  }

  // Tie-break: pick the direction with shortest path, then most space
  if (isFoodReachable(state, size)) {
    let best: Direction | null = null;
    let bestPath = Number.POSITIVE_INFINITY;
    let bestSpace = -1;

    for (const dir of winners) {
      const ev = evaluateMove(state, size, dir);
      if (!ev) continue;
      const path = ev.pathLength ?? Number.POSITIVE_INFINITY;
      if (path < bestPath || (path === bestPath && ev.space > bestSpace)) {
        best = dir;
        bestPath = path;
        bestSpace = ev.space;
      }
    }

    if (best) return best;
  }

  return winners[0];
};
