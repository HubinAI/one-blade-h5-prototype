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

function percent(value: number, target: number) {
  return `${Math.min(100, Math.round((value / Math.max(1, target)) * 100))}%`;
}

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

  return (
    <section className="screen result-screen result-screen-v4">
      <span className="version-tag">我只要一刀 V0708001 IAA版</span>
      <div className={`result-medal ${result.win ? "win" : "lost"}`}>{result.rating}</div>
      <h2>{result.win ? "破阵成功" : "防线失守"}</h2>
      <p>
        第 {result.levelId} 关 · {result.levelTitle} · 用时 {Math.round(result.duration)} 秒
      </p>

      <dl className="result-grid result-grid-v4">
        <div>
          <dt>击杀数</dt>
          <dd>{result.kills}</dd>
        </div>
        <div>
          <dt>最大单刀</dt>
          <dd>{result.maxSingleBlade}</dd>
        </div>
        <div>
          <dt>最大连锁</dt>
          <dd>{result.maxChain}</dd>
        </div>
        <div>
          <dt>一刀破阵</dt>
          <dd>{result.oneBladeBreaks}</dd>
        </div>
        <div>
          <dt>火药连爆</dt>
          <dd>{result.explosiveCount}</dd>
        </div>
        <div>
          <dt>阵眼崩散</dt>
          <dd>{result.coreCollapseCount}</dd>
        </div>
        <div>
          <dt>挥刀次数</dt>
          <dd>{result.slashes}</dd>
        </div>
        <div>
          <dt>本关目标</dt>
          <dd>{result.completedGoal ? "完成" : "未完成"}</dd>
        </div>
        <div>
          <dt>阵眼切中</dt>
          <dd>{result.hitCore ? "是" : "否"}</dd>
        </div>
      </dl>

      <div className="reward-panel">
        <strong>本局奖励</strong>
        <div className="reward-line">
          <span>金币</span>
          <b>{result.rewards.coins}</b>
        </div>
        <div className="reward-line">
          <span>战功</span>
          <b>{result.rewards.battlePass}</b>
        </div>
        <div className="reward-line">
          <span>{result.rewards.shardName}</span>
          <b>+{result.rewards.shardCount}</b>
        </div>
        {result.rewards.dailyBonusApplied && <em>今日首胜已生效：金币翻倍，额外战功和碎片已到账</em>}
        {result.rewards.highYieldBonusApplied && <em>高收益挑战加成已生效</em>}
        {result.rewards.chestOpened && <em>战功宝箱已开启，获得额外金币和碎片</em>}
        {result.rewards.adChestOpened && <em>广告额外宝箱已领取</em>}
      </div>

      <div className="progress-panel">
        <div>
          <span>战功宝箱</span>
          <b>
            {result.progress.chestProgress}/{result.progress.chestTarget}
          </b>
          <i style={{ width: percent(result.progress.chestProgress, result.progress.chestTarget) }} />
        </div>
        <div>
          <span>图鉴发现</span>
          <b>
            {result.progress.codexFound}/{result.progress.codexTotal}
          </b>
          <i style={{ width: percent(result.progress.codexFound, result.progress.codexTotal) }} />
        </div>
        <div>
          <span>神之一刀挑战</span>
          <b>
            {result.progress.oneBladeChallenge}/{result.progress.oneBladeChallengeTarget}
          </b>
          <i style={{ width: percent(result.progress.oneBladeChallenge, result.progress.oneBladeChallengeTarget) }} />
        </div>
        <div>
          <span>{result.progress.fragmentName}</span>
          <b>
            {result.progress.fragmentCount}/{result.progress.fragmentTarget}
          </b>
          <i style={{ width: percent(result.progress.fragmentCount, result.progress.fragmentTarget) }} />
        </div>
      </div>

      <div className="near-miss">
        <strong>{result.nextRatingHint}</strong>
        {result.nearMisses.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      <div className="menu-actions result-actions">
        {result.win && hasNext && (
          <button className="primary-button" onClick={onNext}>
            下一关
          </button>
        )}
        <button className={result.win && hasNext ? "ghost-button" : "primary-button"} onClick={onRetry}>
          再来一局冲高分
        </button>
        {result.win && result.canDoubleReward && !result.rewards.doubled && (
          <button className="ad-button" onClick={onDoubleReward}>
            看广告奖励 x2 · {result.rewards.coins} → {doubledCoins} 金币
          </button>
        )}
        {result.rewards.chestOpened && !result.rewards.adChestOpened && (
          <button className="ad-button" onClick={onAdChest}>
            看广告额外开宝箱
          </button>
        )}
        <div className="small-actions">
          <button className="text-button" onClick={onHome}>
            首页
          </button>
          <button className="text-button" onClick={onLevels}>
            关卡选择
          </button>
        </div>
      </div>
    </section>
  );
}
