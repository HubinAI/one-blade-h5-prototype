import type { LevelConfig } from "../game/types";

type LevelSelectProps = {
  levels: LevelConfig[];
  unlockedIds: Set<number>;
  onBack: () => void;
  onSelect: (level: LevelConfig) => void;
};

export function LevelSelect({ levels, unlockedIds, onBack, onSelect }: LevelSelectProps) {
  return (
    <section className="screen level-screen">
      <header className="screen-header">
        <button className="icon-button" onClick={onBack} aria-label="返回">
          ←
        </button>
        <div>
          <h2>主线关卡</h2>
          <p>十关最小可玩流程</p>
        </div>
      </header>

      <div className="level-list">
        {levels.map((level) => {
          const unlocked = unlockedIds.has(level.id);
          return (
            <button
              className={`level-card ${unlocked ? "" : "locked"}`}
              key={level.id}
              onClick={() => unlocked && onSelect(level)}
              disabled={!unlocked}
            >
              <span className="level-index">{level.id}</span>
              <span className="level-copy">
                <strong>{level.title}</strong>
                <small>{level.subtitle}</small>
              </span>
              <span className="level-waves">{level.waves.length} 波</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
