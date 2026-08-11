import { useState, useEffect, useCallback } from "react";
import { getIdleSnapshot, claimIdleReward, debugSimulateIdleHours, debugResetIdle } from "../game/idle/IdleService";

export default function IdlePopup({ onClose, debug }: { onClose: () => void; debug?: boolean }) {
  const [tick, setTick] = useState(0);
  const rf = useCallback(() => setTick(t => t + 1), []);

  // Real-time refresh every 1s
  useEffect(() => { const i = setInterval(rf, 1000); return () => clearInterval(i); }, [rf]);

  const snap = getIdleSnapshot();
  const perDay = snap.dropPerHour * 24;

  const [rewardCount, setRewardCount] = useState<number | null>(null);

  const claim = () => {
    const r = claimIdleReward();
    if (r.ok && r.count) {
      setRewardCount(r.count);
      setTimeout(() => { setRewardCount(null); onClose(); }, 1200);
    }
    rf();
  };

  // Floor nodes: 1~5, passed/current/future
  const floorNodes = [1, 2, 3, 4, 5].map(n => {
    if (n < snap.currentFloor) return { num: n, state: "passed" as const };
    if (n === snap.currentFloor) return { num: n, state: "current" as const };
    return { num: n, state: "future" as const };
  });

  return (
    <div className="ip-overlay" onClick={onClose}>
      <div className="ip-panel" onClick={e => e.stopPropagation()}>
        <div className="ip-title">挂机奖励</div>

        {/* Floor progress */}
        <div className="ip-nodes">
          <div className="ip-node-bar">
            {floorNodes.map(({ num, state }) => (
              <div key={num} className={`ip-node ${state}`}>
                <div className="ip-node-dot" />
                <span>{num}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ip-efficiency">
          <span className="ip-eff-left"><span className="ip-eff-icon" style={{ background: "#d0d0d0" }} /> 白色刀胚</span>
          <span className="ip-eff-right">{perDay}把/天</span>
        </div>
        <div className="ip-bonus">挂机加成：0%</div>

        <div className="ip-drops">
          <div className="ip-drops-title">掉落道具</div>
          <div className="ip-drops-grid">
            {snap.pendingBladeCount > 0 ? (
              <div className="ip-drop-item">
                <div className="ip-drop-icon" style={{ background: "#d0d0d0" }} />
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
            <div className="ip-time-bar-inner" style={{ width: `${snap.progressRatio}%` }} />
          </div>
          <button className="ip-fast-btn" onClick={() => { }}>{snap.fastIdleEnabled ? `快速挂机：${snap.fastIdleUsed}/${snap.fastIdleLimit}` : `快速挂机 ▸ 暂未开放`}</button>
          <button className="ip-claim-btn" disabled={snap.pendingBladeCount <= 0} onClick={claim}>
            {snap.pendingBladeCount > 0 ? "收获奖励" : "暂无挂机奖励"}
          </button>
        </div>
      </div>

      {/* Debug outside */}
      {debug && (
        <div className="ip-debug-outside">
          <button onClick={() => { debugSimulateIdleHours(1); rf(); }}>+1h</button>
          <button onClick={() => { debugSimulateIdleHours(8); rf(); }}>+8h</button>
          <button onClick={() => { debugSimulateIdleHours(24); rf(); }}>+24h</button>
          <button onClick={() => { debugResetIdle(); rf(); }}>重置</button>
        </div>
      )}

      {/* Claim reward toast */}
      {rewardCount !== null && (
        <div className="ip-reward-toast">
          <div className="ip-reward-toast-icon" style={{ background: "#d0d0d0" }} />
          <span>收获奖励  白色刀胚 ×{rewardCount}</span>
        </div>
      )}
    </div>
  );
}
