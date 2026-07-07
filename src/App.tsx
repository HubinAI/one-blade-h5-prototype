import { useCallback, useMemo, useState } from "react";
import { GameCanvas } from "./game/GameCanvas";
import { LEVELS } from "./data/levels";
import type { BattleResult, LevelConfig } from "./game/types";
import { MainMenu } from "./components/MainMenu";
import { LevelSelect } from "./components/LevelSelect";
import { ResultScreen } from "./components/ResultScreen";

type Screen = "menu" | "levels" | "battle" | "result";

const SAVE_KEY = "one_blade_v02_progress";

function readUnlockedLevel() {
  const raw = window.localStorage.getItem(SAVE_KEY);
  const value = raw ? Number(raw) : 1;
  return Number.isFinite(value) ? Math.max(1, Math.min(LEVELS.length, value)) : 1;
}

function writeUnlockedLevel(levelId: number) {
  window.localStorage.setItem(SAVE_KEY, String(Math.max(1, Math.min(LEVELS.length, levelId))));
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [unlockedLevel, setUnlockedLevel] = useState(readUnlockedLevel);
  const [currentLevel, setCurrentLevel] = useState<LevelConfig>(LEVELS[0]);
  const [lastResult, setLastResult] = useState<BattleResult | null>(null);

  const unlockedMap = useMemo(() => {
    return new Set(LEVELS.filter((level) => level.id <= unlockedLevel).map((level) => level.id));
  }, [unlockedLevel]);

  const startLevel = useCallback((level: LevelConfig) => {
    setCurrentLevel(level);
    setLastResult(null);
    setScreen("battle");
  }, []);

  const handleFinish = useCallback((result: BattleResult) => {
    setLastResult(result);
    if (result.win) {
      setUnlockedLevel((current) => {
        const next = Math.max(current, Math.min(LEVELS.length, result.levelId + 1));
        writeUnlockedLevel(next);
        return next;
      });
    }
    window.setTimeout(() => setScreen("result"), 180);
  }, []);

  const nextLevel = LEVELS.find((level) => level.id === (lastResult?.levelId ?? 0) + 1);

  return (
    <main className="app-shell">
      {screen === "menu" && (
        <MainMenu
          unlockedLevel={unlockedLevel}
          onStart={() => startLevel(LEVELS[Math.max(0, unlockedLevel - 1)])}
          onLevels={() => setScreen("levels")}
        />
      )}

      {screen === "levels" && (
        <LevelSelect
          levels={LEVELS}
          unlockedIds={unlockedMap}
          onBack={() => setScreen("menu")}
          onSelect={startLevel}
        />
      )}

      {screen === "battle" && (
        <section className="battle-shell" aria-label="战斗">
          <GameCanvas key={currentLevel.id} level={currentLevel} onFinish={handleFinish} />
        </section>
      )}

      {screen === "result" && lastResult && (
        <ResultScreen
          result={lastResult}
          hasNext={Boolean(nextLevel)}
          onRetry={() => startLevel(currentLevel)}
          onNext={() => nextLevel && startLevel(nextLevel)}
          onLevels={() => setScreen("levels")}
        />
      )}
    </main>
  );
}
