import { LEVELS } from "../data/levels";
import type { HomeSnapshot } from "../game/services/ProgressionService";
import { getMiniRadarData, getRouteName } from "../game/services/SkillTracker";
import { ROUTE_COLORS } from "../game/config/buffs";
import type { SkillDimension } from "../game/types";

type MainMenuProps = {
  unlockedLevel: number;
  home: HomeSnapshot;
  onStart: () => void;
  onContinue: () => void;
  onLevels: () => void;
  onDailyChallenge: () => void;
  onHighYieldChallenge: () => void;
  onFreeBurst: () => void;
  onUpgrades: () => void;
  onRestoreStamina: () => void;
  onClaimOffline: () => void;
  onClaimOfflineDouble: () => void;
  onCodex: () => void;
};

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
  const r = 30;
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
    <div className="mini-radar-badge">
      <svg viewBox="0 0 100 100" className="mini-radar-badge-svg">
        {dims.map((dim) => {
          const end = polarToXY(dim, 100);
          return <line key={dim} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="rgba(246,231,189,0.12)" strokeWidth="0.5" />;
        })}
        <path d={pathD} fill="rgba(240,195,107,0.14)" stroke="#ffd35a" strokeWidth="1.2" />
        {dims.map((dim) => {
          const p = polarToXY(dim, radarData.scores[dim]);
          return <circle key={dim} cx={p.x} cy={p.y} r="2.5" fill={DIMENSION_META[dim].color} />;
        })}
      </svg>
      <div className="mini-radar-badge-scores">
        {dims.map((dim) => (
          <span key={dim} style={{ color: DIMENSION_META[dim].color }}>
            {DIMENSION_META[dim].label} {radarData.scores[dim]}
          </span>
        ))}
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
  onFreeBurst,
  onUpgrades,
  onRestoreStamina,
  onClaimOffline,
  onClaimOfflineDouble,
  onCodex
}: MainMenuProps) {
  const isFirstPlay = unlockedLevel <= 1 && home.coins === 0;
  const currentLevel = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, unlockedLevel - 1))];
  const radarData = getMiniRadarData();
  const hasRadar = !isFirstPlay && radarData.hasHistory;
  const hasOffline = home.offlineCoins > 0;
  const lowStamina = home.stamina < 5;

  return (
    <section className="screen menu-screen menu-screen-v6">
      <div className="menu-v6-top">
        <div className="menu-v6-currency">
          <span className="currency-pill">
            <span className="currency-icon coin-icon" />
            {home.coins}
          </span>
          <span className="currency-pill stamina">
            <span className="currency-icon bun-icon" />
            {home.stamina}/{home.staminaMax}
          </span>
        </div>
        {hasRadar && <MiniRadar />}
      </div>

      <div className="menu-v6-hero">
        <h1>我只要一刀</h1>
        <p>刀势越满，一刀越爽</p>
      </div>

      <div className="menu-v6-center">
        <div className="challenge-card">
          <span className="challenge-card-tag">当前挑战</span>
          <h2>{isFirstPlay ? "第一关" : `第 ${unlockedLevel} 关`}</h2>
          <p>{currentLevel.title}</p>
          <button className="challenge-card-button" onClick={isFirstPlay ? onStart : onContinue}>
            {isFirstPlay ? "开始挑战" : "继续挑战"}
          </button>
          {home.freeBurstAvailable && (
            <button className="challenge-card-hint free-burst" onClick={onFreeBurst}>
              🔥 今日满势可用 ×1（不耗粮）
            </button>
          )}
          {lowStamina && (
            <button className="challenge-card-hint" onClick={onRestoreStamina}>
              军粮不足，看广告恢复 10 点
            </button>
          )}
        </div>

        {hasOffline && (
          <div className="offline-line">
            <span>离线收益 {home.offlineCoins} 金币</span>
            <button onClick={onClaimOffline}>领取</button>
            <button onClick={onClaimOfflineDouble}>x2</button>
          </div>
        )}
      </div>

      <div className="menu-v6-footer">
        <button className="footer-icon" onClick={onLevels}>
          <span className="footer-icon-symbol">🏆</span>
          <span>排行</span>
        </button>
        <button className="footer-icon" onClick={onUpgrades}>
          <span className="footer-icon-symbol">⚔</span>
          <span>升级</span>
        </button>
        <button className="footer-icon" onClick={onDailyChallenge}>
          <span className="footer-icon-symbol">☀</span>
          <span>每日</span>
        </button>
        <button className="footer-icon" onClick={onHighYieldChallenge}>
          <span className="footer-icon-symbol">★</span>
          <span>高收益</span>
        </button>
        <button className="footer-icon" onClick={onCodex}>
          <span className="footer-icon-symbol">📖</span>
          <span>图鉴</span>
        </button>
      </div>

      <small className="version-footer">V0709010</small>
    </section>
  );
}
