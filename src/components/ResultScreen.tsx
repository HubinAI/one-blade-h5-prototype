import type { BattleResult, SkillDimension } from "../game/types";
import { ROUTE_NAMES, ROUTE_COLORS } from "../game/config/buffs";

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

const DIMENSION_META: Record<SkillDimension, { label: string; color: string }> = {
  momentum: { label: "势", color: "#ff6a33" },
  precision: { label: "斩", color: "#ffd35a" },
  shatter: { label: "破", color: "#9b6dff" },
  guard: { label: "守", color: "#5b8db8" }
};

function SkillRadar({ scores }: { scores: BattleResult["skillScores"] }) {
  const dims: SkillDimension[] = ["momentum", "precision", "shatter", "guard"];
  const cx = 50;
  const cy = 50;
  const r = 38;
  const angles: Record<SkillDimension, number> = {
    momentum: -90,
    precision: 0,
    shatter: 90,
    guard: 180
  };

  function polarToXY(dim: SkillDimension, value: number) {
    const angleRad = (angles[dim] * Math.PI) / 180;
    const dist = (value / 100) * r;
    return { x: cx + dist * Math.cos(angleRad), y: cy + dist * Math.sin(angleRad) };
  }

  const points = dims.map((dim) => polarToXY(dim, scores[dim]));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";

  return (
    <div className="skill-radar-compact">
      <svg viewBox="0 0 100 100" className="skill-radar-compact-svg">
        {[50, 100].map((level) => {
          const gridPoints = dims.map((dim) => polarToXY(dim, level));
          const gridPath = gridPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";
          return <path key={level} d={gridPath} fill="none" stroke="rgba(246,231,189,0.10)" strokeWidth="0.5" />;
        })}
        {dims.map((dim) => {
          const end = polarToXY(dim, 100);
          return <line key={dim} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="rgba(246,231,189,0.15)" strokeWidth="0.4" />;
        })}
        <path d={pathD} fill="rgba(240,195,107,0.14)" stroke="#ffd35a" strokeWidth="1" />
        {dims.map((dim) => {
          const p = polarToXY(dim, scores[dim]);
          return <circle key={dim} cx={p.x} cy={p.y} r="2.5" fill={DIMENSION_META[dim].color} stroke="#fff" strokeWidth="0.5" />;
        })}
      </svg>
      <div className="skill-radar-compact-labels">
        {dims.map((dim) => (
          <span key={dim} style={{ color: DIMENSION_META[dim].color }}>
            {DIMENSION_META[dim].label} <b>{scores[dim]}</b>
          </span>
        ))}
      </div>
    </div>
  );
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
  const primaryAction = result.win && hasNext ? onNext : onRetry;
  const primaryLabel = result.win && hasNext ? "下一关" : "再来一局";

  const routeCounts: Record<string, number> = {};
  for (const route of result.selectedRoutes) {
    routeCounts[route] = (routeCounts[route] ?? 0) + 1;
  }
  const mainRoute = (Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]) as keyof typeof ROUTE_NAMES | undefined;

  return (
    <section className="screen result-screen result-screen-v6">
      <div className="result-v6-header">
        <div className={`result-v6-medal ${result.win ? "win" : "lost"} ${result.win && result.rating !== "C" ? "medal-pop" : ""}`}>
          {result.rating}
        </div>
        {result.win && result.rating !== "C" && <div className="medal-glow-ring" />}
        <h2>{result.win ? "破阵成功" : "防线失守"}</h2>
        <p>第 {result.levelId} 关 · {result.levelTitle}</p>
      </div>

      <div className="result-v6-stats">
        <div>
          <span>击杀</span>
          <b>{result.kills}</b>
        </div>
        <div className="highlight">
          <span>最大单刀</span>
          <b>{result.maxSingleBlade}</b>
        </div>
        <div>
          <span>用时</span>
          <b>{Math.round(result.duration)}s</b>
        </div>
      </div>

      <div className="result-v6-radar">
        <SkillRadar scores={result.skillScores} />
        {mainRoute && (
          <div className="result-v6-route" style={{ borderColor: ROUTE_COLORS[mainRoute], color: ROUTE_COLORS[mainRoute] }}>
            主路线：{ROUTE_NAMES[mainRoute]}
          </div>
        )}
      </div>

      <div className="result-v6-rewards">
        <span className="reward-pill reward-coins">{result.rewards.coins} 金币</span>
        <span className="reward-pill reward-pass">{result.rewards.battlePass} 战功</span>
        <span className="reward-pill reward-shard">{result.rewards.shardName} +{result.rewards.shardCount}</span>
      </div>

      <div className="result-v6-actions">
        <button className="primary-button" onClick={primaryAction}>{primaryLabel}</button>
        {result.win && result.canDoubleReward && !result.rewards.doubled && (
          <button className="ad-button" onClick={onDoubleReward}>广告翻倍 · {doubledCoins} 金币</button>
        )}
        {result.rewards.chestOpened && !result.rewards.adChestOpened && (
          <button className="ad-button" onClick={onAdChest}>广告额外宝箱</button>
        )}
        <div className="result-v6-small-actions">
          <button className="text-button" onClick={onHome}>首页</button>
          <button className="text-button" onClick={onLevels}>选关</button>
        </div>
      </div>

      <small className="version-footer">V0708007</small>
    </section>
  );
}
