import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  createInitialState,
  isOpposite,
  pointKey,
  stepGame,
  type Direction,
  type GameState
} from "./game/snake";
import {
  pickAutopilotDirection,
  STRATEGIES,
  STRATEGY_LABELS,
  STRATEGY_DESCRIPTIONS,
  type AutopilotStrategy
} from "./game/strategies";

const GRID_SIZE = 20;
const TICK_MS = 120;
const OBSTACLE_COUNT = 12;
const TIMEOUT_LOW_MS = 30000;
const TIMEOUT_MID_MS = 60000;
const TIMEOUT_HIGH_MS = 120000;
const TIMEOUT_MID_THRESHOLD = 200;
const TIMEOUT_HIGH_THRESHOLD = 250;
const SURVIVAL_POINT_INTERVAL_MS = 1000;
const SURVIVAL_POINTS_PER_INTERVAL = 1;
const SPEED_OPTIONS = [
  { value: 0.5, label: "0.5x" },
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 4, label: "4x" },
  { value: 8, label: "8x" }
] as const;

type PlayerConfig = {
  id: string;
  label: string;
  colorClass: string;
  defaultStrategy: AutopilotStrategy;
};

type MatchState = Record<string, GameState>;

type LapTime = {
  lap: number;
  timeMs: number;
  totalMs: number;
};

type LapTimes = Record<string, LapTime[]>;

type EndTimes = Record<string, number | null>;

type StandingEntry = {
  id: string;
  label: string;
  colorClass: string;
  strategyLabel: string;
  score: number;
  avgScore: number;
  position: number;
  lap: number;
  totalMs: number;
  displayMs: number | null;
  gapMs: number | null;
};

type StatSummary = {
  min: number;
  max: number;
  avg: number;
};

type BenchmarkResult = {
  strategy: AutopilotStrategy;
  label: string;
  runs: number;
  scores: number[];
  fruits: number[];
  scoreTotal: number;
  scoreSummary: StatSummary;
  fruitSummary: StatSummary;
};

type BenchmarkStatus = "idle" | "running" | "finished";

const PLAYERS: PlayerConfig[] = [
  { id: "blue", label: "Blau", colorClass: "blue", defaultStrategy: "balanced" },
  { id: "red", label: "Rot", colorClass: "red", defaultStrategy: "aggressive" },
  { id: "green", label: "Gruen", colorClass: "green", defaultStrategy: "cautious" },
  { id: "yellow", label: "Gelb", colorClass: "yellow", defaultStrategy: "codex-5.2" },
  { id: "purple", label: "Lila", colorClass: "purple", defaultStrategy: "codex-5.2" },
  { id: "orange", label: "Orange", colorClass: "orange", defaultStrategy: "space" }
];

const PLAYER_IDS = PLAYERS.map((player) => player.id);
const BENCHMARK_RUNS = PLAYER_IDS.length;
const BENCHMARK_QUEUE = STRATEGIES.map((strategy) => strategy.id);
const MANUAL_PLAYER_ID = "orange";
const STRATEGY_IDS = new Set(STRATEGIES.map((strategy) => strategy.id));
const STORAGE_KEY = "snake-strategies-v1";

const DEFAULT_STRATEGIES = PLAYERS.reduce<Record<string, AutopilotStrategy>>(
  (acc, player) => {
    acc[player.id] = player.defaultStrategy;
    return acc;
  },
  {}
);

const isStrategy = (value: unknown): value is AutopilotStrategy =>
  typeof value === "string" && STRATEGY_IDS.has(value as AutopilotStrategy);

const loadStrategies = (): Record<string, AutopilotStrategy> => {
  const base = { ...DEFAULT_STRATEGIES };
  if (typeof window === "undefined") {
    return base;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return base;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const playerId of PLAYER_IDS) {
      const value = parsed[playerId];
      if (isStrategy(value)) {
        base[playerId] = value;
      }
    }
  } catch {
    return base;
  }

  return base;
};

const createEndTimes = (): EndTimes =>
  PLAYER_IDS.reduce<EndTimes>((acc, player) => {
    acc[player] = null;
    return acc;
  }, {} as EndTimes);

