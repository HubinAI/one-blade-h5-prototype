import { useState, useEffect } from "react";
import { readProgress, writeProgress } from "../game/services/ProgressionService";
import { getBladeQualityConfig } from "../game/config/bladeGrowth";

function createBladeInstance(quality: string) {
  // reuse the same counter pattern from ProgressionService
  const p = readProgress();
  const id = `idle_b_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const cfg = getBladeQualityConfig(quality as any);
  return { id, name: cfg?.bladeName ?? "凡铁刀胚", quality: quality as any, level: 1, exp: 0, affix: null, locked: false };
}

export default function IdlePopup({ onClose, debug }: { onClose: () => void; debug?: boolean }) {
  const [tick, setTick] = useState(0);
  const rf = () => setTick(t => t + 1);

  // idle state (simple time-based accumulation)
  const p = readProgress();
  const idleSec = Math.min(((p as any)._idleSeconds ?? 0), 86400); // capped at 24h
  const perHour = 2; // 2 white blades per hour (config later)
  const accumulated = Math.floor((idleSec / 3600) * perHour);

  // 1-5 nodes
  const nodes = [1, 2, 3, 4, 5];
  const currentFloor = p.highestFloor;
  const hr = Math.floor(idleSec / 3600);
  const min = Math.floor((idleSec % 3600) / 60);
  const sec = Math.floor(idleSec % 60);
  const timeStr = `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  const pct = Math.min(100, Math.round((idleSec / 86400) * 100));

  const claim = () => {
    if (accumulated <= 0) return;
    for (let i = 0; i < accumulated; i++) {
      p.blades.push(createBladeInstance("white"));
    }
    (p as any)._idleSeconds = 0;
    writeProgress(p);
    rf();
  };

  const addTime = (hours: number) => {
    (p as any)._idleSeconds = ((p as any)._idleSeconds ?? 0) + hours * 3600;
    writeProgress(p);
    rf();
  };

  return (
    <div className="ip-overlay" onClick={onClose}>
      <div className="ip-panel" onClick={e => e.stopPropagation()}>
        {/* Zone 1: Title */}
        <div className="ip-title">挂机奖励</div>

        {/* Zone 2: Progress nodes */}
        <div className="ip-nodes">
          <div className="ip-node-bar">
            {nodes.map(n => (
              <div key={n} className={`ip-node ${currentFloor >= n ? "active" : ""}`}>
                <div className="ip-node-dot" />
                <span>{n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Zone 3: Efficiency */}
        <div className="ip-efficiency">
          <span className="ip-eff-left">
            <span className="ip-eff-icon">⚪</span> 白色刀胚
          </span>
          <span className="ip-eff-right">{perHour}把/小时</span>
        </div>
        <div className="ip-bonus">挂机加成：0%</div>

        {/* Zone 4: Drop preview */}
        <div className="ip-drops">
          <div className="ip-drops-title">掉落道具</div>
          <div className="ip-drops-grid">
            {accumulated > 0 ? (
              <div className="ip-drop-item">
                <div className="ip-drop-icon">⚪</div>
                <span>白色刀胚 ×{accumulated}</span>
              </div>
            ) : (
              <div className="ip-drop-empty">暂无累计掉落</div>
            )}
          </div>
        </div>

        {/* Zone 5: Time + Claim */}
        <div className="ip-time-section">
          <div className="ip-time-label">挂机时间</div>
          <div className="ip-time-value">{timeStr} / 24:00:00</div>
          <div className="ip-time-bar-outer">
            <div className="ip-time-bar-inner" style={{width: `${pct}%`}} />
          </div>
          <div className="ip-fast-idle">快速挂机：0/4</div>
          <button className="ip-claim-btn" disabled={accumulated <= 0} onClick={claim}>
            收获奖励
          </button>
        </div>

        {/* Debug */}
        {debug && (
          <div className="ip-debug">
            <button onClick={() => addTime(1)}>+1h</button>
            <button onClick={() => addTime(8)}>+8h</button>
            <button onClick={() => addTime(24)}>+24h</button>
            <button onClick={() => { (p as any)._idleSeconds = 0; writeProgress(p); rf(); }}>清零</button>
          </div>
        )}
      </div>
    </div>
  );
}
