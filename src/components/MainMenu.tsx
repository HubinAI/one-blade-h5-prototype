import type { HomeSnapshot } from "../game/services/ProgressionService";
import { getMiniRadarData, getRouteName } from "../game/services/SkillTracker";
import { ROUTE_COLORS } from "../game/config/buffs";
import type { SkillDimension, TacticalRoute } from "../game/types";

type MainMenuProps = {
  unlockedLevel: number;
  home: HomeSnapshot;
  onStart: () => void;
  onContinue: () => void;
  onLevels: () => void;
  onDailyChallenge: () => void;
  onHighYieldChallenge: () => void;
  onUpgrades: () => void;
  onRestoreStamina: () => void;
  onClaimOffline: () => void;
  onClaimOfflineDouble: () => void;
};

function percent(value: number, target: number) {
  return `${Math.min(100, Math.round((value / Math.max(1, target)) * 100))}%`;
}

const DIMENSION_META: Record<SkillDimension, { label: string; color: string }> = {
  momentum: { label: "势", color: "#ff6a33" },
  precision: { label: "斩", color: "#ffd35a" },
  shatter: { label: "破", color: "#9b6dff" },
  guard: { label: "守", color: "#5b8db8" }
};

function MiniRadar() {
  const radarData = getMiniRadarData();
  const dims: SkillDimension[] = ["momentum", "precision", "shatter", "guard"];

  const cx = 50;
  const cy = 50;
  const r = 36;

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

  const points = dims.map((dim) => polarToXY(dim, radarData.scores[dim]));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";

  return (
    <div className="mini-radar-container">
      <div className="mini-radar-header">
        <span>武道精进</span>
        {radarData.mainRoute && (
          <b style={{ color: ROUTE_COLORS[radarData.mainRoute] }}>
            {getRouteName(radarData.mainRoute)}
          </b>
        )}
      </div>
      <svg viewBox="0 0 100 100" className="mini-radar-svg">
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
          const p = polarToXY(dim, radarData.scores[dim]);
          const meta = DIMENSION_META[dim];
          return <circle key={dim} cx={p.x} cy={p.y} r="2" fill={meta.color} />;
        })}
      </svg>
      <div className="mini-radar-bars">
        {dims.map((dim) => {
          const meta = DIMENSION_META[dim];
          const score = radarData.scores[dim];
          return (
            <div key={dim} className="mini-radar-bar-row">
              <span style={{ color: meta.color }}>{meta.label}</span>
              <div className="mini-radar-bar-track">
                <div className="mini-radar-bar-fill" style={{ width: `${score}%`, background: meta.color }} />
              </div>
              <b>{score}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MainMenu({
  unlockedLevel,
  home,
  onStart,
  onContinue,
  onLevels,
  onDailyChallenge,
  onHighYieldChallenge,
  onUpgrades,
  onRestoreStamina,
  onClaimOffline,
  onClaimOfflineDouble
}: MainMenuProps) {
  const firstFragment = home.fragments[0];
  const activeTasks = home.dailyTasks.filter((task) => !task.claimed).slice(0, 3);
  const isFirstPlay = unlockedLevel <= 1 && home.coins === 0;

  return (
    <section className="screen menu-screen menu-screen-v4">
      <div className="home-topbar home-topbar-v5">
        <span className="topbar-coin">金币 {home.coins}</span>
        <span className="topbar-stamina">
          军粮 {home.stamina}/{home.staminaMax}
        </span>
      </div>

      <div className="title-block title-block-v4">
        <span className="seal">V0708005</span>
        <h1>我只要一刀</h1>
        <p>随时能砍，但刀势越满越爽</p>
      </div>

      {/* 迷你雷达 */}
      {!isFirstPlay && <MiniRadar />}

      <div className="home-progress-panel home-progress-panel-v5">
        <div className="home-progress-row">
          <span>战功宝箱</span>
          <b>
            {home.chestProgress}/{home.chestTarget}
          </b>
          <i style={{ width: percent(home.chestProgress, home.chestTarget) }} />
        </div>
        {firstFragment && (
          <div className="home-progress-row">
            <span>{firstFragment.unlocked ? `${firstFragment.name} 已解锁` : firstFragment.name}</span>
            <b>
              {firstFragment.count}/{firstFragment.target}
            </b>
            <i style={{ width: percent(firstFragment.count, firstFragment.target) }} />
          </div>
        )}
      </div>

      <button className="daily-challenge-line" onClick={onDailyChallenge}>
        <span>每日挑战</span>
        <strong>{home.dailyChallengeName}</strong>
        <b>进入</b>
      </button>

      {home.offlineCoins > 0 && (
        <div className="offline-card">
          <span>离线收益 {home.offlineCoins} 金币</span>
          <div>
            <button className="text-button" onClick={onClaimOffline}>
              领取
            </button>
            <button className="text-button" onClick={onClaimOfflineDouble}>
              广告 x2
            </button>
          </div>
        </div>
      )}

      <div className="menu-actions">
        <button className="primary-button" onClick={isFirstPlay ? onStart : onContinue}>
          {isFirstPlay ? "开始游戏" : `继续第 ${unlockedLevel} 关`}
        </button>
        <button className="ghost-button" onClick={onHighYieldChallenge}>
          高收益挑战
        </button>
        <button className="ghost-button" onClick={onUpgrades}>
          刀势升级
        </button>
        <button className="ghost-button" onClick={onLevels}>
          选择关卡
        </button>
        {home.stamina < 5 && (
          <button className="ad-button" onClick={onRestoreStamina}>
            军粮不足，看广告恢复 10 点
          </button>
        )}
      </div>

      {activeTasks.length > 0 && (
        <div className="daily-task-strip">
          {activeTasks.map((task) => (
            <span key={task.id}>
              {task.name} {task.progress}/{task.target}
            </span>
          ))}
        </div>
      )}

      <small className="stamina-note">{home.staminaNextText}</small>
    </section>
  );
}