const statusText = (state: GameState) => {
  switch (state.status) {
    case "ready":
      return "";
    case "running":
      return "Autopilot laeuft.";
    case "paused":
      return "Pausiert.";
    case "gameover":
      return "Game Over.";
  }
};

const startIfReady = (state: GameState): GameState =>
  state.status === "ready" ? { ...state, status: "running" } : state;

const advancePlayer = (
  state: GameState,
  strategy: AutopilotStrategy,
  manual: boolean
): GameState => {
  if (state.status !== "running") {
    return state;
  }

  if (manual) {
    return stepGame(state, GRID_SIZE);
  }

  const nextDirection = pickAutopilotDirection(state, GRID_SIZE, strategy);
  if (!nextDirection) {
    return { ...state, status: "gameover" };
  }

  return stepGame(
    { ...state, direction: nextDirection, status: "running" },
    GRID_SIZE
  );
};

const getTimeoutMs = (fruitsEaten: number) => {
  if (fruitsEaten >= TIMEOUT_HIGH_THRESHOLD) {
    return TIMEOUT_HIGH_MS;
  }
  if (fruitsEaten >= TIMEOUT_MID_THRESHOLD) {
    return TIMEOUT_MID_MS;
  }
  return TIMEOUT_LOW_MS;
};

const getFruitPoints = (elapsedMs: number, fruitsEaten: number) => {
  const timeoutMs = getTimeoutMs(fruitsEaten);
  const maxPoints = 30;
  // Keep same curve shape relative to timeout window (30s vs 60s).
  const tau = timeoutMs * (7000 / TIMEOUT_LOW_MS);
  return Math.max(1, Math.round(maxPoints * Math.exp(-elapsedMs / tau)));
};

const getTailDirection = (snake: GameState["snake"], size: number): Direction => {
  if (snake.length < 2) {
    return "right";
  }
  const beforeTail = snake[snake.length - 2];
  const tail = snake[snake.length - 1];
  const dx = (tail.x - beforeTail.x + size) % size;
  const dy = (tail.y - beforeTail.y + size) % size;

  if (dx === 1) return "right";
  if (dx === size - 1) return "left";
  if (dy === 1) return "down";
  return "up";
};

const getDirectionBetween = (from: { x: number; y: number }, to: { x: number; y: number }, size: number): Direction => {
  const dx = (to.x - from.x + size) % size;
  const dy = (to.y - from.y + size) % size;

  if (dx === 1) return "right";
  if (dx === size - 1) return "left";
  if (dy === 1) return "down";
  return "up";
};

const getBodySegmentClasses = (
  snake: GameState["snake"],
  size: number
): Record<string, string> => {
  const classes: Record<string, string> = {};
  if (snake.length < 3) {
    return classes;
  }

  for (let i = 1; i < snake.length - 1; i += 1) {
    const current = snake[i];
    const towardsHead = getDirectionBetween(current, snake[i - 1], size);
    const towardsTail = getDirectionBetween(current, snake[i + 1], size);
    const pairKey = [towardsHead, towardsTail].sort().join("-");

    let segmentClass = "";
    if (pairKey === "left-right") {
      segmentClass = "segment-left-right";
    } else if (pairKey === "down-up") {
      segmentClass = "segment-up-down";
    } else if (pairKey === "right-up") {
      segmentClass = "segment-up-right";
    } else if (pairKey === "down-right") {
      segmentClass = "segment-right-down";
    } else if (pairKey === "down-left") {
      segmentClass = "segment-down-left";
    } else if (pairKey === "left-up") {
      segmentClass = "segment-left-up";
    }
    if (segmentClass) {
      classes[pointKey(current)] = segmentClass;
    }
  }

  return classes;
};

