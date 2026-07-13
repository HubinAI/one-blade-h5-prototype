import { useState, useMemo } from "react";
import type { HomeSnapshot } from "../game/services/ProgressionService";
import { getEquippedBlades } from "../game/services/ProgressionService";
import { RANK_CONFIG, RANK_ORDER, getStageNameByFloor } from "../game/config/synthesis";
import { QUALITY_META } from "../game/config/synthesis";
import { showRewardedAdMock, incrementDailyAdCount } from "../game/services/AdService";

type MainMenuProps = {
  unlockedLevel: number;
  home: HomeSnapshot;
  onStart: () => void;
  onContinue: () => void;
  onRestoreStamina: () => void;
  onRanking: () => void;
  onChallenge: () => void;
  onBag: () => void;
  onDebug: () => void;
  appVersion: string;
  onClaimOffline: () => void;
  onClaimOfflineDouble: () => void;
  pendingGate?: { breakthroughName: string; unlockText: string; breakthroughId: string } | null;
  onBreakthrough: () => void;
};

export function MainMenu({
  unlockedLevel,
  home,
  onStart,
  onContinue,
  onRestoreStamina,
  onRanking,
  onChallenge,
  onBag,
  onDebug,
  appVersion,
  onClaimOffline,
  onClaimOfflineDouble,
  pendingGate,
  onBreakthrough,
}: MainMenuProps) {
  const isFirstPlay = unlockedLevel <= 1 && home.coins === 0;
  const [adState, setAdState] = useState<"idle" | "playing">("idle");

  // 主刀信息
  const equipped = useMemo(() => getEquippedBlades(), []);
  const mainBlade = equipped.main;
  const mainBladeLabel = mainBlade
    ? `${QUALITY_META[mainBlade.quality]?.label ?? "凡品"}·${mainBlade.name}`
    : "凡品·练习木刀";

  // 今日目标：动态根据阶段卡点
  const goalRankIndex = 1; // 筑基
  const currentRankId = RANK_ORDER[home.rankIndex] ?? RANK_ORDER[0];
  const goalRankId = RANK_ORDER[goalRankIndex] ?? RANK_ORDER[1];
  const goalReached = home.rankIndex >= goalRankIndex;
  const goalText = goalReached
    ? "今日目标已完成 🎉"
    : `今日目标：突破到${RANK_CONFIG[goalRankId]?.name ?? "筑基"}`;

  // 关卡动画信息
  const stageName = getStageNameByFloor(Math.max(1, home.highestFloor));

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
    <section className="screen menu-screen market-home-screen zhao-yun-style">
      {/* 顶部:游戏标题 + 金币/体力 */}
      <div className="zys-top">
        <h1 className="zys-title">我只要一刀</h1>
        <p className="zys-subtitle">敌军压境，一刀破阵</p>
      </div>

      {/* 今日目标 */}
      <div className={`zys-goal ${goalReached ? "done" : ""}`}>
        <span className="zys-goal-icon">{goalReached ? "🎉" : "🎯"}</span>
        <span className="zys-goal-text">{goalText}</span>
      </div>

      {/* 主刀 + 体力 状态行 */}
      <div className="zys-status-row">
        <div className="zys-status-item">
          <span className="zys-status-label">当前主刀</span>
          <span className="zys-status-value">{mainBladeLabel}</span>
        </div>
        <div className="zys-status-item">
          <span className="zys-status-label">体力</span>
          <span className="zys-status-value stamina">
            {home.stamina}/{home.staminaMax}
            {home.stamina < 5 && (
              <button className="zys-stamina-btn" onClick={onRestoreStamina}>恢复</button>
            )}
          </span>
        </div>
      </div>

      {/* 离线收益 */}
      {hasOffline && (
        <div className="zys-offline-row">
          <span className="zys-offline-icon">🛌</span>
          <span className="zys-offline-text">离线收益可领取: {home.offlineCoins} 金币</span>
          <div className="zys-offline-actions">
            <button className="zys-offline-claim small" onClick={onClaimOffline}>
              领取
            </button>
            <button
              className="zys-offline-ad small"
              onClick={handleIdleDouble}
              disabled={adState === "playing"}
            >
              📺 ×2
            </button>
          </div>
        </div>
      )}

      {/* 中央偏下:大主按钮(继续闯关/突破) + 体力消耗 */}
      <div className="zys-main-button-area">
        {pendingGate ? (
          <button className="zys-breakthrough-btn" onClick={onBreakthrough}>
            <span className="zys-breakthrough-icon">✦</span>
            <span className="zys-breakthrough-name">{pendingGate.breakthroughName}</span>
            <span className="zys-breakthrough-sub">{pendingGate.unlockText}</span>
          </button>
        ) : (
          <button
            className="zys-start-btn"
            onClick={isFirstPlay ? onStart : onContinue}
          >
            <span className="zys-start-icon">⚔</span>
            <span className="zys-start-text">开始游戏</span>
            <span className="zys-start-stamina">消耗 {REWARD_CONFIG_STAMINA} 体力</span>
          </button>
        )}
      </div>

      {/* 底部左右:排行 + 炼器合成 */}
      <div className="zys-bottom-row">
        <button className="zys-side-btn" onClick={onRanking}>
          <div className="zys-side-icon">🏯</div>
          <div className="zys-side-label">排行榜</div>
        </button>
        <button className="zys-side-btn" onClick={onBag}>
          <div className="zys-side-icon forge-icon">⚒</div>
          <div className="zys-side-label">炼器合成</div>
        </button>
      </div>

      {/* 隐藏的 weak 入口(仅挑战/挂机,通过长按 debug 按钮触发) */}
      {pendingGate === null && (
        <div className="zys-hidden-actions">
          <button className="zys-mini-btn" onClick={onChallenge}>⚔ 挑战</button>
          <button className="zys-mini-btn" onClick={onBag}>🛌 挂机</button>
        </div>
      )}

      {/* 版本 + debug */}
      <div className="zys-footer">
        <small className="version-footer">{appVersion}</small>
        <button className="debug-toggle" onClick={onDebug}>🛠</button>
      </div>
    </section>
  );
}

// 暴露的常量,避免再 import 全套配置
const REWARD_CONFIG_STAMINA = 5;
