import { useState } from "react";
import { getIdleSnapshot, claimIdleReward, debugSimulateIdleHours, debugResetIdle } from "../game/idle/IdleService";

export default function IdlePopup({ onClose, debug }: { onClose: () => void; debug?: boolean }) {
  const [tick, setTick] = useState(0);
  const rf = () => setTick(t => t + 1);
  const snap = getIdleSnapshot();
  const nodes = [1, 2, 3, 4, 5];

  const claim = () => {
    const r = claimIdleReward();
    if (r.ok) rf();
  };

  return (
    <div className="ip-overlay" onClick={onClose}>
      <div className="ip-panel" onClick={e => e.stopPropagation()}>
        <div className="ip-title">挂机奖励</div>

        <div className="ip-nodes">
          <div className="ip-node-bar">
            {nodes.map(n => (
              <div key={n} className={`ip-node ${snap.accumulatedSeconds > 0 ? "active" : ""}`}>
                <div className="ip-node-dot" />
                <span>{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ip-efficiency">
          <span className="ip-eff-left"><span className="ip-eff-icon" style={{background:"#d0d0d0"}} /> 白色刀胚</span>
          <span className="ip-eff-right">{snap.dropPerHour}把/小时</span>
        </div>
        <div className="ip-bonus">挂机加成：0%</div>

        <div className="ip-drops">
          <div className="ip-drops-title">掉落道具</div>
          <div className="ip-drops-grid">
            {snap.pendingBladeCount > 0 ? (
              <div className="ip-drop-item">
                <div className="ip-drop-icon" style={{background:"#d0d0d0"}} />
                <span>白色刀胚 ×{snap.pendingBladeCount}</span>
              </div>
            ) : (
              <div className="ip-drop-empty">暂无累计掉落</div>
            )}
          </div>
        </div>

        <div className="ip-time-section">
          <div className="ip-time-label">挂机时间</div>
          <div className="ip-time-value">{snap.timeStr} / 24:00:00</div>
          <div className="ip-time-bar-outer">
            <div className="ip-time-bar-inner" style={{width: `${snap.progressRatio}%`}} />
          </div>
          <div className="ip-fast-idle">快速挂机：0/4</div>
          <button className="ip-claim-btn" disabled={snap.pendingBladeCount <= 0} onClick={claim}>
            收获奖励
          </button>
        </div>

        {debug && (
          <div className="ip-debug">
            <button onClick={() => { debugSimulateIdleHours(1); rf(); }}>+1h</button>
            <button onClick={() => { debugSimulateIdleHours(8); rf(); }}>+8h</button>
            <button onClick={() => { debugSimulateIdleHours(24); rf(); }}>+24h</button>
            <button onClick={() => { debugResetIdle(); rf(); }}>清零</button>
          </div>
        )}
      </div>
    </div>
  );
}
