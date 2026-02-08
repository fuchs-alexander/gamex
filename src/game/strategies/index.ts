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
import { pickFuchs2Direction } from "./fuchs-2";
import { pickMartin2Direction } from "./martin2";
import { pickForge3Direction } from "./forge-3";
import { pickFuchs3Direction } from "./fuchs-3";
import { pickForge4Direction } from "./forge-4";

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
  { id: "martin", label: "Martin" },
  { id: "fuchs-2", label: "Fuchs 2" },
  { id: "martin2", label: "Martin Hulus 2" },
  { id: "forge-3", label: "Forge 3" },
  { id: "fuchs-3", label: "Fuchs 3" },
  { id: "forge-4", label: "Forge 4" }
] as const;

export type AutopilotStrategy = (typeof STRATEGIES)[number]["id"];

export const STRATEGY_DESCRIPTIONS: Partial<Record<AutopilotStrategy, string>> = {
  "forge-3": "Forge 3 ist Einfach Nur Martin3",
  "forge-4": "Forge 4 ist Nur Martin 4"
};

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
  "martin": pickMartinDirection,
  "fuchs-2": pickFuchs2Direction,
  "martin2": pickMartin2Direction,
  "forge-3": pickForge3Direction,
  "fuchs-3": pickFuchs3Direction,
  "forge-4": pickForge4Direction
};

export const pickAutopilotDirection = (
  state: GameState,
  size: number,
  strategy: AutopilotStrategy = "balanced"
): Direction | null => strategyMap[strategy](state, size);
