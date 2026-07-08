import { useCallback, useMemo, useState } from "react";
import { GameCanvas } from "./game/GameCanvas";
import { LEVELS } from "./data/levels";
import type { BattleResult, LevelConfig } from "./game/types";
import { MainMenu } from "./components/MainMenu";
import { LevelSelect } from "./components/LevelSelect";
import { ResultScreen } from "./components/ResultScreen";
import { AdOverlay } from "./components/AdOverlay";
import { UpgradeScreen } from "./components/UpgradeScreen";
import { PreBattleBriefing } from "./components/PreBattleBriefing";
import type { ReviveOffer } from "./game/Game";
import { AdService } from "./game/services/AdService";
import {
  beginRun,
  buyUpgrade,
  canShowInterstitial,
  claimAdChest,
  claimDoubleReward,
  claimOfflineReward,
  getHomeSnapshot,
  markInterstitialShown,
  registerRewardedAd,
  restoreStaminaByAd,
  spendStamina,
  type RunMode
} from "./game/services/ProgressionService";
import { logEvent } from "./game/services/Analytics";
import type { UpgradeId } from "./game/config/rewards";

type Screen = "menu" | "levels" | "briefing" | "battle" | "result" | "upgrades";

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
  const [home, setHome] = useState(getHomeSnapshot);
  const [currentLevel, setCurrentLevel] = useState<LevelConfig>(LEVELS[0]);
  const [lastResult, setLastResult] = useState<BattleResult | null>(null);
  const [runIndex, setRunIndex] = useState(0);
  const [reviveOffer, setReviveOffer] = useState<ReviveOffer | null>(null);
  const [reviveSignal, setReviveSignal] = useState(0);
  const [declineReviveSignal, setDeclineReviveSignal] = useState(0);

  const refreshHome = useCallback(() => setHome(getHomeSnapshot()), []);

  const unlockedMap = useMemo(() => {
    return new Set(LEVELS.filter((level) => level.id <= unlockedLevel).map((level) => level.id));
  }, [unlockedLevel]);

  const startLevel = useCallback(
    (level: LevelConfig, mode: RunMode = "normal") => {
      // 确保 AudioContext 在用户交互时激活（移动端需要用户手势触发）
      try { new AudioContext().close(); } catch { /* no-op */ }
      setRunIndex(beginRun(level.id, mode));
      setCurrentLevel(level);
      setLastResult(null);
      setReviveOffer(null);
      refreshHome();
      setScreen("briefing");
    },
    [refreshHome]
  );

  const enterBattle = useCallback(() => {
    setScreen("battle");
  }, []);

  const handleFinish = useCallback(
    (result: BattleResult) => {
      setLastResult(result);
      if (result.win) {
        setUnlockedLevel((current) => {
          const next = Math.max(current, Math.min(LEVELS.length, result.levelId + 1));
          writeUnlockedLevel(next);
          return next;
        });
      }
      refreshHome();
      window.setTimeout(() => setScreen("result"), 180);
    },
    [refreshHome]
  );

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
    refreshHome();
  }, [lastResult, refreshHome]);

  const handleAdChest = useCallback(async () => {
    if (!lastResult) return;
    const success = await AdService.showRewardedAd("bonus_chest");
    if (!success) return;
    setLastResult(claimAdChest(lastResult));
    refreshHome();
  }, [lastResult, refreshHome]);

  const handleRevive = useCallback(async () => {
    if (!reviveOffer) return;
    const success = await AdService.showRewardedAd("revive");
    if (success) {
      registerRewardedAd("revive", reviveOffer.levelId);
      setReviveSignal((value) => value + 1);
      refreshHome();
    } else {
      logEvent("ad_skip", { adType: "rewarded", reason: "revive", levelId: reviveOffer.levelId });
      setDeclineReviveSignal((value) => value + 1);
    }
    setReviveOffer(null);
  }, [refreshHome, reviveOffer]);

  const declineRevive = useCallback(() => {
    if (reviveOffer) logEvent("ad_skip", { adType: "rewarded", reason: "revive", levelId: reviveOffer.levelId });
    setDeclineReviveSignal((value) => value + 1);
    setReviveOffer(null);
  }, [reviveOffer]);

  const handleHighYieldChallenge = useCallback(async () => {
    if (!spendStamina(5, "high_yield_challenge")) {
      const success = await AdService.showRewardedAd("stamina_restore");
      if (success) {
        restoreStaminaByAd();
        refreshHome();
      }
      return;
    }
    refreshHome();
    startLevel(LEVELS[Math.max(0, unlockedLevel - 1)], "highYield");
  }, [refreshHome, startLevel, unlockedLevel]);

  const handleRestoreStamina = useCallback(async () => {
    const success = await AdService.showRewardedAd("stamina_restore");
    if (success) {
      restoreStaminaByAd();
      refreshHome();
    }
  }, [refreshHome]);

  const handleDailyChallenge = useCallback(() => {
    const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, unlockedLevel - 1))];
    startLevel(level, "dailyChallenge");
  }, [startLevel, unlockedLevel]);

  const handleBuyUpgrade = useCallback(
    (id: UpgradeId) => {
      const result = buyUpgrade(id);
      setHome(result.progress);
    },
    []
  );

  const handleClaimOffline = useCallback(() => {
    setHome(claimOfflineReward(false));
  }, []);

  const handleClaimOfflineDouble = useCallback(async () => {
    const success = await AdService.showRewardedAd("double_reward");
    if (success) setHome(claimOfflineReward(true));
  }, []);

  return (
    <main className="app-shell">
      {screen === "menu" && (
        <MainMenu
          unlockedLevel={unlockedLevel}
          home={home}
          onStart={() => startLevel(LEVELS[0])}
          onContinue={() => startLevel(LEVELS[Math.max(0, unlockedLevel - 1)])}
          onLevels={() => setScreen("levels")}
          onDailyChallenge={handleDailyChallenge}
          onHighYieldChallenge={handleHighYieldChallenge}
          onUpgrades={() => setScreen("upgrades")}
          onRestoreStamina={handleRestoreStamina}
          onClaimOffline={handleClaimOffline}
          onClaimOfflineDouble={handleClaimOfflineDouble}
        />
      )}

      {screen === "levels" && (
        <LevelSelect
          levels={LEVELS}
          unlockedIds={unlockedMap}
          onBack={() => {
            refreshHome();
            setScreen("menu");
          }}
          onSelect={(level) => startLevel(level)}
        />
      )}

      {screen === "briefing" && (
        <PreBattleBriefing
          level={currentLevel}
          onReady={enterBattle}
        />
      )}

      {screen === "upgrades" && (
        <UpgradeScreen
          home={home}
          onBack={() => {
            refreshHome();
            setScreen("menu");
          }}
          onBuy={handleBuyUpgrade}
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
          onHome={() => {
            refreshHome();
            setScreen("menu");
          }}
          onDoubleReward={handleDoubleReward}
          onAdChest={handleAdChest}
        />
      )}
      <AdOverlay />
    </main>
  );
}
