import { useState, useEffect } from "react";
import { QUALITY_META, type BladeQualityId } from "../game/config/bladeGrowth";

export interface RewardItem {
  label: string; // "青锋刀" or "绿色经验球 ×3"
  quality: BladeQualityId;
  isBlade: boolean;
}

interface Props { items: RewardItem[]; onClose: () => void; }

export default function ArmoryRewardModal({ items, onClose }: Props) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= items.length) return;
    const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 200 : 140);
    return () => clearTimeout(t);
  }, [shown, items.length]);

  // If nothing to show, close immediately
  if (items.length === 0) { onClose(); return null; }

  return (
    <div className="arm-modal-overlay" onClick={onClose}>
      <div className="arm-modal" onClick={e => e.stopPropagation()}>
        <div className="arm-modal-title">恭喜获得</div>
        <div className="arm-modal-items">
          {items.map((item, i) => {
            const meta = QUALITY_META[item.quality];
            const visible = i < shown;
            return (
              <div
                key={i}
                className={`arm-reward-card ${visible ? "pop" : ""}`}
                style={{
                  borderColor: meta?.color ?? "#888",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "scale(1)" : "scale(0.65)",
                }}
              >
                <div className="arm-reward-q" style={{ color: meta?.color }}>{meta?.displayName}</div>
                <div className="arm-reward-name">{item.label}</div>
                {item.isBlade && <div className="arm-reward-icon" style={{ color: meta?.color }}>⚔</div>}
              </div>
            );
          })}
        </div>
        {shown >= items.length && (
          <button className="arm-modal-close" onClick={onClose}>确定</button>
        )}
      </div>
    </div>
  );
}
