import React from "react";
import type { BossPhaseState } from "../game/types";
import "../styles/tribulation.css";

interface Props { bossPhase: BossPhaseState | null; }

export const TribulationOverlay: React.FC<Props> = ({ bossPhase }) => {
  return (
    <div className="tribulation-overlay">
      {(bossPhase === "tribulation_intro" || bossPhase === "tribulation") && (
        <div className="tribulation-clouds active" />
      )}
      {bossPhase === "breakthrough_show" && (
        <div className="breakthrough-text show">突破成功</div>
      )}
    </div>
  );
};