const Board = ({
  player,
  state,
  strategy,
  onStrategyChange,
  manualEnabled,
  onToggleManual,
  timeoutRemainingMs,
  benchmarkActive
}: {
  player: PlayerConfig;
  state: GameState;
  strategy: AutopilotStrategy;
  onStrategyChange: (strategy: AutopilotStrategy) => void;
  manualEnabled: boolean;
  onToggleManual: (value: boolean) => void;
  timeoutRemainingMs: number;
  benchmarkActive: boolean;
}) => {
  const snakeSet = useMemo(() => new Set(state.snake.map(pointKey)), [state.snake]);
  const bodySegmentClasses = useMemo(
    () => getBodySegmentClasses(state.snake, GRID_SIZE),
    [state.snake]
  );
  const headKey = pointKey(state.snake[0]);
  const tailKey = pointKey(state.snake[state.snake.length - 1]);
  const tailDirection = getTailDirection(state.snake, GRID_SIZE);
  const foodKey = pointKey(state.food);
  const obstacleSet = useMemo(
    () => new Set(state.obstacles.map(pointKey)),
    [state.obstacles]
  );
  const newestObstacleKey = state.lastSpawnedObstacle
    ? pointKey(state.lastSpawnedObstacle)
    : null;

  const manualMode = player.id === MANUAL_PLAYER_ID && manualEnabled && !benchmarkActive;
  const statusLabel = benchmarkActive ? "Benchmark" : manualMode ? "Manuell" : statusText(state);

  return (
    <section className={`lane ${player.colorClass}`}>
      <div className={`lane-header ${player.colorClass}`}>
        <div>{player.label}</div>
        <select
          className="strategy-select"
          value={strategy}
          onChange={(event) => onStrategyChange(event.target.value as AutopilotStrategy)}
          aria-label={`Strategie fuer ${player.label}`}
          disabled={manualMode || benchmarkActive}
        >
          {STRATEGIES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {STRATEGY_DESCRIPTIONS[strategy] && (
          <div className="strategy-description">{STRATEGY_DESCRIPTIONS[strategy]}</div>
        )}
      </div>

      <div className="board-wrap">
        <div
          className="board"
          style={{ "--grid-size": GRID_SIZE } as React.CSSProperties}
        >
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
            const x = index % GRID_SIZE;
            const y = Math.floor(index / GRID_SIZE);
            const key = `${x},${y}`;
            const isSnake = snakeSet.has(key);
            const isHead = key === headKey;
            const isTail = key === tailKey;
            const segmentClass = bodySegmentClasses[key] ?? "";
            const isFood = key === foodKey;
            const isObstacle = obstacleSet.has(key);
            const isNewestObstacle = newestObstacleKey === key;

            const className = [
              "cell",
              isSnake ? "snake" : "",
              isHead ? "head" : "",
              isTail ? "tail" : "",
              isTail ? `tail-${tailDirection}` : "",
              segmentClass,
              isFood ? "food" : "",
              isObstacle ? "obstacle" : "",
              isNewestObstacle ? "fresh" : "",
              player.colorClass
            ]
              .filter(Boolean)
              .join(" ");

            return <div key={key} className={className} />;
          })}
        </div>
        {state.status === "gameover" ? (
          <div className="board-overlay">
            <div>Game Over</div>
          </div>
        ) : null}
      </div>

      <div className="lane-stats">
        <div>Score: {state.score}</div>
        <div>Fruechte: {state.fruitsEaten}</div>
        <div>Timer: {formatCountdownSeconds(timeoutRemainingMs)}</div>
      </div>

      <div className="lane-footer">
        {player.id === MANUAL_PLAYER_ID ? (
          <label className="manual-toggle">
            <input
              type="checkbox"
              checked={manualEnabled}
              onChange={(event) => onToggleManual(event.target.checked)}
              disabled={benchmarkActive}
            />
            Manuell steuern
          </label>
        ) : (
          <div />
        )}
        <div className="status">{statusLabel}</div>
      </div>
    </section>
  );
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
};

const formatGap = (ms: number) => `+${(ms / 1000).toFixed(3)}s`;

const formatGapWithLead = (ms: number, isLeader: boolean) =>
  isLeader ? "LEAD" : formatGap(ms);

const formatCountdownSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

void ((ms: number | null) =>
  ms === null ? "--:--.---" : formatTime(ms));

void ((ms: number | null, isLeader: boolean) => {
  if (ms === null) {
    return "--";
  }
  return formatGapWithLead(ms, isLeader);
});

const createLapTimes = (): LapTimes =>
  PLAYER_IDS.reduce<LapTimes>((acc, player) => {
    acc[player] = [];
    return acc;
  }, {} as LapTimes);

const summarizeValues = (values: number[]): StatSummary => {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min, max, avg };
};

const formatAvg = (value: number) => Math.round(value).toString();
const formatWhole = (value: number) => Math.round(value).toString();

