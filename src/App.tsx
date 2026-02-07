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
  type AutopilotStrategy
} from "./game/strategies";

const GRID_SIZE = 20;
const TICK_MS = 120;
const OBSTACLE_COUNT = 12;
const SPEED_OPTIONS = [
  { value: 0.5, label: "0.5x" },
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 4, label: "4x" }
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
  position: number;
  lap: number;
  totalMs: number;
  displayMs: number | null;
  gapMs: number | null;
};

const PLAYERS: PlayerConfig[] = [
  { id: "blue", label: "Blau", colorClass: "blue", defaultStrategy: "balanced" },
  { id: "red", label: "Rot", colorClass: "red", defaultStrategy: "aggressive" },
  { id: "green", label: "Gruen", colorClass: "green", defaultStrategy: "cautious" },
  { id: "yellow", label: "Gelb", colorClass: "yellow", defaultStrategy: "codex-5.2" },
  { id: "purple", label: "Lila", colorClass: "purple", defaultStrategy: "codex-5.2" },
  { id: "orange", label: "Orange", colorClass: "orange", defaultStrategy: "space" }
];

const PLAYER_IDS = PLAYERS.map((player) => player.id);
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

const Board = ({
  player,
  state,
  strategy,
  onStrategyChange,
  manualEnabled,
  onToggleManual
}: {
  player: PlayerConfig;
  state: GameState;
  strategy: AutopilotStrategy;
  onStrategyChange: (strategy: AutopilotStrategy) => void;
  manualEnabled: boolean;
  onToggleManual: (value: boolean) => void;
}) => {
  const snakeSet = useMemo(() => new Set(state.snake.map(pointKey)), [state.snake]);
  const headKey = pointKey(state.snake[0]);
  const foodKey = pointKey(state.food);
  const obstacleSet = useMemo(
    () => new Set(state.obstacles.map(pointKey)),
    [state.obstacles]
  );
  const newestObstacleKey = state.lastSpawnedObstacle
    ? pointKey(state.lastSpawnedObstacle)
    : null;

  const manualMode = player.id === MANUAL_PLAYER_ID && manualEnabled;

  return (
    <section className={`lane ${player.colorClass}`}>
      <div className={`lane-header ${player.colorClass}`}>
        <div>{player.label}</div>
        <select
          className="strategy-select"
          value={strategy}
          onChange={(event) => onStrategyChange(event.target.value as AutopilotStrategy)}
          aria-label={`Strategie fuer ${player.label}`}
          disabled={manualMode}
        >
          {STRATEGIES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
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
            const isFood = key === foodKey;
            const isObstacle = obstacleSet.has(key);
            const isNewestObstacle = newestObstacleKey === key;

            const className = [
              "cell",
              isSnake ? "snake" : "",
              isHead ? "head" : "",
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
      </div>

      <div className="lane-footer">
        {player.id === MANUAL_PLAYER_ID ? (
          <label className="manual-toggle">
            <input
              type="checkbox"
              checked={manualEnabled}
              onChange={(event) => onToggleManual(event.target.checked)}
            />
            Manuell steuern
          </label>
        ) : (
          <div />
        )}
        <div className="status">{manualMode ? "Manuell" : statusText(state)}</div>
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

const formatMaybeTime = (ms: number | null) =>
  ms === null ? "--:--.---" : formatTime(ms);

const formatMaybeGap = (ms: number | null, isLeader: boolean) => {
  if (ms === null) {
    return "--";
  }
  return formatGapWithLead(ms, isLeader);
};

const createLapTimes = (): LapTimes =>
  PLAYER_IDS.reduce<LapTimes>((acc, player) => {
    acc[player] = [];
    return acc;
  }, {} as LapTimes);

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
  const [lastEatTimes, setLastEatTimes] = useState<Record<string, number>>(() =>
    PLAYER_IDS.reduce<Record<string, number>>((acc, id) => {
      acc[id] = 0;
      return acc;
    }, {})
  );
  const [started, setStarted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [manualEnabled, setManualEnabled] = useState(false);
  const matchStartRef = useRef<number>(0);
  const simTimeRef = useRef<number>(0);

  const running = PLAYER_IDS.some((player) => match[player].status === "running");
  const allGameover = PLAYER_IDS.every((player) => match[player].status === "gameover");

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
      const displayMs = lastLapTotalMs ?? endTimes[player.id] ?? null;
      const totalMs = displayMs ?? Number.POSITIVE_INFINITY;
      return {
        id: player.id,
        label: player.label,
        colorClass: player.colorClass,
        strategyLabel: STRATEGY_LABELS[strategy],
        lap,
        totalMs,
        displayMs,
        position: 0,
        gapMs: null
      };
    });

    entries.sort((a, b) => {
      if (b.lap !== a.lap) {
        return b.lap - a.lap;
      }
      return a.totalMs - b.totalMs;
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
  }, [endTimes, lapTimes, strategies]);

  const handleStart = () => {
    if (running) {
      return;
    }

    const now = 0;
    simTimeRef.current = 0;
    matchStartRef.current = now;
    setStarted(true);
    setLapTimes(createLapTimes());
    setEndTimes(createEndTimes());
    setLastEatTimes(
      PLAYER_IDS.reduce<Record<string, number>>((acc, id) => {
        acc[id] = now;
        return acc;
      }, {})
    );

    setMatch((current) => {
      if (allGameover) {
        const fresh = PLAYERS.reduce<MatchState>((acc, player) => {
          acc[player.id] = createInitialState(GRID_SIZE, OBSTACLE_COUNT);
          return acc;
        }, {} as MatchState);
        return PLAYER_IDS.reduce<MatchState>((acc, playerId) => {
          acc[playerId] = startIfReady(fresh[playerId]);
          return acc;
        }, {} as MatchState);
      }

      return PLAYER_IDS.reduce<MatchState>((acc, playerId) => {
        acc[playerId] = startIfReady(current[playerId]);
        return acc;
      }, {} as MatchState);
    });
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
          const manual = playerId === MANUAL_PLAYER_ID && manualEnabled;
          acc[playerId] = advancePlayer(current[playerId], strategy, manual);
          return acc;
        }, {} as MatchState);

        setLastEatTimes((prev) => {
          const next = { ...prev };
          for (const playerId of PLAYER_IDS) {
            if (nextState[playerId].fruitsEaten > current[playerId].fruitsEaten) {
              next[playerId] = now;
            }
          }
          return next;
        });

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
            if (
              next[playerId] === null &&
              now - (lastEatTimes[playerId] ?? now) >= 30000
            ) {
              nextState[playerId] = { ...nextState[playerId], status: "gameover" };
              next[playerId] = now - matchStartRef.current;
              changed = true;
              continue;
            }
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
  }, [lastEatTimes, manualEnabled, running, speed, strategies]);

  useEffect(() => {
    if (!started || !manualEnabled) {
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
  }, [manualEnabled, started]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
    } catch {
      return;
    }
  }, [strategies]);

  useEffect(() => {
    const lists = document.querySelectorAll<HTMLDivElement>(".lap-list");
    lists.forEach((list) => {
      list.scrollTop = list.scrollHeight;
    });
  }, [lapTimes]);

  return (
    <div className="app">
      <div className="header">
        <div className="title">Snake Duel</div>
        <div className="score">
          {PLAYERS.map((player, index) => (
            <span key={player.id} className={`score-item ${player.colorClass}`}>
              {player.label}: {match[player.id].score}
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
        <button className="control primary" onClick={handleStart} disabled={running}>
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
            />
          ))}
        </div>

        <aside className="side">
          <section className="panel">
            <div className="panel-title">Positionen</div>
            <div className="standings">
              <div className="standings-row standings-header">
                <span>POS</span>
                <span>Name</span>
                <span>R</span>
                <span className="standings-time">Zeit</span>
                <span className="standings-gap">Diff</span>
              </div>
              {standings.map((entry) => (
                <div key={entry.id} className="standings-row">
                  <span>{entry.position}</span>
                  <span className={`standings-name ${entry.colorClass}`}>
                    {entry.strategyLabel}
                  </span>
                  <span>{entry.lap}</span>
                  <span className="standings-time">
                    {formatMaybeTime(entry.displayMs)}
                  </span>
                  <span
                    className={`standings-gap lap-gap ${entry.position === 1 ? "lead" : ""}`}
                  >
                    {formatMaybeGap(entry.gapMs, entry.position === 1)}
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
