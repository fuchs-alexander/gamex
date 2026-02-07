import { type Direction, type GameState } from "../snake";
import { pickAggressiveDirection } from "./aggressive";
import { pickBalancedDirection } from "./balanced";
import { pickCautiousDirection } from "./cautious";
import { pickCodex52Direction } from "./codex-5-2";
import { pickCodex53Direction } from "./codex-5-3";
import { pickSpaceDirection } from "./space";
import { pickGeminiDirection } from "./gemini-3-pro-preview";
import { pickOpus46Direction } from "./opus-4-6";
import { pickMimoDirection } from "./mimo";
import { pickSonnet45Direction } from "./sonnet-4-5";
import { pickFuchsDirection } from "./fuchs";
import { pickMartinDirection } from "./martin";

export const STRATEGIES = [
  { id: "balanced", label: "Balanced" },
  { id: "aggressive", label: "Aggressiv" },
  { id: "cautious", label: "Vorsichtig" },
  { id: "space", label: "Flaeche" },
  { id: "codex-5.2", label: "Codex 5.2" },
  { id: "codex-5.3", label: "Codex 5.3" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { id: "opus-4.6", label: "Opus 4.6" },
  { id: "mimo-v2-flash", label: "MIMO v2 Flash" },
  { id: "sonnet-4.5", label: "Sonnet 4.5" },
  { id: "fuchs", label: "Fuchs" },
  { id: "martin", label: "Martin" }
] as const;

export type AutopilotStrategy = (typeof STRATEGIES)[number]["id"];

export const STRATEGY_LABELS = STRATEGIES.reduce<Record<AutopilotStrategy, string>>(
  (acc, strategy) => {
    acc[strategy.id] = strategy.label;
    return acc;
  },
  {} as Record<AutopilotStrategy, string>
);

const strategyMap: Record<
  AutopilotStrategy,
  (state: GameState, size: number) => Direction | null
> = {
  balanced: pickBalancedDirection,
  aggressive: pickAggressiveDirection,
  cautious: pickCautiousDirection,
  space: pickSpaceDirection,
  "codex-5.2": pickCodex52Direction,
  "codex-5.3": pickCodex53Direction,
  "gemini-3-pro-preview": pickGeminiDirection,
  "opus-4.6": pickOpus46Direction,
  "mimo-v2-flash": pickMimoDirection,
  "sonnet-4.5": pickSonnet45Direction,
  "fuchs": pickFuchsDirection,
  "martin": pickMartinDirection
};

export const pickAutopilotDirection = (
  state: GameState,
  size: number,
  strategy: AutopilotStrategy = "balanced"
): Direction | null => strategyMap[strategy](state, size);
