import type { BattleResult } from "../game/types";

type ResultScreenProps = {
  result: BattleResult;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onLevels: () => void;
  onHome: () => void;
  onDoubleReward: () => void;
  onAdChest: () => void;
};

export function ResultScreen({
  result,
  hasNext,
  onRetry,
  onNext,
  onLevels,
  onHome,
  onDoubleReward,
  onAdChest
}: ResultScreenProps) {
  const doubledCoins = result.rewards.coins * 2;
  const primaryAction = result.win && hasNext ? onNext : onRetry;
  const primaryLabel = result.win && hasNext ? "下一关" : "再来一局";

  return (
    <section className="screen result-screen result-screen-v5">
      <span className="version-tag">我只要一刀 V0708003</span>

      <div className="result-header">
        <div className={`result-medal ${result.win ? "win" : "lost"}`}>{result.rating}</div>
        <h2>{result.win ? "破阵成功" : "防线失守"}</h2>
        <p>
          第 {result.levelId} 关 · {result.levelTitle}
        </p>
      </div>

      <div className="result-hero-stats">
        <div>
          <span>击杀</span>
          <b>{result.kills}</b>
        </div>
        <div className="hero-stat-highlight">
          <span>最大单刀</span>
          <b>{result.maxSingleBlade}</b>
        </div>
        <div>
          <span>用时</span>
          <b>{Math.round(result.duration)}s</b>
        </div>
      </div>

      <div className="reward-summary">
        <span className="reward-pill reward-coins">{result.rewards.coins} 金币</span>
        <span className="reward-pill reward-pass">{result.rewards.battlePass} 战功</span>
        <span className="reward-pill reward-shard">
          {result.rewards.shardName} +{result.rewards.shardCount}
        </span>
      </div>

      <div className="result-progress">
        <div className="result-progress-row">
          <span>战功宝箱</span>
          <b>
            {result.progress.chestProgress}/{result.progress.chestTarget}
          </b>
          <i style={{ width: `${Math.min(100, (result.progress.chestProgress / Math.max(1, result.progress.chestTarget)) * 100)}%` }} />
        </div>
        <div className="result-progress-row">
          <span>{result.progress.fragmentName}</span>
          <b>
            {result.progress.fragmentCount}/{result.progress.fragmentTarget}
          </b>
          <i style={{ width: `${Math.min(100, (result.progress.fragmentCount / Math.max(1, result.progress.fragmentTarget)) * 100)}%` }} />
        </div>
      </div>

      <div className="menu-actions result-actions">
        <button className="primary-button" onClick={primaryAction}>
          {primaryLabel}
        </button>
        {result.win && result.canDoubleReward && !result.rewards.doubled && (
          <button className="ad-button" onClick={onDoubleReward}>
            广告翻倍 · {doubledCoins} 金币
          </button>
        )}
        {result.rewards.chestOpened && !result.rewards.adChestOpened && (
          <button className="ad-button" onClick={onAdChest}>
            广告额外宝箱
          </button>
        )}
        <div className="small-actions">
          <button className="text-button" onClick={onHome}>
            首页
          </button>
          <button className="text-button" onClick={onLevels}>
            选关
          </button>
        </div>
      </div>
    </section>
  );
}
