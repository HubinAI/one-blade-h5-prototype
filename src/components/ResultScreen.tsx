import { useState } from "react";
import type { BattleResult } from "../game/types";
import { showRewardedAdMock, incrementDailyAdCount } from "../game/services/AdService";
import { spendStamina } from "../game/services/ProgressionService";

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
  hasNext,
  onRetry,
  onNext,
  onHome,
  onDoubleReward,
  restartCurrentLevel,
}: ResultScreenProps) {
  const displayId = result.levelId >= 10000 ? result.levelId - 10000 : result.levelId;
  const [adState, setAdState] = useState<"idle" | "playing" | "done">("idle");
  const [extraSlashUsed, setExtraSlashUsed] = useState(false);

  /** 失败页：看广告补一刀 */
  const handleReviveSlash = async () => {
    setAdState("playing");
    const ok = await showRewardedAdMock("revive_extra_slash");
    setAdState("idle");
    if (ok) {
      incrementDailyAdCount("revive_extra_slash");
      setExtraSlashUsed(true);
      // 补一刀后重开本局（用重启）
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

  const isFirstRun = !window.localStorage.getItem("one_blade_first_run_done");

  return (
    <section className="screen result-screen market-result-screen">
      {/* 顶部分数 */}
      <div className="result-header-section">
        <h1 className={`result-title ${result.win ? "win" : "lose"}`}>
          {result.win ? "破阵成功！" : "防线被破"}
        </h1>
        <p className="result-level-info">第 {displayId} 关</p>

        <div className="result-rating-row">
          <span className="result-rating-grade" style={{
            color: result.rating === "SS" || result.rating === "神之一刀" ? "#ffd35a" : "#f6e7bd"
          }}>
            {result.rating}
          </span>
          <span className="result-rating-stars">{ratingStars[result.rating] ?? ""}</span>
        </div>
      </div>

      {/* 核心数据 */}
      <div className="result-stats-section">
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
      <div className="result-rewards-section">
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
        <div className="result-fail-reason">
          💡 {getFailReason(result)}
        </div>
      )}

      {/* 按钮区 */}
      <div className="result-actions-section">
        {result.win ? (
          <>
            {hasNext && (
              <button className="result-btn primary-btn" onClick={onNext}>
                下一关
              </button>
            )}
            <button className="result-btn secondary-btn" onClick={onRetry}>
              再来一局
            </button>
            {result.canDoubleReward && !result.rewards.doubled && (
              <button
                className="result-btn ad-btn"
                onClick={handleDoubleCoins}
                disabled={adState === "playing"}
              >
                📺 看广告 ×2
              </button>
            )}
          </>
        ) : (
          <>
            {!extraSlashUsed && (
              <button
                className="result-btn primary-btn"
                onClick={handleReviveSlash}
                disabled={adState === "playing"}
              >
                📺 看广告·补一刀
              </button>
            )}
            <button className="result-btn secondary-btn" onClick={onRetry}>
              再来一局
            </button>
          </>
        )}
      </div>

      {/* 返回按钮 */}
      <div className="result-back-section">
        <button className="result-btn ghost-btn" onClick={onHome}>
          返回首页
        </button>
      </div>
    </section>
  );
}
