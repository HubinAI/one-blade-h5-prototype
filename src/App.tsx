import { useCallback, useMemo, useState } from "react";
import { GameCanvas } from "./game/GameCanvas";
import { LEVELS } from "./data/levels";
import type { BattleResult, LevelConfig } from "./game/types";
import { MainMenu } from "./components/MainMenu";
import { LevelSelect } from "./components/LevelSelect";
import { ResultScreen } from "./components/ResultScreen";
import { AdOverlay } from "./components/AdOverlay";
import type { ReviveOffer } from "./game/Game";
import { AdService } from "./game/services/AdService";
import {
  beginRun,
  canShowInterstitial,
  claimAdChest,
  claimDoubleReward,
  markInterstitialShown,
  registerRewardedAd
} from "./game/services/ProgressionService";
import { logEvent } from "./game/services/Analytics";

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
  const [runIndex, setRunIndex] = useState(0);
  const [reviveOffer, setReviveOffer] = useState<ReviveOffer | null>(null);
  const [reviveSignal, setReviveSignal] = useState(0);
  const [declineReviveSignal, setDeclineReviveSignal] = useState(0);

  const unlockedMap = useMemo(() => {
    return new Set(LEVELS.filter((level) => level.id <= unlockedLevel).map((level) => level.id));
  }, [unlockedLevel]);

  const startLevel = useCallback((level: LevelConfig) => {
    setRunIndex(beginRun(level.id));
    setCurrentLevel(level);
    setLastResult(null);
    setReviveOffer(null);
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

  const maybeShowInterstitial = useCallback(async () => {
    if (!canShowInterstitial()) return;
    const success = await AdService.showInterstitialAd("between_runs");
    if (success) markInterstitialShown();
  }, []);

  const handleRetry = useCallback(async () => {
    if (lastResult) logEvent("replay_click", { levelId: lastResult.levelId, reason: lastResult.win ? "high_score" : "failed" });
    startLevel(currentLevel);
  }, [currentLevel, lastResult, startLevel]);

  const handleNext = useCallback(async () => {
    if (!nextLevel || !lastResult) return;
    logEvent("next_level_click", { levelId: lastResult.levelId });
    await maybeShowInterstitial();
    startLevel(nextLevel);
  }, [lastResult, maybeShowInterstitial, nextLevel, startLevel]);

  const handleDoubleReward = useCallback(async () => {
    if (!lastResult) return;
    const success = await AdService.showRewardedAd("double_reward");
    if (!success) return;
    setLastResult(claimDoubleReward(lastResult));
  }, [lastResult]);

  const handleAdChest = useCallback(async () => {
    if (!lastResult) return;
    const success = await AdService.showRewardedAd("bonus_chest");
    if (!success) return;
    setLastResult(claimAdChest(lastResult));
  }, [lastResult]);

  const handleRevive = useCallback(async () => {
    if (!reviveOffer) return;
    const success = await AdService.showRewardedAd("revive");
    if (success) {
      registerRewardedAd();
      setReviveSignal((value) => value + 1);
    } else {
      setDeclineReviveSignal((value) => value + 1);
    }
    setReviveOffer(null);
  }, [reviveOffer]);

  const declineRevive = useCallback(() => {
    setDeclineReviveSignal((value) => value + 1);
    setReviveOffer(null);
  }, []);

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
          <GameCanvas
            key={`${currentLevel.id}-${runIndex}`}
            level={currentLevel}
            onFinish={handleFinish}
            onReviveOffer={setReviveOffer}
            reviveSignal={reviveSignal}
            declineReviveSignal={declineReviveSignal}
          />
          {reviveOffer && (
            <div className="revive-overlay">
              <div className="revive-panel">
                <strong>防线失守</strong>
                <p>已坚持 {Math.floor(reviveOffer.surviveTime)} 秒</p>
                <button className="primary-button" onClick={handleRevive}>
                  看广告复活，立即获得 80% 刀势反击
                </button>
                <button className="ghost-button" onClick={declineRevive}>
                  放弃复活，进入结算
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {screen === "result" && lastResult && (
        <ResultScreen
          result={lastResult}
          hasNext={Boolean(nextLevel)}
          onRetry={handleRetry}
          onNext={handleNext}
          onLevels={() => setScreen("levels")}
          onHome={() => setScreen("menu")}
          onDoubleReward={handleDoubleReward}
          onAdChest={handleAdChest}
        />
      )}
      <AdOverlay />
    </main>
  );
}
