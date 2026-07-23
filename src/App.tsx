import { useCallback, useMemo, useState } from "react";
import { GameCanvas } from "./game/GameCanvas";
import { LEVELS } from "./data/levels";
import type { BattleResult, BossPhaseState, LevelConfig } from "./game/types";
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
  forceSetHighestFloor,
  getCurrentRunContext,
  getPendingGate,
  getBlockingGateForFloor,
  recordMainlineClear,
  completeBreakthroughProgress,
  type RunMode
} from "./game/services/ProgressionService";
import { logEvent } from "./game/services/Analytics";
import type { UpgradeId } from "./game/config/rewards";
import { REWARD_CONFIG } from "./game/config/rewards";
import { createFloorLevelConfig, MAIN_STAGE_GATES, getCurrentGate, RANK_ORDER } from "./game/config/synthesis";

type Screen = "menu" | "battle" | "result" | "upgrades" | "forge" | "challenge" | "team" | "ranking" | "idle" | "bag" | "debug" | "breakthroughResult" | "bossFailScreen";

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
  const [appVersion] = useState("V0723004");
  /** P0: bossFlow 参数（双入口） */
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const bossFlow: "legacy" | "reactive" = urlParams.get("bossFlow") === "reactive" ? "reactive" : "legacy";
  const [runIndex, setRunIndex] = useState(0);
  const [currentMode, setCurrentMode] = useState<RunMode>("normal");
  const [reviveOffer, setReviveOffer] = useState<ReviveOffer | null>(null);
  const [reviveSignal, setReviveSignal] = useState(0);
  const [declineReviveSignal, setDeclineReviveSignal] = useState(0);
  const [retryExecutionRequested, setRetryExecutionRequested] = useState(false);
  const handleRetryExecutionConsumed = () => setRetryExecutionRequested(false);
  const [bossPhase, setBossPhase] = useState<BossPhaseState | null>(null);
  const handleBossPhaseChange = (phase: BossPhaseState | null) => setBossPhase(phase);
  const [showCodex, setShowCodex] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showMerchant, setShowMerchant] = useState(false);
  const [pendingMerchant, setPendingMerchant] = useState(false);
  const [breakthroughResult, setBreakthroughResult] = useState<{ name: string; id: string; unlockText: string } | null>(null);
  const pendingGate = getPendingGate();

  const refreshHome = useCallback(() => setHome(getHomeSnapshot()), []);
  const completeBreakthrough = useCallback(() => {
    if (!breakthroughResult) return;
    const result = completeBreakthroughProgress(breakthroughResult.id);
    if (result.ok) {
      setCurrentMainlineFloor(result.nextFloor);
    }
    setBreakthroughResult(null);
    setCurrentMode("normal");
    const nextHome = getHomeSnapshot();
    setHome(nextHome);
    console.log("[breakthrough complete]", { id: breakthroughResult.id, nextFloor: result.nextFloor, ok: result.ok, home: nextHome, pendingGate: getPendingGate() });
    setScreen("menu");
  }, [breakthroughResult]);

  const [currentMainlineFloor, setCurrentMainlineFloor] = useState(1);

  const unlockedMap = useMemo(() => {
    return new Set(LEVELS.filter((level) => level.id <= unlockedLevel).map((level) => level.id));
  }, [unlockedLevel]);

  const startLevel = useCallback(
    (level: LevelConfig, mode: RunMode = "normal") => {
      // 确保 AudioContext 在用户交互时激活
      try { new AudioContext().close(); } catch { /* no-op */ }

      // 消耗体力 (突破战不消耗体力, 视为免费挑战)
      if (mode === "challenge") {
        // 突破战: 不消耗体力, 不需要 freeBurst
      } else if (mode !== "freeBurst") {
        const cost = REWARD_CONFIG.stamina.mainlineCost;
        if (!spendStamina(cost, `${mode}_run`)) {
          alert("体力不足！看广告或等恢复后再来");
          return;
        }
      } else {
        useFreeBurst();
      }

      setRunIndex(beginRun(level.id, mode));
      setCurrentMode(mode);
      setCurrentLevel(level);
      setLastResult(null);
      setReviveOffer(null);
      refreshHome();
      setScreen("battle"); // 跳过战前简报
    },
    [refreshHome]
  );

  const startMainline = useCallback(() => {
    // P3.10：优先检查 pendingBreakthroughId
    const pendingGate = getPendingGate();
    if (pendingGate) {
      const bossLevel = getBossLevelConfig(pendingGate.rankId);
      startLevel(bossLevel, "challenge");
      return;
    }
    const targetFloor = Math.max(1, getHomeSnapshot().highestFloor);
    const blockingGate = getBlockingGateForFloor(targetFloor);
    if (blockingGate) {
      const bossLevel = getBossLevelConfig(blockingGate.rankId);
      startLevel(bossLevel, "challenge");
      return;
    }
    setCurrentMainlineFloor(targetFloor);
    const level = createFloorLevelConfig(targetFloor);
    startLevel(level, "normal");
  }, [startLevel]);

  const enterBattle = useCallback(() => {
    setScreen("battle");
  }, []);

  const handleFinish = useCallback(
    (result: BattleResult) => {
      setLastResult(result);
      // 保存图鉴数据
      saveCodexData(result.killedElites, result.killedBoss);
      if (result.win) {
        // P3.10：使用 recordMainlineClear 原子处理突破状态
        if (result.levelId >= 10000) {
          const floor = result.levelId - 10000;
          const transition = recordMainlineClear(floor);
          setCurrentMainlineFloor(transition.nextFloor);
        }
        setUnlockedLevel((current) => {
          const next = Math.max(current, Math.min(LEVELS.length, result.levelId + 1));
          writeUnlockedLevel(next);
          return next;
        });
      }
      refreshHome();
      window.setTimeout(() => {
        // P4.4A.1: Boss战失败显示临时失败页
        if (!result.win && currentMode === "challenge") {
          setScreen("bossFailScreen");
          return;
        }
        // 检测是否为突破战胜利
        // P3.3：突破检测使用内存态 currentMode，不再依赖 storage（已被 applyBattleRewards 重置）
        if (result.win && currentMode === "challenge") {
          // 突破战胜利：根据 result.levelId 找对应 rankId
          // result.levelId = 100 + rankIdx
          const rankIdx = Math.max(0, result.levelId - 100);
          const rankId = RANK_ORDER[rankIdx];
          // 找到对应 gate
          const gate = MAIN_STAGE_GATES.find(g => g.rankId === rankId);
          if (gate) {
            setBreakthroughResult({ name: gate.breakthroughName, id: gate.breakthroughId, unlockText: gate.unlockText });
            setScreen("breakthroughResult");
            return;
          }
        }
        setScreen("result");
        // 主线通关后标记，待返回首页时弹商店
        if (result.win && result.levelId >= 10000) {
          setPendingMerchant(true);
        }
      }, 180);
    },
    [refreshHome, home.highestFloor, currentMode]
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
      // P3.10：主线下一层需检测突破卡点
      const clearedFloor = lastResult.levelId - 10000;
      const gate = MAIN_STAGE_GATES.find(item => item.afterStage === clearedFloor);
      if (gate) {
        goToMenu();
        return;
      }
      const nextFloor = clearedFloor + 1;
      const blockingGate = getBlockingGateForFloor(nextFloor);
      if (blockingGate) {
        goToMenu();
        return;
      }
      setCurrentMainlineFloor(nextFloor);
      const level = createFloorLevelConfig(nextFloor);
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

  /** 突破战：从卡点阶段起始层开始突破战 */
  const handleBreakthrough = useCallback(() => {
    if (!pendingGate) return;
    const bossLevel = getBossLevelConfig(pendingGate.rankId);
    startLevel(bossLevel, "challenge");
  }, [pendingGate, startLevel]);

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
          onRanking={() => setScreen("ranking")}
          onBag={() => setScreen("bag")}
          onIdle={() => setScreen("idle")}
          onDebug={() => setScreen("debug")}
          appVersion={appVersion}
          pendingGate={pendingGate ? { breakthroughName: pendingGate.breakthroughName, unlockText: pendingGate.unlockText, breakthroughId: pendingGate.breakthroughId } : null}
          onBreakthrough={handleBreakthrough}
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
        <BladeBagScreen
          onBack={() => { refreshHome(); setScreen("menu"); }}
          onOpenCodex={() => setShowCodex(true)}
        />
      )}

      {screen === "debug" && (
        <DebugScreen onBack={() => { refreshHome(); setScreen("menu"); }} />
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
            runMode={currentMode === "challenge" ? "challenge" : "normal"}
            retryExecutionRequested={retryExecutionRequested}
            onRetryExecutionConsumed={handleRetryExecutionConsumed}
            onBossPhaseChange={handleBossPhaseChange}
            bossFlow={bossFlow}
          />
          {(() => {
            const isExecutionPhase = bossPhase && ["execution_intro", "execution", "execution_success", "execution_fail"].includes(bossPhase);
            return !reviveOffer && !paused && !isExecutionPhase ? (
              <button
                className="battle-pause-btn"
                onClick={() => setPaused(true)}
                aria-label="暂停"
              >
                ❚❚
              </button>
            ) : null;
          })()}
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
          restartCurrentLevel={restartBattle}
        />
      )}

      {screen === "breakthroughResult" && breakthroughResult && (
        <section className="screen breakthrough-screen" onClick={completeBreakthrough}>
          <div className="breakthrough-bg-light" />
          <div className="breakthrough-icon">✦</div>
          <h1 className="breakthrough-title">破境成功！</h1>
          <p className="breakthrough-realm">你已突破至{breakthroughResult.name}</p>
          <div className="breakthrough-unlock">{breakthroughResult.unlockText}</div>
          <button className="breakthrough-btn" onClick={(e) => {
            e.stopPropagation();
            completeBreakthrough();
          }}>
            破境
          </button>
          <p className="breakthrough-tip">点击任意处或破境按钮继续</p>
        </section>
      )}

      {/* P4.4A.1: Boss失败临时页面 */}
      {screen === "bossFailScreen" && (
        <section className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d0015', color: '#d7bde2' }}>
          <h1 style={{ fontSize: 28, color: '#ff6a33', marginBottom: 12 }}>挑战失败</h1>
          <p style={{ fontSize: 14, marginBottom: 6, opacity: 0.7 }}>一刀未命中命核</p>
          <p style={{ fontSize: 14, marginBottom: 24, opacity: 0.7 }}>终结阶段失败</p>
          <button
            className="battle-btn"
            style={{ width: 180, marginBottom: 8, background: '#6c3483', border: '1px solid #8e44ad' }}
            onClick={() => {
              // P4.4A.4: 重试直接回到execution_intro
              setRetryExecutionRequested(true);
              setScreen("battle");
            }}
          >
            再试一次
          </button>
          <button className="battle-btn" style={{ width: 180, marginBottom: 8, background: '#2c1038', border: '1px solid #4a2060' }} onClick={() => {
            // P4.4A.4: 完全重新开始（从Boss intro开始）
            const bossLevel = getBossLevelConfig(getCurrentRankId());
            startLevel(bossLevel, "challenge");
          }}>
            重新挑战（从头开始）
          </button>
          <button className="battle-btn" style={{ width: 180, background: '#2c1038', border: '1px solid #4a2060' }} onClick={() => { setCurrentMode("normal"); setScreen("menu"); }}>
            返回
          </button>
        </section>
      )}

      <AdOverlay />
    </main>
  );
}
