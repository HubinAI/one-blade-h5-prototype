import { useState, useEffect } from "react";
import { QUALITY_META, type BladeQualityId } from "../game/config/bladeGrowth";

export interface RewardItem {
  label: string;       // blade: "青锋刀" | exp: "绿色经验球 ×2"
  quality: BladeQualityId;
  isBlade: boolean;    // true=blade icon, false=exp ball icon
}

export default function ArmoryRewardModal({ entries, onClose }: { entries: RewardItem[]; onClose: () => void }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (entries.length === 0) { onClose(); return; }
    if (shown >= entries.length) return;
    const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 250 : 140);
    return () => clearTimeout(t);
  }, [shown, entries.length, onClose]);

  if (entries.length === 0) return null;

  return (
    <div className="arm-modal-overlay" onClick={shown >= entries.length ? onClose : undefined}>
      <div className="arm-modal" onClick={e => e.stopPropagation()}>
        <div className="arm-modal-title">恭喜获得</div>
        <div className="arm-reward-grid">
          {entries.map((item, i) => {
            const meta = QUALITY_META[item.quality];
            const visible = i < shown;
            if (!visible) return <div key={i} style={{width:72,height:90}} />;
            return (
              <div key={i} className="arm-reward-card pop-bling"
                style={{borderColor: meta?.color ?? "#888"}}>
                {item.isBlade ? (
                  <div className="arm-rw-icon" style={{color: meta?.color}}>⚔</div>
                ) : (
                  <div className="arm-rw-ball" style={{background: meta?.color}} />
                )}
                <div className="arm-rw-q" style={{color: meta?.color}}>{meta?.displayName}</div>
                <div className="arm-rw-label">{item.label}</div>
              </div>
            );
          })}
        </div>
        {shown >= entries.length && (
          <button className="arm-modal-close" onClick={onClose}>确定</button>
        )}
      </div>
    </div>
  );
}
