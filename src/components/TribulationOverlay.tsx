import React, { useEffect, useState } from "react";
import type { BossPhaseState } from "../game/types";
import "../styles/tribulation.css";

interface Props { bossPhase: BossPhaseState | null; }

export const TribulationOverlay: React.FC<Props> = ({ bossPhase }) => {
  // Fix 7: 延迟"突破成功"文字 1.1s
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    if (bossPhase === "breakthrough_show") {
      setShowText(false);
      const timer = setTimeout(() => setShowText(true), 1100);
      return () => clearTimeout(timer);
    } else {
      setShowText(false);
    }
  }, [bossPhase]);

  return (
    <div className="tribulation-overlay">
      {(bossPhase === "tribulation_intro" || bossPhase === "tribulation") && (
        <div className="tribulation-clouds active" />
      )}
      {bossPhase === "breakthrough_show" && showText && (
        <div className="breakthrough-text show">突破成功</div>
      )}
    </div>
  );
};