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

  // 4个方向角度：上(势)、右(斩)、下(破)、左(守)
  const angles: Record<SkillDimension, number> = {
    momentum: -90,
    precision: 0,
    shatter: 90,
    guard: 180
  };

  function polarToXY(dim: SkillDimension, value: number) {
    const angleRad = (angles[dim] * Math.PI) / 180;
    const dist = (value / 100) * r;
    return {
      x: cx + dist * Math.cos(angleRad),
      y: cy + dist * Math.sin(angleRad)
    };
  }

  const points = dims.map((dim) => polarToXY(dim, scores[dim]));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";

  return (
    <div className="skill-radar-container">
      <svg viewBox="0 0 100 100" className="skill-radar-svg">
        {/* 背景网格 */}
        {[25, 50, 75, 100].map((level) => {
          const gridPoints = dims.map((dim) => polarToXY(dim, level));
          const gridPath = gridPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";
          return <path key={level} d={gridPath} fill="none" stroke="rgba(246,231,189,0.12)" strokeWidth="0.5" />;
        })}
        {/* 轴线 */}
        {dims.map((dim) => {
          const end = polarToXY(dim, 100);
          return <line key={dim} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="rgba(246,231,189,0.18)" strokeWidth="0.4" />;
        })}
        {/* 数据区域 */}
        <path d={pathD} fill="rgba(240,195,107,0.18)" stroke="#ffd35a" strokeWidth="1.2" />
        {/* 数据点 */}
        {dims.map((dim) => {
          const p = polarToXY(dim, scores[dim]);
          const meta = DIMENSION_META[dim];
          return (
            <g key={dim}>
              <circle cx={p.x} cy={p.y} r="2.5" fill={meta.color} stroke="#fff" strokeWidth="0.6" />
              {/* 标签 */}
              <text
                x={cx + ((angles[dim] === 0 ? 1 : angles[dim] === 180 ? -1 : 0) * (r + 12))}
                y={cy + ((angles[dim] === -90 ? -1 : angles[dim] === 90 ? 1 : 0) * (r + 10))}
                textAnchor="middle"
                fill={meta.color}
                fontSize="7"
                fontWeight="800"
              >
                {meta.label} {scores[dim]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="skill-radar-labels">
        {dims.map((dim) => {
          const meta = DIMENSION_META[dim];
          return (
            <span key={dim} className="skill-radar-score" style={{ color: meta.color }}>
              {meta.label} <b>{scores[dim]}</b>
            </span>
          );
        })}
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

  // 找出主路线（选择最多的路线）
  const routeCounts: Record<string, number> = {};
  for (const route of result.selectedRoutes) {
    routeCounts[route] = (routeCounts[route] ?? 0) + 1;
  }
  const mainRoute = (Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]) as keyof typeof ROUTE_NAMES | undefined;

  return (
    <section className="screen result-screen result-screen-v5">
      <span className="version-tag">我只要一刀 V0708005</span>

      <div className="result-header">
        <div className={`result-medal ${result.win ? "win" : "lost"} ${result.win && result.rating !== "C" ? "medal-pop" : ""}`}>{result.rating}</div>
        {result.win && result.rating !== "C" && <div className="medal-glow-ring" />}
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

      {/* 技能雷达 */}
      <SkillRadar scores={result.skillScores} />

      {/* 主路线标识 */}
      {mainRoute && (
        <div className="result-route-badge" style={{ borderColor: ROUTE_COLORS[mainRoute], color: ROUTE_COLORS[mainRoute] }}>
          主路线：{ROUTE_NAMES[mainRoute]}
        </div>
      )}

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
