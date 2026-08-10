import { useState, useEffect } from "react";
import { getIdleInfo, claimIdleRewards, debugIdleAddHours, debugIdleClear } from "../game/services/ProgressionService";

const PER_HOUR = 2;

export default function IdlePopup({ onClose, debug }: { onClose: () => void; debug?: boolean }) {
  const [tick, setTick] = useState(0);
  const rf = () => setTick(t => t + 1);

  const info = getIdleInfo();
  const nodes = [1, 2, 3, 4, 5];

  const claim = () => {
    const n = claimIdleRewards();
    if (n > 0) rf();
  };

  return (
    <div className="ip-overlay" onClick={onClose}>
      <div className="ip-panel" onClick={e => e.stopPropagation()}>
        <div className="ip-title">挂机奖励</div>

        <div className="ip-nodes">
          <div className="ip-node-bar">
            {nodes.map(n => (
              <div key={n} className={`ip-node ${info.accumulatedSeconds > 0 ? "active" : ""}`}>
                <div className="ip-node-dot" />
                <span>{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ip-efficiency">
          <span className="ip-eff-left"><span className="ip-eff-icon" style={{background:"#ccc"}} /> 白色刀胚</span>
          <span className="ip-eff-right">{PER_HOUR}把/小时</span>
        </div>
        <div className="ip-bonus">挂机加成：0%</div>

        <div className="ip-drops">
          <div className="ip-drops-title">掉落道具</div>
          <div className="ip-drops-grid">
            {info.bladeCount > 0 ? (
              <div className="ip-drop-item">
                <div className="ip-drop-icon" style={{background:"#ccc"}} />
                <span>白色刀胚 ×{info.bladeCount}</span>
              </div>
            ) : (
              <div className="ip-drop-empty">暂无累计掉落</div>
            )}
          </div>
        </div>

        <div className="ip-time-section">
          <div className="ip-time-label">挂机时间</div>
          <div className="ip-time-value">{info.timeStr} / 24:00:00</div>
          <div className="ip-time-bar-outer">
            <div className="ip-time-bar-inner" style={{width: `${info.pct}%`}} />
          </div>
          <div className="ip-fast-idle">快速挂机：0/4</div>
          <button className="ip-claim-btn" disabled={info.bladeCount <= 0} onClick={claim}>
            收获奖励
          </button>
        </div>

        {debug && (
          <div className="ip-debug">
            <button onClick={() => { debugIdleAddHours(1); rf(); }}>+1h</button>
            <button onClick={() => { debugIdleAddHours(8); rf(); }}>+8h</button>
            <button onClick={() => { debugIdleAddHours(24); rf(); }}>+24h</button>
            <button onClick={() => { debugIdleClear(); rf(); }}>清零</button>
          </div>
        )}
      </div>
    </div>
  );
}
