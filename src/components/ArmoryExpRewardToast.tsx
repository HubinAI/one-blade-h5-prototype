import { useEffect, useState } from "react";
import { QUALITY_META, type BladeQualityId } from "../game/config/bladeGrowth";

interface ExpReward { quality: BladeQualityId; count: number; }

interface Props { rewards: ExpReward[]; onDone: () => void; }

export default function ArmoryExpRewardToast({ rewards, onDone }: Props) {
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setOpacity(0), 1000);
    const t2 = setTimeout(onDone, 1600);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [onDone]);

  if (rewards.length === 0) { onDone(); return null; }

  return (
    <div className="aet-root" style={{opacity, transition: "opacity 0.4s"}}>
      {rewards.map((r, i) => {
        const meta = QUALITY_META[r.quality];
        return (
          <div key={i} className="aet-item pop-bling-fast" style={{borderColor: meta?.color ?? "#888"}}>
            <div className="aet-dot" style={{background: meta?.color}} />
            <span className="aet-text">×{r.count}</span>
          </div>
        );
      })}
    </div>
  );
}
