import { useState } from "react";
import type { BattleResult } from "../game/types";
import { showRewardedAdMock, incrementDailyAdCount } from "../game/services/AdService";

type ResultScreenProps = {
  result: BattleResult;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onLevels: () => void;
  onHome: () => void;
  onDoubleReward: () => void;
  onAdChest: () => void;
  restartCurrentLevel: () => void;
};

/** 失败原因推测 */
function getFailReason(result: BattleResult): string {
  if (result.kills === 0) return "没有及时挥刀";
  if (result.maxSingleBlade <= 3) return "单刀击杀过少，积蓄刀势再挥刀";
  if (result.explosiveCount === 0) return "没有利用火药兵连锁爆炸";
  return "双拳难敌四手，试试提升装备";
}

export function ResultScreen({
  result,
  onHome,
  onDoubleReward,
  restartCurrentLevel,
}: ResultScreenProps) {
  const displayId = result.levelId >= 10000 ? result.levelId - 10000 : result.levelId;
  const [adState, setAdState] = useState<"idle" | "playing">("idle");
  const [extraSlashUsed, setExtraSlashUsed] = useState(false);

  /** 失败页：看广告补一刀 */
  const handleReviveSlash = async () => {
    setAdState("playing");
    const ok = await showRewardedAdMock("revive_extra_slash");
    setAdState("idle");
    if (ok) {
      incrementDailyAdCount("revive_extra_slash");
      setExtraSlashUsed(true);
      restartCurrentLevel();
    }
  };

  /** 胜利页：看广告金币×2 */
  const handleDoubleCoins = async () => {
    setAdState("playing");
    const ok = await showRewardedAdMock("double_coins");
    setAdState("idle");
    if (ok) {
      onDoubleReward();
    }
  };

  const ratingStars: Record<string, string> = {
    "C": "★★☆☆☆",
    "B": "★★★☆☆",
    "A": "★★★★☆",
    "S": "★★★★★",
    "SS": "★★★★★",
    "神之一刀": "★★★★★",
  };

  // 整个空白区域点击 → 返回首页
  function handleBackgroundClick() {
    onHome();
  }

  // 点击空白返回（不触发按钮的点击）
  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <section
      className="screen result-screen market-result-screen"
      onClick={handleBackgroundClick}
    >
      {/* 顶部分数 */}
      <div className="result-header-section" onClick={stop}>
        <h1 className={`result-title ${result.win ? "win" : "lose"}`}>
          {result.win ? "破阵成功！" : "失败"}
        </h1>
        <p className="result-level-info">第 {displayId} 关</p>

        <div className="result-rating-row">
          <span
            className="result-rating-grade"
            style={{
              color:
                result.rating === "SS" || result.rating === "神之一刀"
                  ? "#ffd35a"
                  : "#f6e7bd",
            }}
          >
            {result.rating}
          </span>
          <span className="result-rating-stars">
            {ratingStars[result.rating] ?? ""}
          </span>
        </div>
      </div>

      {/* 核心数据 */}
      <div className="result-stats-section" onClick={stop}>
        <div className="result-stat">
          <span className="result-stat-label">最大单刀击杀</span>
          <span className="result-stat-value">{result.maxSingleBlade}</span>
        </div>
        <div className="result-stat">
          <span className="result-stat-label">最大连锁</span>
          <span className="result-stat-value">{result.maxChain}</span>
        </div>
        <div className="result-stat">
          <span className="result-stat-label">用时</span>
          <span className="result-stat-value">{Math.round(result.duration)}s</span>
        </div>
      </div>

      {/* 奖励 */}
      <div className="result-rewards-section" onClick={stop}>
        <div className="result-reward">
          <span className="result-reward-icon">🪙</span>
          <span className="result-reward-amount">+{result.rewards.coins}</span>
        </div>
        <div className="result-reward">
          <span className="result-reward-icon">⚔</span>
          <span className="result-reward-amount">+{result.rewards.battlePass}</span>
        </div>
        {result.triggeredOneBlade && (
          <div className="result-reward special">⚔ 一刀破阵</div>
        )}
      </div>

      {/* 失败原因提示 */}
      {!result.win && (
        <div className="result-fail-reason" onClick={stop}>
          💡 {getFailReason(result)}
        </div>
      )}

      {/* 唯一按钮：看广告 */}
      <div className="result-actions-section" onClick={stop}>
        {result.win ? (
          result.canDoubleReward && !result.rewards.doubled && (
            <button
              className="result-btn ad-btn single-btn"
              onClick={handleDoubleCoins}
              disabled={adState === "playing"}
            >
              📺 看广告 ×2
            </button>
          )
        ) : (
          !extraSlashUsed && (
            <button
              className="result-btn ad-btn single-btn"
              onClick={handleReviveSlash}
              disabled={adState === "playing"}
            >
              📺 看广告·补一刀
            </button>
          )
        )}
      </div>

      {/* 底部提示：点击空白返回 */}
      <div className="result-tap-tip" onClick={stop}>
        · 点击空白处返回 ·
      </div>
    </section>
  );
}
