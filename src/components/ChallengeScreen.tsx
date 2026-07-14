import type { RankId } from "../game/config/synthesis";
import { RANK_ORDER, RANK_CONFIG } from "../game/config/synthesis";
import { getCurrentRankId, getAvailableRankIndex } from "../game/services/ProgressionService";

type ChallengeScreenProps = {
  highestFloor: number;
  rankIndex: number;
  onBack: () => void;
  onChallenge: (rankId: RankId) => void;
};

const BOSS_NAMES: Record<string, string> = {
  yaoWang: "练气大妖", moXiu: "筑基魔修", huaYao: "灵月圣女"
};

export function ChallengeScreen({ highestFloor, rankIndex, onBack, onChallenge }: ChallengeScreenProps) {
  const availableRankIdx = getAvailableRankIndex(highestFloor);
  const nextIdx = Math.min(availableRankIdx, RANK_ORDER.length - 1);
  const prevIdx = Math.max(0, nextIdx - 1);

  // 三段式：上=已突破（次级），中=可挑战（当前），下=下一段（未解锁）
  const stages: Array<{ idx: number; state: "prev" | "current" | "next" }> = [
    { idx: prevIdx, state: "prev" },
    { idx: nextIdx, state: "current" },
    { idx: Math.min(nextIdx + 1, RANK_ORDER.length - 1), state: "next" },
  ];

  return (
    <section className="screen challenge-screen challenge-v2">
      <div className="challenge-header">
        <button className="challenge-back" onClick={onBack}>×</button>
        <h1>通往天神</h1>
        <button className="challenge-confirm">↘</button>
      </div>

      <div className="challenge-stages">
        {stages.map((s, i) => {
          const rankId = RANK_ORDER[s.idx];
          if (!rankId) return null;
          const rank = RANK_CONFIG[rankId];
          if (!rank) return null;
          return (
            <div key={i} className={`challenge-stage stage-${s.state}`}>
              <div className="challenge-stage-figure">
                <span className="challenge-figure-glow" />
                <span className="challenge-figure-icon">
                  {s.state === "next" ? "✦" : s.state === "current" ? "⚔" : "✓"}
                </span>
              </div>
              <div className="challenge-stage-info">
                <h3>{rank.name}</h3>
                <p>Boss: {BOSS_NAMES[rank.bossId] ?? "?"}</p>
                {s.state === "current" && (
                  <button
                    className="challenge-stage-btn"
                    onClick={() => onChallenge(rankId)}
                  >挑战</button>
                )}
                {s.state === "next" && (
                  <p className="challenge-stage-locked">需通过{rank.name}后解锁</p>
                )}
                {s.state === "prev" && (
                  <span className="challenge-stage-broken">已突破</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
