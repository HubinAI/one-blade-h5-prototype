import { useCallback, useMemo, useState } from "react";
import { GameCanvas } from "./game/GameCanvas";
import { LEVELS } from "./data/levels";
import type { BattleResult, LevelConfig } from "./game/types";
import { MainMenu } from "./components/MainMenu";
import { LevelSelect } from "./components/LevelSelect";
import { ResultScreen } from "./components/ResultScreen";
import { AdOverlay } from "./components/AdOverlay";
import { UpgradeScreen } from "./components/UpgradeScreen";
import { PauseOverlay } from "./components/PauseOverlay";
import { Codex } from "./components/Codex";
import { ForgeScreen } from "./components/ForgeScreen";
import { ChallengeScreen } from "./components/ChallengeScreen";
import { TeamScreen } from "./components/TeamScreen";
import { RankingScreen } from "./components/RankingScreen";
import { MerchantScreen } from "./components/MerchantScreen";
import { IdleScreen } from "./components/IdleScreen";
import { BladeBagScreen } from "./components/BladeBagScreen";
import { DebugScreen } from "./components/DebugScreen";
import type { ReviveOffer } from "./game/Game";
import { AdService } from "./game/services/AdService";
import {
  beginRun,
  buyUpgrade,
  canShowInterstitial,
  claimAdChest,
  claimDoubleReward,
  claimOfflineReward,
  earnShareStamina,
  getHomeSnapshot,
  isFreeBurstAvailable,
  markInterstitialShown,
  registerRewardedAd,
  restoreStaminaByAd,
  saveCodexData,
  spendStamina,
  useFreeBurst,
  getBossLevelConfig,
  getCurrentRankId,
  tryRankUp,
  updateHighestFloor,
  type RunMode
} from "./game/services/ProgressionService";
import { logEvent } from "./game/services/Analytics";
import type { UpgradeId } from "./game/config/rewards";
import { REWARD_CONFIG } from "./game/config/rewards";
import { createFloorLevelConfig } from "./game/config/synthesis";

