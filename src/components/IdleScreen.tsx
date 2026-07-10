import { useState, useEffect } from "react";
import { getHomeSnapshot, claimOfflineReward, type HomeSnapshot } from "../game/services/ProgressionService";
import { QUALITY_META, QUALITY_ORDER } from "../game/config/synthesis";

type IdleScreenProps = {
  onBack: () => void;
};

const STAMINA_DURATION_MS = 24 * 60 * 60 * 1000; // 24小时
const STAMINA_PER_HOUR = 20;
const BLADE_PER_HOUR = 0.5; // 每2小时1把白刀
const EXP_PER_HOUR = 30;
const DAILY_FAST_LIMIT = 4;

export function IdleScreen({ onBack }: IdleScreenProps) {
  const [home, setHome] = useState<HomeSnapshot>(getHomeSnapshot());
  const [showRewardAnim, setShowRewardAnim] = useState(false);
  const [animCount, setAnimCount] = useState(0);

  useEffect(() => {
    setHome(getHomeSnapshot());
  }, []);

  // 计算挂机数据
  const lastSeen = home.lastSeenAt;
  const now = Date.now();
  const idleMs = Math.min(now - lastSeen, STAMINA_DURATION_MS);
  const idleHours = Math.max(0, Math.floor(idleMs / (60 * 60 * 1000)));
  const idleMinutes = Math.floor((idleMs / (60 * 1000)) % 60);
  const progress = idleMs / STAMINA_DURATION_MS;
  const pendingCoins = home.offlineCoins;

  // 关卡进度
  const currentFloor = home.highestFloor;
  const stageNames = [
    "凡境·起", "凡境·承", "凡境·转", "凡境·合",
    "精境·起", "精境·承", "精境·转", "精境·合",
    "玄境·起", "玄境·承", "玄境·转", "玄境·合",
  ];
  const currentStage = currentFloor % 4;
  const currentPhase = Math.floor((currentFloor - 1) / 4) % 3;

  // 每日挂机收益（按当前关卡）
  const dailyCoins = (currentFloor * 20 + 100);
  const dailyExp = EXP_PER_HOUR * 24;
  const dailyBlades = Math.floor(BLADE_PER_HOUR * 24);

  const handleClaim = () => {
    const next = claimOfflineReward(false);
    setHome(next);
    setShowRewardAnim(true);
    setAnimCount(pendingCoins);
    setTimeout(() => setShowRewardAnim(false), 1500);
  };

  const handleFastIdle = () => {
    // 模拟看广告快速挂机1小时
    setShowRewardAnim(true);
    setAnimCount(60);
    setTimeout(() => setShowRewardAnim(false), 1500);
  };

  return (
    <section className="screen idle-screen">
      <div className="idle-header">
        <button className="idle-back" onClick={onBack}>← 返回</button>
        <h1>挂机奖励</h1>
      </div>

      <div className="idle-progress-strip">
        <div className="idle-stage-marker current">
          <span className="idle-stage-num">{currentFloor}</span>
          <span className="idle-stage-label">当前</span>
        </div>
        {Array.from({ length: 6 }).map((_, i) => {
          const next = currentFloor + (i + 1) * 4;
          const isCurrent = i === 1;
          return (
            <div key={i} className={`idle-stage-marker ${isCurrent ? "next" : ""}`}>
              <span className="idle-stage-num">{next}</span>
            </div>
          );
        })}
      </div>

      <div className="idle-section idle-reward">
        <div className="idle-reward-item">
          <span className="idle-reward-icon coin" />
          <span className="idle-reward-text">每日 {dailyCoins} 金币</span>
        </div>
        <div className="idle-reward-divider" />
        <div className="idle-reward-item">
          <span className="idle-reward-icon exp" />
          <span className="idle-reward-text">每日 {dailyExp} 经验</span>
        </div>
      </div>

      <div className="idle-section idle-drops">
        <div className="idle-section-title">掉落道具</div>
        <div className="idle-drops-bonus">挂机加成: 0%</div>
        <div className="idle-drops-grid">
          {QUALITY_ORDER.slice(0, 5).map((q, i) => {
            const meta = QUALITY_META[q];
            const count = i === 0 ? dailyBlades : Math.floor(dailyBlades / 2);
            return (
              <div key={q} className="idle-drop-card" style={{ borderColor: meta.color }}>
                <span className="idle-drop-name" style={{ color: meta.color }}>{meta.namePool[0]}</span>
                <span className="idle-drop-count">×{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="idle-section idle-time">
        <div className="idle-section-title">挂机时间</div>
        <div className="idle-time-text">{Math.floor(idleMs / 3600000)}h {idleMinutes}m / 24h</div>
        <div className="idle-progress-bar">
          <div className="idle-progress-fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      </div>

      <div className="idle-fast-row">
        <span className="idle-fast-icon">📦</span>
        <span className="idle-fast-text">快速挂机: 0 / {DAILY_FAST_LIMIT}</span>
        <button className="idle-fast-btn" onClick={handleFastIdle}>▶</button>
      </div>

      <button className="idle-claim-btn" onClick={handleClaim} disabled={pendingCoins <= 0}>
        收获奖励
      </button>

      {showRewardAnim && (
        <div className="idle-reward-anim">
          <span>+{animCount} 金币</span>
        </div>
      )}
    </section>
  );
}
