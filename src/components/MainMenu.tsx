import { useState, useMemo } from "react";
import type { HomeSnapshot } from "../game/services/ProgressionService";
import { getEquippedBlades } from "../game/services/ProgressionService";
import { RANK_CONFIG, RANK_ORDER } from "../game/config/synthesis";
import { QUALITY_META } from "../game/config/synthesis";
import { showRewardedAdMock, incrementDailyAdCount } from "../game/services/AdService";

type MainMenuProps = {
  unlockedLevel: number;
  home: HomeSnapshot;
  onStart: () => void;
  onContinue: () => void;
  onRestoreStamina: () => void;
  onCodex: () => void;
  onForge: () => void;
  onRanking: () => void;
  onIdle: () => void;
  onChallenge: () => void;
  onBag: () => void;
  onDebug: () => void;
  appVersion: string;
  onClaimOffline: () => void;
  onClaimOfflineDouble: () => void;
};

export function MainMenu({
  unlockedLevel,
  home,
  onStart,
  onContinue,
  onRestoreStamina,
  onCodex,
  onRanking,
  onIdle,
  onChallenge,
  onBag,
  onDebug,
  appVersion,
  onClaimOffline,
  onClaimOfflineDouble,
}: MainMenuProps) {
  const isFirstPlay = unlockedLevel <= 1 && home.coins === 0;
  const [adState, setAdState] = useState<"idle" | "playing">("idle");

  // 主刀信息
  const equipped = useMemo(() => getEquippedBlades(), []);
  const mainBlade = equipped.main;
  const mainBladeLabel = mainBlade
    ? `${QUALITY_META[mainBlade.quality]?.label ?? "凡品"}·${mainBlade.name}`
    : "凡品·练习木刀";

  // 今日目标：简化版，目标定为突破到筑基(索引1)
  const goalRankIndex = 1; // 筑基
  const currentRankId = RANK_ORDER[home.rankIndex] ?? RANK_ORDER[0];
  const goalRankId = RANK_ORDER[goalRankIndex] ?? RANK_ORDER[1];
  const goalReached = home.rankIndex >= goalRankIndex;
  const goalText = goalReached
    ? "今日目标已完成 🎉"
    : `今日目标：突破到${RANK_CONFIG[goalRankId]?.name ?? "筑基"}`;

  // 离线收益
  const hasOffline = home.offlineCoins > 0;

  const handleIdleDouble = async () => {
    setAdState("playing");
    const ok = await showRewardedAdMock("quick_idle_reward");
    setAdState("idle");
    if (ok) {
      incrementDailyAdCount("quick_idle_reward");
      onClaimOfflineDouble();
    }
  };

  return (
    <section className="screen menu-screen market-home-screen">
      {/* 标题区 */}
      <div className="market-home-title-section">
        <h1>我只要一刀</h1>
        <p className="market-home-subtitle">敌军压境，一刀破阵</p>
      </div>

      {/* 今日目标 */}
      <div className={`market-home-goal ${goalReached ? "done" : ""}`}>
        <span className="market-home-goal-icon">{goalReached ? "✅" : "🎯"}</span>
        <span className="market-home-goal-text">{goalText}</span>
      </div>

      {/* 当前状态信息 */}
      <div className="market-home-status-row">
        <div className="market-home-status-item">
          <span className="status-label">当前主刀</span>
          <span className="status-value">{mainBladeLabel}</span>
        </div>
        <div className="market-home-status-item">
          <span className="status-label">体力</span>
          <span className="status-value stamina">{home.stamina}/{home.staminaMax}
            {home.stamina < 5 && (
              <button className="status-ad-btn" onClick={onRestoreStamina}>恢复</button>
            )}
          </span>
        </div>
      </div>

      {/* 离线收益 */}
      {hasOffline && (
        <div className="market-home-offline-row">
          <span className="offline-icon">🛌</span>
          <span className="offline-text">离线收益可领取: {home.offlineCoins} 金币</span>
          <div className="offline-actions">
            <button className="offline-claim-btn small" onClick={onClaimOffline}>
              领取
            </button>
            <button
              className="offline-ad-btn small"
              onClick={handleIdleDouble}
              disabled={adState === "playing"}
            >
              📺 ×2
            </button>
          </div>
        </div>
      )}

      {/* 核心操作按钮 */}
      <div className="market-home-actions">
        <button
          className="market-btn main-btn"
          onClick={isFirstPlay ? onStart : onContinue}
        >
          <span className="main-btn-icon">⚡</span>
          <span className="main-btn-text">继续闯关</span>
          <span className="main-btn-sub">消耗5体力</span>
        </button>

        <button className="market-btn forge-btn" onClick={onBag}>
          <span className="forge-btn-icon">⚔</span>
          <span>炼器合成</span>
        </button>
      </div>

      {/* 弱入口 */}
      <div className="market-home-sub-actions">
        <button className="sub-btn" onClick={onCodex}>
          📖 图鉴
        </button>
        <button className="sub-btn" onClick={onRanking}>
          🏆 排行榜
        </button>
        <button className="sub-btn" onClick={onIdle}>
          🛌 挂机
        </button>
        <button className="sub-btn" onClick={onChallenge}>
          ⚔ 挑战
        </button>
      </div>

      {/* 公告/版本 */}
      <div className="market-home-footer">
        <small className="version-footer">{appVersion}</small>
        <button className="debug-toggle" onClick={onDebug}>🛠</button>
      </div>
    </section>
  );
}
