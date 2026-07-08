import type { HomeSnapshot } from "../game/services/ProgressionService";
import type { UpgradeId } from "../game/config/rewards";

type UpgradeScreenProps = {
  home: HomeSnapshot;
  onBack: () => void;
  onBuy: (id: UpgradeId) => void;
};

export function UpgradeScreen({ home, onBack, onBuy }: UpgradeScreenProps) {
  return (
    <section className="screen upgrade-screen">
      <header className="screen-header">
        <button className="icon-button" onClick={onBack} aria-label="返回">
          ‹
        </button>
        <div>
          <h2>刀势升级</h2>
          <p>金币 {home.coins}，每级只给小幅成长</p>
        </div>
      </header>

      <div className="upgrade-list">
        {home.upgrades.map((upgrade) => (
          <div className="upgrade-card" key={upgrade.id}>
            <div>
              <strong>{upgrade.name}</strong>
              <span>
                Lv.{upgrade.level}/{upgrade.maxLevel} · {upgrade.description}
              </span>
            </div>
            <button
              className={upgrade.canBuy ? "primary-button mini-button" : "ghost-button mini-button"}
              disabled={!upgrade.canBuy}
              onClick={() => onBuy(upgrade.id)}
            >
              {upgrade.level >= upgrade.maxLevel ? "已满" : `${upgrade.cost} 金币`}
            </button>
          </div>
        ))}
      </div>

      <div className="fragment-panel">
        <strong>碎片解锁</strong>
        {home.fragments.map((fragment) => (
          <div className="fragment-row" key={fragment.name}>
            <span>{fragment.name}</span>
            <b>{fragment.unlocked ? "已解锁" : `${fragment.count}/${fragment.target}`}</b>
            <small>{fragment.effect}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
