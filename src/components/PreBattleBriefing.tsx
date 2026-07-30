import { useEffect, useState } from "react";
import type { BriefingData, LevelConfig } from "../game/types";
import { ROUTE_NAMES, ROUTE_COLORS } from "../game/config/buffs";

type PreBattleBriefingProps = {
  level: LevelConfig;
  onReady: () => void;
};

export function PreBattleBriefing({ level, onReady }: PreBattleBriefingProps) {
  const briefing: BriefingData = level.briefing ?? {
    highlightEnemies: [],
    tacticalHint: "",
    initialBladeTier: "弱刀"
  };

  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    if (countdown <= 0) {
      onReady();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, onReady]);

  const enemyIcons: Record<string, string> = {
    infantry: "▸",
    shield: "◆",
    powder: "▲",
    core: "◇"
  };

  return (
    <section className="screen briefing-screen">
      <div className="briefing-header">
        <span className="briefing-level-tag">第 {level.id} 关</span>
        <h2>{level.title}</h2>
        <p className="briefing-subtitle">{level.subtitle}</p>
      </div>

      <div className="briefing-enemies">
        <span className="briefing-section-label">敌军重点</span>
        {briefing.highlightEnemies.length > 0 ? (
          <div className="briefing-enemy-list">
            {briefing.highlightEnemies.map((e) => (
              <span key={e.kind} className="briefing-enemy-chip" style={{ borderColor: e.kind === "core" ? "#e8d7ff" : e.kind === "powder" ? "#ff6a33" : e.kind === "shield" ? "#9b6dff" : "#f6e7bd" }}>
                <b>{enemyIcons[e.kind] ?? "?"}</b>
                <span>{e.label}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="briefing-enemy-none">常规敌军</span>
        )}
      </div>

      <div className="briefing-tactic">
        <span className="briefing-section-label">战术提示</span>
        <p className="briefing-hint">{briefing.tacticalHint || "蓄势挥刀，一击破阵"}</p>
      </div>

      <div className="briefing-blade-tier">
        <span className="briefing-section-label">初始刀势</span>
        <b className="briefing-tier-label">{briefing.initialBladeTier}</b>
      </div>

      {briefing.tacticalHint.includes("路线") && (
        <div className="briefing-routes">
          {(Object.keys(ROUTE_NAMES) as Array<keyof typeof ROUTE_NAMES>).map((route) => (
            <span key={route} className="briefing-route-chip" style={{ borderColor: ROUTE_COLORS[route], color: ROUTE_COLORS[route] }}>
              {ROUTE_NAMES[route]}
            </span>
          ))}
        </div>
      )}

      <button className="primary-button briefing-enter-btn" onClick={onReady}>
        进入战斗 {countdown > 0 ? `(${countdown})` : ""}
      </button>
    </section>
  );
}
