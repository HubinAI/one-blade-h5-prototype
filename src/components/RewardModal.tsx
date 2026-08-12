import { useState, useEffect } from "react";
import { QUALITY_META, type BladeQualityId } from "../game/config/bladeGrowth";

export interface RewardEntry { quality: string; label: string; isBlade: boolean; }

export default function RewardModal({ entries, onClose }: { entries: RewardEntry[]; onClose: () => void }) {
  const [shown, setShown] = useState(0);
  const MAX_SEQ = 20;

  useEffect(() => { if (entries.length === 0) onClose(); }, [entries.length, onClose]);
  useEffect(() => {
    if (shown >= entries.length) return;
    if (shown >= MAX_SEQ) { setShown(entries.length); return; }
    const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 250 : 100);
    return () => clearTimeout(t);
  }, [shown, entries.length]);

  if (entries.length === 0) return null;
  const allShown = shown >= entries.length;

  return (
    <div className="arm-modal-overlay" onClick={allShown ? onClose : undefined}>
      <div className="arm-modal" onClick={e => e.stopPropagation()}>
        <div className="arm-modal-title">恭喜获得</div>
        <div className="arm-reward-grid">
          {entries.slice(0, shown).map((item, i) => {
            const qc = QUALITY_META[item.quality as BladeQualityId]?.color ?? "#888";
            const isNew = i >= shown - (shown <= MAX_SEQ ? 1 : entries.length - (MAX_SEQ - 1));
            return (
              <div key={i} className={`arm-rw-card${isNew ? " pop-bling" : ""}`} style={{ borderColor: qc }}>
                {item.isBlade ? (
                  <span className="arm-rw-blade" style={{ color: qc }}>⚔</span>
                ) : (
                  <div className="arm-rw-exp" style={{ borderColor: qc }}><span style={{ color: qc, fontSize: 9, fontWeight: 900 }}>EXP</span></div>
                )}
              </div>
            );
          })}
        </div>
        {allShown && <button className="arm-modal-close" onClick={onClose}>确定</button>}
      </div>
    </div>
  );
}

/** expand quality→count into flat RewardEntry[] */
export function expandIdleRewards(items: { quality: string; count: number }[]): RewardEntry[] {
  const out: RewardEntry[] = [];
  for (const it of items) {
    const meta = QUALITY_META[it.quality as BladeQualityId];
    const name = meta?.bladeName ?? it.quality;
    for (let i = 0; i < it.count; i++) {
      out.push({ quality: it.quality, label: name, isBlade: true });
    }
  }
  return out;
}