export default function App() {
  const [match, setMatch] = useState<MatchState>(() =>
    PLAYERS.reduce<MatchState>((acc, player) => {
      acc[player.id] = createInitialState(GRID_SIZE, OBSTACLE_COUNT);
      return acc;
    }, {} as MatchState)
  );
  const [strategies, setStrategies] = useState<Record<string, AutopilotStrategy>>(
    () => loadStrategies()
  );
  const [lapTimes, setLapTimes] = useState<LapTimes>(() => createLapTimes());
  const [endTimes, setEndTimes] = useState<EndTimes>(() => createEndTimes());
  const survivalCarryRef = useRef<Record<string, number>>(
    PLAYER_IDS.reduce<Record<string, number>>((acc, id) => {
      acc[id] = 0;
      return acc;
    }, {})
  );
  const [started, setStarted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [manualEnabled, setManualEnabled] = useState(false);
  const [benchmarkStatus, setBenchmarkStatus] = useState<BenchmarkStatus>("idle");
  const [benchmarkIndex, setBenchmarkIndex] = useState(0);
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);
  const benchmarkRunRef = useRef<AutopilotStrategy | null>(null);
  const benchmarkSettingsRef = useRef<{
    strategies: Record<string, AutopilotStrategy>;
    manualEnabled: boolean;
  } | null>(null);
  const matchStartRef = useRef<number>(0);
  const simTimeRef = useRef<number>(0);

  const running = PLAYER_IDS.some((player) => match[player].status === "running");
  const allGameover = PLAYER_IDS.every((player) => match[player].status === "gameover");
  const benchmarkActive = benchmarkStatus === "running";

  const lapLeaders = useMemo(() => {
    const leaders = new Map<number, number>();
    for (const player of PLAYER_IDS) {
      for (const lap of lapTimes[player]) {
        const current = leaders.get(lap.lap);
        if (current === undefined || lap.totalMs < current) {
          leaders.set(lap.lap, lap.totalMs);
        }
      }
    }
    return leaders;
  }, [lapTimes]);

  const standings = useMemo<StandingEntry[]>(() => {
    const entries = PLAYERS.map((player) => {
      const strategy = strategies[player.id] ?? player.defaultStrategy;
      const playerLaps = lapTimes[player.id];
      const lastLapTotalMs =
        playerLaps && playerLaps.length > 0
          ? playerLaps[playerLaps.length - 1].totalMs
          : null;
      const lap = lapTimes[player.id]?.length ?? 0;
      const score = match[player.id].score;
      const fruits = match[player.id].fruitsEaten;
      const avgScore = fruits > 0 ? score / fruits : 0;
      const displayMs = lastLapTotalMs ?? endTimes[player.id] ?? null;
      const totalMs = displayMs ?? Number.POSITIVE_INFINITY;
      return {
        id: player.id,
        label: player.label,
        colorClass: player.colorClass,
        strategyLabel: STRATEGY_LABELS[strategy],
        score,
        avgScore,
        lap,
        totalMs,
        displayMs,
        position: 0,
        gapMs: null
      };
    });

    entries.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.avgScore !== a.avgScore) {
        return b.avgScore - a.avgScore;
      }
      return a.label.localeCompare(b.label);
    });

    const leader = entries[0];
    const leaderTotal = leader?.displayMs ?? null;

    return entries.map((entry, index) => ({
      ...entry,
      position: index + 1,
      gapMs:
        leaderTotal === null || entry.displayMs === null
          ? null
          : Math.abs(entry.displayMs - leaderTotal)
    }));
  }, [endTimes, lapTimes, match, strategies]);

  const benchmarkBest = useMemo(() => {
    if (benchmarkResults.length === 0) {
      return null;
    }
    return benchmarkResults.reduce((best, current) => {
      if (!best) return current;
      return current.scoreSummary.avg > best.scoreSummary.avg ? current : best;
    }, null as BenchmarkResult | null);
  }, [benchmarkResults]);

  const benchmarkSorted = useMemo(() => {
    return [...benchmarkResults].sort((a, b) => {
      const avgA = Math.round(a.scoreSummary.avg);
      const avgB = Math.round(b.scoreSummary.avg);
      if (avgB !== avgA) {
        return avgB - avgA;
      }
      if (b.scoreTotal !== a.scoreTotal) {
        return b.scoreTotal - a.scoreTotal;
      }
      return a.label.localeCompare(b.label);
    });
  }, [benchmarkResults]);

  const getSimNowForPlayer = (playerId: string) => {
    const endTotalMs = endTimes[playerId];
    if (endTotalMs !== null) {
      return matchStartRef.current + endTotalMs;
    }
    return simTimeRef.current;
  };

  const getTimeoutRemainingMs = (playerId: string) => {
    const state = match[playerId];
    const now = getSimNowForPlayer(playerId);
    const lastEat = state.lastEatSimTime ?? now;
    const timeoutMs = getTimeoutMs(state.fruitsEaten);
    return Math.max(0, timeoutMs - Math.max(0, now - lastEat));
  };

  const handleStart = (manualDirection?: Direction, forceReset = false) => {
    if (running && !forceReset) {
      return;
    }

    const now = 0;
    simTimeRef.current = 0;
    matchStartRef.current = now;
    setStarted(true);
    setLapTimes(createLapTimes());
    setEndTimes(createEndTimes());
    survivalCarryRef.current = PLAYER_IDS.reduce<Record<string, number>>((acc, id) => {
      acc[id] = 0;
      return acc;
    }, {});

    setMatch((current) => {
      const applyManualDirection = (state: GameState) => {
        if (!manualEnabled || !manualDirection) {
          return state;
        }
        if (isOpposite(state.direction, manualDirection)) {
          return state;
        }
        return { ...state, direction: manualDirection };
      };

      const initState = (state: GameState): GameState => ({
        ...startIfReady(state),
        lastEatSimTime: now
      });

      const buildMatch = (source: MatchState) =>
        PLAYER_IDS.reduce<MatchState>((acc, playerId) => {
          const startedState = initState(source[playerId]);
          acc[playerId] =
            playerId === MANUAL_PLAYER_ID
              ? applyManualDirection(startedState)
              : startedState;
          return acc;
        }, {} as MatchState);

      const shouldReset = forceReset || allGameover;
      if (shouldReset) {
        const fresh = PLAYERS.reduce<MatchState>((acc, player) => {
          acc[player.id] = createInitialState(GRID_SIZE, OBSTACLE_COUNT);
          return acc;
        }, {} as MatchState);
        return buildMatch(fresh);
      }

      return buildMatch(current);
    });
  };

  const setAllStrategies = (strategy: AutopilotStrategy) => {
    setStrategies(
      PLAYER_IDS.reduce<Record<string, AutopilotStrategy>>((acc, playerId) => {
        acc[playerId] = strategy;
        return acc;
      }, {} as Record<string, AutopilotStrategy>)
    );
  };

  const restoreBenchmarkSettings = () => {
    const saved = benchmarkSettingsRef.current;
    if (!saved) {
      return;
    }
    setStrategies(saved.strategies);
    setManualEnabled(saved.manualEnabled);
  };

  const startBenchmarkStrategy = (strategy: AutopilotStrategy) => {
    benchmarkRunRef.current = strategy;
    setAllStrategies(strategy);
    handleStart(undefined, true);
  };

  const startBenchmark = () => {
    if (benchmarkStatus === "running") {
      return;
    }
    benchmarkSettingsRef.current = { strategies, manualEnabled };
    setBenchmarkResults([]);
    setBenchmarkIndex(0);
    setBenchmarkStatus("running");
    setManualEnabled(false);

    const firstStrategy = BENCHMARK_QUEUE[0];
    if (!firstStrategy) {
      setBenchmarkStatus("finished");
      restoreBenchmarkSettings();
      return;
    }
    startBenchmarkStrategy(firstStrategy);
  };

  const stopBenchmark = () => {
    if (benchmarkStatus !== "running") {
      return;
    }
    benchmarkRunRef.current = null;
    setBenchmarkStatus("idle");
    restoreBenchmarkSettings();
  };

  useEffect(() => {
    if (!running) {
      return;
    }

    const interval = Math.max(20, Math.round(TICK_MS / speed));
    const timer = window.setInterval(() => {
      const delta = interval * speed;
      const now = simTimeRef.current + delta;
      simTimeRef.current = now;
      setMatch((current) => {
        const nextState = PLAYER_IDS.reduce<MatchState>((acc, playerId) => {
          const strategy = strategies[playerId] ?? DEFAULT_STRATEGIES[playerId];
          const manual = playerId === MANUAL_PLAYER_ID && manualEnabled && !benchmarkActive;
          const lastEat = current[playerId].lastEatSimTime ?? now;
          const elapsed = Math.max(0, now - lastEat);
          const timeoutMs = getTimeoutMs(current[playerId].fruitsEaten);
          const stateWithTiming = { ...current[playerId], timeSinceLastFruit: elapsed, timeoutMs };
          acc[playerId] = advancePlayer(stateWithTiming, strategy, manual);
          return acc;
        }, {} as MatchState);

        for (const playerId of PLAYER_IDS) {
          if (nextState[playerId].fruitsEaten > current[playerId].fruitsEaten) {
            const lastEat = current[playerId].lastEatSimTime ?? now;
            const elapsed = Math.max(0, now - lastEat);
            const points = getFruitPoints(
              elapsed,
              nextState[playerId].fruitsEaten
            );
            nextState[playerId] = {
              ...nextState[playerId],
              score: current[playerId].score + points,
              lastEatSimTime: now
            };
          }
        }

        for (const playerId of PLAYER_IDS) {
          if (nextState[playerId].status !== "running") {
            continue;
          }
          const lastEat = nextState[playerId].lastEatSimTime ?? now;
          const timeoutMs = getTimeoutMs(nextState[playerId].fruitsEaten);
          if (now - lastEat >= timeoutMs) {
            nextState[playerId] = { ...nextState[playerId], status: "gameover" };
          }
        }

        const nextSurvivalCarry = { ...survivalCarryRef.current };
        for (const playerId of PLAYER_IDS) {
          if (nextState[playerId].status !== "running") {
            nextSurvivalCarry[playerId] = 0;
            continue;
          }
          const accumulatedMs = (nextSurvivalCarry[playerId] ?? 0) + delta;
          const intervals = Math.floor(accumulatedMs / SURVIVAL_POINT_INTERVAL_MS);
          nextSurvivalCarry[playerId] = accumulatedMs % SURVIVAL_POINT_INTERVAL_MS;
          if (intervals > 0) {
            nextState[playerId] = {
              ...nextState[playerId],
              score:
                nextState[playerId].score +
                intervals * SURVIVAL_POINTS_PER_INTERVAL
            };
          }
        }
        survivalCarryRef.current = nextSurvivalCarry;

        setLapTimes((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const playerId of PLAYER_IDS) {
            const currentLap = Math.floor(nextState[playerId].fruitsEaten / 10);
            const recorded = prev[playerId].length;
            if (currentLap > recorded) {
              const totalMs = now - matchStartRef.current;
              const lastTotal = prev[playerId][recorded - 1]?.totalMs ?? 0;
              const lapMs = Math.max(0, totalMs - lastTotal);
              next[playerId] = [
                ...prev[playerId],
                { lap: recorded + 1, timeMs: lapMs, totalMs }
              ];
              changed = true;
            }
          }
          return changed ? next : prev;
        });

        setEndTimes((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const playerId of PLAYER_IDS) {
            if (next[playerId] === null && nextState[playerId].status === "gameover") {
              next[playerId] = now - matchStartRef.current;
              changed = true;
            }
          }
          return changed ? next : prev;
        });

        return nextState;
      });
    }, interval);

    return () => window.clearInterval(timer);
  }, [benchmarkActive, manualEnabled, running, speed, strategies]);

  useEffect(() => {
    if (!manualEnabled || benchmarkActive) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      const key = event.key;
      let direction: Direction | null = null;
      if (key === "ArrowUp" || key === "w" || key === "W") direction = "up";
      if (key === "ArrowDown" || key === "s" || key === "S") direction = "down";
      if (key === "ArrowLeft" || key === "a" || key === "A") direction = "left";
      if (key === "ArrowRight" || key === "d" || key === "D") direction = "right";
      if (!direction) {
        return;
      }
      event.preventDefault();

      if (!running) {
        handleStart(direction);
        return;
      }

      setMatch((current) => {
        const manualState = current[MANUAL_PLAYER_ID];
        if (!manualState || manualState.status !== "running") {
          return current;
        }
        if (isOpposite(manualState.direction, direction)) {
          return current;
        }
        return {
          ...current,
          [MANUAL_PLAYER_ID]: { ...manualState, direction }
        };
      });
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [benchmarkActive, manualEnabled, started]);

  useEffect(() => {
    if (benchmarkStatus !== "running") {
      return;
    }
    if (!allGameover) {
      return;
    }
    const strategy = benchmarkRunRef.current;
    if (!strategy) {
      return;
    }

    const scores = PLAYER_IDS.map((playerId) => match[playerId].score);
    const fruits = PLAYER_IDS.map((playerId) => match[playerId].fruitsEaten);
    const scoreTotal = scores.reduce((sum, value) => sum + value, 0);
    const result: BenchmarkResult = {
      strategy,
      label: STRATEGY_LABELS[strategy],
      runs: scores.length,
      scores,
      fruits,
      scoreTotal,
      scoreSummary: summarizeValues(scores),
      fruitSummary: summarizeValues(fruits)
    };

    setBenchmarkResults((prev) => [...prev, result]);

    const nextIndex = benchmarkIndex + 1;
    benchmarkRunRef.current = null;
    if (nextIndex < BENCHMARK_QUEUE.length) {
      setBenchmarkIndex(nextIndex);
      startBenchmarkStrategy(BENCHMARK_QUEUE[nextIndex]);
    } else {
      setBenchmarkStatus("finished");
      setBenchmarkIndex(nextIndex);
    }
  }, [allGameover, benchmarkIndex, benchmarkStatus, match]);

  useEffect(() => {
    if (typeof window === "undefined" || benchmarkActive) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
    } catch {
      return;
    }
  }, [benchmarkActive, strategies]);

  useEffect(() => {
    const lists = document.querySelectorAll<HTMLDivElement>(".lap-list");
    lists.forEach((list) => {
      list.scrollTop = list.scrollHeight;
    });
  }, [lapTimes]);

  const benchmarkStatusLabel =
    benchmarkStatus === "running"
      ? "Laeuft"
      : benchmarkStatus === "finished"
        ? "Fertig"
        : "Bereit";
  const benchmarkCurrentStrategy =
    benchmarkStatus === "running" ? BENCHMARK_QUEUE[benchmarkIndex] ?? null : null;
  const benchmarkProgressLabel =
    benchmarkStatus === "running"
      ? `${benchmarkIndex + 1}/${BENCHMARK_QUEUE.length}`
      : "--";

  return (
    <div className="app">
      <div className="header">
        <div className="title">Snake Duel</div>
        <div className="score">
          {[...PLAYERS]
            .sort((a, b) => match[b.id].score - match[a.id].score)
            .map((player, index) => (
              <span key={player.id} className={`score-item ${player.colorClass}`}>
                {STRATEGY_LABELS[strategies[player.id] ?? player.defaultStrategy]}:{" "}
                {match[player.id].score}
                {index < PLAYERS.length - 1 ? " · " : ""}
              </span>
            ))}
        </div>
        <div className="speed-control" role="group" aria-label="Tempo">
          <span>Tempo</span>
          <div className="speed-buttons">
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`speed-button ${speed === option.value ? "active" : ""}`}
                onClick={() => setSpeed(option.value)}
                aria-pressed={speed === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <button
          className="control primary"
          onClick={() => handleStart()}
          disabled={running || benchmarkActive}
        >
          {allGameover ? "Neustart" : "Start"}
        </button>
      </div>

      <div className="main">
        <div className="arena">
          {PLAYERS.map((player) => (
            <Board
              key={player.id}
              player={player}
              state={match[player.id]}
              strategy={strategies[player.id] ?? player.defaultStrategy}
              onStrategyChange={(value) =>
                setStrategies((current) => ({ ...current, [player.id]: value }))
              }
              manualEnabled={manualEnabled}
              onToggleManual={setManualEnabled}
              timeoutRemainingMs={getTimeoutRemainingMs(player.id)}
              benchmarkActive={benchmarkActive}
            />
          ))}
        </div>

        <aside className="side">
          <section className="panel">
            <div className="panel-title">Benchmark</div>
            <div className="benchmark-status">
              Status: <span className={`benchmark-status-pill ${benchmarkStatus}`}>{benchmarkStatusLabel}</span>
            </div>
            <div className="benchmark-controls">
              <button
                className="control primary"
                type="button"
                onClick={startBenchmark}
                disabled={benchmarkStatus === "running"}
              >
                Benchmark starten
              </button>
              <button
                className="control"
                type="button"
                onClick={stopBenchmark}
                disabled={benchmarkStatus !== "running"}
              >
                Stop
              </button>
              <button
                className="control"
                type="button"
                onClick={() => setBenchmarkResults([])}
                disabled={benchmarkStatus === "running" || benchmarkResults.length === 0}
              >
                Ergebnisse leeren
              </button>
            </div>
            <div className="benchmark-progress">
              {benchmarkCurrentStrategy ? (
                <>
                  Modell: {STRATEGY_LABELS[benchmarkCurrentStrategy]} ({benchmarkProgressLabel})
                </>
              ) : (
                <>
                  Modelle: {BENCHMARK_QUEUE.length} · Durchlaeufe: {BENCHMARK_RUNS}
                </>
              )}
            </div>

            {benchmarkResults.length === 0 ? (
              <div className="benchmark-empty">Noch keine Ergebnisse.</div>
            ) : (
              <div className="benchmark-table">
                <div className="benchmark-row benchmark-header">
                  <span>Modell</span>
                  <span>P Sum</span>
                  <span>P Ø</span>
                  <span>P Min</span>
                  <span>P Max</span>
                  <span>F Ø</span>
                  <span>F Min</span>
                  <span>F Max</span>
                </div>
                {benchmarkSorted.map((result) => (
                  <div
                    key={result.strategy}
                    className={`benchmark-row ${
                      benchmarkBest?.strategy === result.strategy ? "best" : ""
                    }`}
                  >
                    <span className="benchmark-model">{result.label}</span>
                    <span>{formatWhole(result.scoreTotal)}</span>
                    <span>{formatAvg(result.scoreSummary.avg)}</span>
                    <span>{formatWhole(result.scoreSummary.min)}</span>
                    <span>{formatWhole(result.scoreSummary.max)}</span>
                    <span>{formatAvg(result.fruitSummary.avg)}</span>
                    <span>{formatWhole(result.fruitSummary.min)}</span>
                    <span>{formatWhole(result.fruitSummary.max)}</span>
                  </div>
                ))}
              </div>
            )}

            {benchmarkBest ? (
              <div className="benchmark-best">
                Bestes Modell (Ø Punkte): {benchmarkBest.label}
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-title">Bestenliste</div>
            <div className="standings">
              <div className="standings-row standings-header">
                <span></span>
                <span>Pos</span>
                <span>Strategie</span>
                <span>Score</span>
              </div>
              {standings.map((entry) => (
                <div
                  key={entry.id}
                  className={`standings-row${entry.position === 1 ? " standings-leader" : ""}`}
                >
                  <span className={`standings-dot ${entry.colorClass}`} />
                  <span className="standings-pos">{entry.position}</span>
                  <span className={`standings-name ${entry.colorClass}`}>
                    {entry.strategyLabel}
                  </span>
                  <span className="standings-score">
                    {entry.score}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Rundenzeiten (je 10 Fruechte)</div>
            {PLAYERS.map((player) => (
              <div key={player.id} className="lap-block">
                <div className={`lap-title ${player.colorClass}`}>
                  {player.label} · {STRATEGY_LABELS[strategies[player.id] ?? player.defaultStrategy]}
                </div>
                {lapTimes[player.id].length === 0 ? (
                  <div className="lap-empty">Noch keine Runde.</div>
                ) : (
                  <div className="lap-list">
                    {lapTimes[player.id].map((lap) => {
                      const leaderTime = lapLeaders.get(lap.lap);
                      const gap = Math.max(0, lap.totalMs - (leaderTime ?? lap.totalMs));
                      const isLeader = gap === 0;
                      return (
                        <div key={`${player.id}-${lap.lap}`} className="lap-row">
                          <span>R{lap.lap}</span>
                          <span>{formatTime(lap.timeMs)}</span>
                          <span className="lap-total">{formatTime(lap.totalMs)}</span>
                          <span className={`lap-gap ${isLeader ? "lead" : ""}`}>
                            {formatGapWithLead(gap, isLeader)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
