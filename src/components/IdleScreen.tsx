import { useState, useEffect } from "react";
import { getHomeSnapshot, claimOfflineReward, useFastIdle, claimFastIdle, type HomeSnapshot } from "../game/services/ProgressionService";
import { QUALITY_META, QUALITY_ORDER } from "../game/config/synthesis";

type IdleScreenProps = {
  onBack: () => void;
};

const STAMINA_DURATION_MS = 24 * 60 * 60 * 1000; // 24小时
const STAMINA_PER_HOUR = 30; // 金币30/h
const BLADE_PER_HOUR = 2;   // 白刀2/h（48把/天）
const EXP_PER_HOUR = 30;
const DAILY_FAST_LIMIT = 4;

export function IdleScreen({ onBack }: IdleScreenProps) {
  const [home, setHome] = useState<HomeSnapshot>(getHomeSnapshot());
  const [showRewardAnim, setShowRewardAnim] = useState(false);
  const [animCount, setAnimCount] = useState(0);
  const [fastIdleRemaining, setFastIdleRemaining] = useState(useFastIdle().remaining);

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
  const dailyCoins = (currentFloor * 50 + 300);
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
    // 看广告快速挂机：4h回报（8把白刀）
    if (!claimFastIdle()) {
      alert("今日快速挂机已达上限（4次）");
      return;
    }
    setFastIdleRemaining(prev => Math.max(0, prev - 1));
    const bladeCount = Math.round(BLADE_PER_HOUR * 4); // 8把白刀
    setShowRewardAnim(true);
    setAnimCount(bladeCount);
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
        <span className="idle-fast-text">快速挂机: {4 - fastIdleRemaining} / {DAILY_FAST_LIMIT} (广告×8白刀)</span>
        <button className="idle-fast-btn" onClick={handleFastIdle} disabled={fastIdleRemaining <= 0}>▶</button>
      </div>

      <button className="idle-claim-btn" onClick={handleClaim} disabled={pendingCoins <= 0}>
        收获奖励
      </button>

      {showRewardAnim && (
        <div className="idle-reward-anim">
          <span>+{animCount} 白刀</span>
        </div>
      )}
    </section>
  );
}
