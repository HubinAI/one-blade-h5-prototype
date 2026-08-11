import { useState, useEffect, useRef } from "react";
import { QUALITY_META, type BladeQualityId } from "../game/config/bladeGrowth";

export interface RewardItem {
  label: string;
  quality: BladeQualityId;
  isBlade: boolean;
}

interface Props { items: RewardItem[]; onClose: () => void; }

export default function ArmoryRewardModal({ items, onClose }: Props) {
  const [visible, setVisible] = useState<boolean[]>(() => items.map(() => false));
  const [allDone, setAllDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(() => {
    if (items.length === 0) { onClose(); return; }
    let i = 0;
    timerRef.current = setInterval(() => {
      setVisible(prev => { const n = [...prev]; if (i < n.length) n[i] = true; return n; });
      i++;
      if (i >= items.length) { clearInterval(timerRef.current!); setTimeout(() => setAllDone(true), 400); }
    }, 160);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length, onClose]);

  if (items.length === 0) return null;

  return (
    <div className="arm-modal-overlay" onClick={allDone ? onClose : undefined}>
      <div className="arm-modal" onClick={e => e.stopPropagation()}>
        <div className="arm-modal-title">恭喜获得</div>
        <div className="arm-modal-items">
          {items.map((item, i) => {
            const meta = QUALITY_META[item.quality];
            return visible[i] ? (
              <div key={i} className="arm-reward-card pop-bling"
                style={{borderColor: meta?.color ?? "#888"}}>
                <div className="arm-reward-q" style={{color: meta?.color}}>{meta?.displayName}</div>
                <div className="arm-reward-name">{item.label}</div>
                {item.isBlade && <div className="arm-reward-icon" style={{color: meta?.color}}>⚔</div>}
              </div>
            ) : null;
          })}
        </div>
        {allDone && (
          <button className="arm-modal-close" onClick={onClose}>确定</button>
        )}
      </div>
    </div>
  );
}