type Screen = "menu" | "battle" | "result" | "upgrades" | "forge" | "challenge" | "team" | "ranking" | "idle" | "bag" | "debug";

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
  const [appVersion] = useState("V0709012");
  const [runIndex, setRunIndex] = useState(0);
  const [reviveOffer, setReviveOffer] = useState<ReviveOffer | null>(null);
  const [reviveSignal, setReviveSignal] = useState(0);
  const [declineReviveSignal, setDeclineReviveSignal] = useState(0);
  const [showCodex, setShowCodex] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showMerchant, setShowMerchant] = useState(false);
  const [pendingMerchant, setPendingMerchant] = useState(false);

  const refreshHome = useCallback(() => setHome(getHomeSnapshot()), []);
  const [currentMainlineFloor, setCurrentMainlineFloor] = useState(1);

  const unlockedMap = useMemo(() => {
    return new Set(LEVELS.filter((level) => level.id <= unlockedLevel).map((level) => level.id));
  }, [unlockedLevel]);

  const startLevel = useCallback(
    (level: LevelConfig, mode: RunMode = "normal") => {
      // 确保 AudioContext 在用户交互时激活
      try { new AudioContext().close(); } catch { /* no-op */ }

      // 消耗体力
      if (mode !== "freeBurst") {
        const cost = mode === "normal" ? REWARD_CONFIG.stamina.mainlineCost : REWARD_CONFIG.stamina.challengeCost;
        if (!spendStamina(cost, `${mode}_run`)) {
          alert("体力不足！看广告或等恢复后再来");
          return;
        }
      } else {
        useFreeBurst();
      }

      setRunIndex(beginRun(level.id, mode));
      setCurrentLevel(level);
      setLastResult(null);
      setReviveOffer(null);
      refreshHome();
      setScreen("battle"); // 跳过战前简报
    },
    [refreshHome]
  );

  const startMainline = useCallback(() => {
    const floor = Math.max(1, home.highestFloor);
    setCurrentMainlineFloor(floor);
    // 体力消耗在 startLevel 里统一处理
    const level = createFloorLevelConfig(floor);
    startLevel(level, "normal");
  }, [home.highestFloor, startLevel]);

  const enterBattle = useCallback(() => {
    setScreen("battle");
  }, []);

  const handleFinish = useCallback(
    (result: BattleResult) => {
      setLastResult(result);
      // 保存图鉴数据
      saveCodexData(result.killedElites, result.killedBoss);
      if (result.win) {
        // 更新主线层数
        if (result.levelId >= 10000) {
          const floor = result.levelId - 10000;
          updateHighestFloor(floor + 1);
          setCurrentMainlineFloor(floor + 1);
        }
        setUnlockedLevel((current) => {
          const next = Math.max(current, Math.min(LEVELS.length, result.levelId + 1));
          writeUnlockedLevel(next);
          return next;
        });
      }
      refreshHome();
      window.setTimeout(() => {
        setScreen("result");
        // 主线通关后标记，待返回首页时弹商店
        if (result.win && result.levelId >= 10000) {
          setPendingMerchant(true);
        }
      }, 180);
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
    if (!lastResult) return;
    logEvent("replay_click", { levelId: lastResult.levelId, reason: lastResult.win ? "high_score" : "failed" });
    if (lastResult.levelId >= 10000) {
      // 主线模式：重新生成该层配置
      const floor = lastResult.levelId - 10000;
      setCurrentMainlineFloor(floor);
      const level = createFloorLevelConfig(floor);
      startLevel(level);
    } else {
      const target = LEVELS.find((l) => l.id === lastResult.levelId) ?? currentLevel;
      startLevel(target);
    }
  }, [currentLevel, lastResult, startLevel]);

  const handleNext = useCallback(async () => {
    if (!lastResult) return;
    logEvent("next_level_click", { levelId: lastResult.levelId });
    await maybeShowInterstitial();
    if (lastResult.levelId >= 10000) {
      // 主线下一层
      const floor = lastResult.levelId - 10000 + 1;
      setCurrentMainlineFloor(floor);
      const level = createFloorLevelConfig(floor);
      startLevel(level);
    } else if (nextLevel) {
      startLevel(nextLevel);
    }
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

  const handleHighYieldChallenge = useCallback(() => {
    startLevel(LEVELS[Math.max(0, unlockedLevel - 1)], "highYield");
  }, [startLevel, unlockedLevel]);

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

  const handleFreeBurst = useCallback(() => {
    if (!isFreeBurstAvailable()) return;
    useFreeBurst();
    const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, unlockedLevel - 1))];
    startLevel(level, "freeBurst");
    refreshHome();
  }, [startLevel, unlockedLevel, refreshHome]);

  const handleChallenge = useCallback((rankId: string) => {
    const bossLevel = getBossLevelConfig(rankId as any);
    startLevel(bossLevel, "challenge");
  }, [startLevel]);

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

  const restartBattle = useCallback(() => {
    setPaused(false);
    setRunIndex(beginRun(currentLevel.id, "normal"));
    setLastResult(null);
    setReviveOffer(null);
    refreshHome();
  }, [currentLevel, refreshHome]);

  const goToMenu = useCallback(() => {
    refreshHome();
    setScreen("menu");
    // 回到首页时，如果有待触发的神秘商人，则弹窗
    setTimeout(() => {
      setShowMerchant(prev => {
        if (pendingMerchant && !prev) return true;
        return prev;
      });
      setPendingMerchant(false);
    }, 200);
  }, [refreshHome, pendingMerchant]);

  const quitBattle = useCallback(() => {
    setPaused(false);
    goToMenu();
  }, [goToMenu]);

  return (
    <main className="app-shell">
      {screen === "menu" && (
        <MainMenu
          unlockedLevel={unlockedLevel}
          home={home}
          onStart={startMainline}
          onContinue={startMainline}
          onRestoreStamina={handleRestoreStamina}
          onCodex={() => setShowCodex(true)}
          onForge={() => setScreen("bag")}
          onRanking={() => setScreen("ranking")}
          onIdle={() => setScreen("idle")}
          onChallenge={() => setScreen("challenge")}
          onBag={() => setScreen("bag")}
          onDebug={() => setScreen("debug")}
          appVersion={appVersion}
        />
      )}

      {showCodex && <Codex onClose={() => setShowCodex(false)} />}

      {showMerchant && (
        <MerchantScreen
          onClose={() => setShowMerchant(false)}
          coins={home.coins}
          onCoinChange={refreshHome}
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

      {screen === "forge" && (
        <ForgeScreen onBack={() => { refreshHome(); setScreen("menu"); }} />
      )}

      {screen === "idle" && (
        <IdleScreen onBack={() => { refreshHome(); setScreen("menu"); }} />
      )}

      {screen === "bag" && (
        <BladeBagScreen onBack={() => { refreshHome(); setScreen("menu"); }} />
      )}

      {screen === "debug" && (
        <DebugScreen onBack={() => setScreen("menu")} />
      )}

      {screen === "team" && (
        <TeamScreen onBack={() => { refreshHome(); setScreen("menu"); }} />
      )}

      {screen === "ranking" && (
        <RankingScreen onBack={() => { refreshHome(); setScreen("menu"); }} />
      )}

      {screen === "challenge" && (
        <ChallengeScreen
          highestFloor={home.highestFloor}
          rankIndex={home.rankIndex}
          onBack={() => { refreshHome(); setScreen("menu"); }}
          onChallenge={handleChallenge}
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
            paused={paused || Boolean(reviveOffer)}
          />
          {!reviveOffer && !paused && (
            <button
              className="battle-pause-btn"
              onClick={() => setPaused(true)}
              aria-label="暂停"
            >
              ❚❚
            </button>
          )}
          {paused && !reviveOffer && (
            <PauseOverlay
              onResume={() => setPaused(false)}
              onRestart={restartBattle}
              onQuit={quitBattle}
            />
          )}
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
          onLevels={goToMenu}
          onHome={goToMenu}
          onDoubleReward={handleDoubleReward}
          onAdChest={handleAdChest}
        />
      )}
      <AdOverlay />
    </main>
  );
}
