import { useState, useEffect, useCallback } from "react";
import { getIdleSnapshot, claimIdleReward, debugSimulateIdleHours, debugResetIdle, isIdleUnlocked } from "../game/idle/IdleService";
import { QUALITY_META, type BladeQualityId } from "../game/config/bladeGrowth";
import RewardModal, { expandIdleRewards } from "./RewardModal";
import type { RewardEntry } from "./RewardModal";

export default function IdlePopup({ onClose, debug }: { onClose: () => void; debug?: boolean }) {
  const [tick, setTick] = useState(0);
  const rf = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => { const i = setInterval(rf, 1000); return () => clearInterval(i); }, [rf]);
  const snap = getIdleSnapshot();
  const perDay = snap.dropPerHour * 24;
  const [failMsg, setFailMsg] = useState<string | null>(null);
  const [rewardEntries, setRewardEntries] = useState<RewardEntry[] | null>(null);

  const claim = () => {
    const r = claimIdleReward();
    if (r.ok && r.items && r.items.length > 0) {
      setRewardEntries(expandIdleRewards(r.items));
    } else if (r.reason) {
      setFailMsg(r.reason);
      setTimeout(() => setFailMsg(null), 1500);
    }
    rf();
  };

  const floorNodes = [1, 2, 3, 4, 5].map(n => {
    if (n < snap.currentFloor) return { num: n, state: "passed" as const };
    if (n === snap.currentFloor) return { num: n, state: "current" as const };
    return { num: n, state: "future" as const };
  });

  // V0811065: 预览读取真实pools, 不再硬编码白色
  const pools = snap.pools.length > 0 ? snap.pools : [{ quality: "white", weight: 100 }];

  return (
    <div className="ip-overlay" onClick={onClose}>
      <div className="ip-panel" onClick={e => e.stopPropagation()}>
        <div className="ip-title">挂机奖励</div>
        <div className="ip-nodes">
          <div className="ip-node-bar">
            {floorNodes.map(({ num, state }) => (
              <div key={num} className={`ip-node ${state}`}>
                <div className="ip-node-dot" /><span>{num}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="ip-efficiency">
          <span className="ip-eff-left">
            {pools.map((p, i) => {
              const qc = QUALITY_META[p.quality as BladeQualityId]?.color ?? "#d0d0d0";
              return <span key={i} style={{ marginRight: 4 }}>
                <span className="ip-eff-icon" style={{ background: qc, display: "inline-block", width: 10, height: 10, borderRadius: 2, verticalAlign: "middle", marginRight: 2 }} />
                {p.quality as string} {p.weight}%
              </span>;
            })}
          </span>
          <span className="ip-eff-right">{perDay}把/天</span>
        </div>
        <div className="ip-bonus">挂机加成：0%</div>
        <div className="ip-drops">
          <div className="ip-drops-title">掉落道具</div>
          <div className="ip-drops-grid">
            {snap.pendingBladeCount > 0 ? (
              <div className="ip-drop-item">
                {pools.map((p, i) => {
                  const qc = QUALITY_META[p.quality as BladeQualityId]?.color ?? "#d0d0d0";
                  return <span key={i} style={{ marginRight: 6 }}>
                    <span className="ip-drop-icon" style={{ background: qc, display: "inline-block", width: 12, height: 12, borderRadius: 2, verticalAlign: "middle", marginRight: 2 }} />
                    {p.quality as string}
                  </span>;
                })}
                <span style={{ marginLeft: 8 }}>×{snap.pendingBladeCount}</span>
              </div>
            ) : (<div className="ip-drop-empty">暂无累计掉落</div>)}
          </div>
        </div>
        <div className="ip-time-section">
          <div className="ip-time-label">挂机时间</div>
          <div className="ip-time-value">{snap.timeStr} / 24:00:00</div>
          <div className="ip-time-bar-outer"><div className="ip-time-bar-inner" style={{ width: `${snap.progressRatio}%` }} /></div>
          <button className="ip-fast-btn" onClick={() => { if (!snap.fastIdleEnabled) setFailMsg("快速挂机暂未开放\n后续观看广告可获得120分钟挂机收益"); }}>
            {snap.fastIdleEnabled ? `快速挂机：${snap.fastIdleUsed}/${snap.fastIdleLimit}` : `快速挂机 ▸ 暂未开放`}
          </button>
          <button className="ip-claim-btn" disabled={snap.pendingBladeCount <= 0} onClick={claim}>
            {snap.pendingBladeCount > 0 ? "收获奖励" : "暂无挂机奖励"}
          </button>
        </div>
      </div>
      {debug && (
        <div className="ip-debug-outside">
          <button onClick={() => { if(!isIdleUnlocked()){setFailMsg("挂机未解锁");return;} debugSimulateIdleHours(1); rf(); }}>+1h</button>
          <button onClick={() => { if(!isIdleUnlocked()){setFailMsg("挂机未解锁");return;} debugSimulateIdleHours(8); rf(); }}>+8h</button>
          <button onClick={() => { if(!isIdleUnlocked()){setFailMsg("挂机未解锁");return;} debugSimulateIdleHours(24); rf(); }}>+24h</button>
          <button onClick={() => { debugResetIdle(); rf(); }}>重置</button>
        </div>
      )}
      {rewardEntries !== null && (
        <RewardModal entries={rewardEntries} onClose={() => { setRewardEntries(null); rf(); }} />
      )}
      {failMsg && (
        <div className="ip-reward-toast" style={{ maxWidth: 260 }}><span style={{ whiteSpace: "pre-line", textAlign: "center" }}>{failMsg}</span></div>
      )}
    </div>
  );
}
