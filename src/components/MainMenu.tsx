import { useState } from "react";
import type { HomeSnapshot } from "../game/services/ProgressionService";

type MainMenuProps = {
  unlockedLevel: number;
  home: HomeSnapshot;
  onStart: () => void;
  onContinue: () => void;
  onRestoreStamina: () => void;
  onCodex: () => void;
  onForge: () => void;
  onRanking: () => void;
  onIdle: () => void;
  onChallenge: () => void;
  onBag: () => void;
  onDebug: () => void;
  appVersion: string;
};

function CurrencyModal({ title, items, onClose }: { title: string; items: Array<{ title: string; desc: string; amount: string }>; onClose: () => void }) {
  return (
    <div className="currency-modal-overlay" onClick={onClose}>
      <div className="currency-modal" onClick={(e) => e.stopPropagation()}>
        <div className="currency-modal-title">{title}</div>
        <div className="currency-modal-list">
          {items.map((item, i) => (
            <div key={i} className="currency-modal-item">
              <div className="currency-modal-item-title">{item.title}</div>
              <div className="currency-modal-item-desc">{item.desc}</div>
              <div className="currency-modal-item-amount">{item.amount}</div>
            </div>
          ))}
        </div>
        <button className="currency-modal-close" onClick={onClose}>知道了</button>
      </div>
    </div>
  );
}

export function MainMenu({
  unlockedLevel,
  home,
  onStart,
  onContinue,
  onRestoreStamina,
  onCodex,
  onRanking,
  onIdle,
  onChallenge,
  onBag,
  onDebug,
  appVersion,
}: MainMenuProps) {
  const isFirstPlay = unlockedLevel <= 1 && home.coins === 0;
  const [showCoinModal, setShowCoinModal] = useState(false);
  const [showStaminaModal, setShowStaminaModal] = useState(false);

  return (
    <section className="screen menu-screen menu-screen-v7">
      <div className="menu-v7-top">
        <button className="currency-pill" onClick={() => setShowCoinModal(true)}>
          <span className="currency-icon coin-icon" />
          {home.coins}
          <span className="currency-plus">+</span>
        </button>
        <button className="currency-pill stamina" onClick={() => setShowStaminaModal(true)}>
          <span className="currency-icon bun-icon" />
          {home.stamina}/{home.staminaMax}
          <span className="currency-plus">+</span>
        </button>
      </div>

      <div className="menu-v7-hero">
        <h1>我只要一刀</h1>
        <p>刀势越满，一刀越爽</p>
      </div>

      {/* 中间：当前关卡（少文字多动画） */}
      <div className="menu-v7-center">
        <div className="level-card">
          <span className="level-card-tag">当前关卡</span>
          <h2 className="level-card-title">
            {isFirstPlay ? "第一关" : `第 ${unlockedLevel} 关`}
          </h2>
          <div className="level-card-anim">
            <span className="level-card-sword">⚔</span>
          </div>
        </div>
      </div>

      {/* 挂机+挑战：放在关卡下方和开始游戏按钮之间，加底框 */}
      <div className="menu-v7-row menu-v7-row-top">
        <button className="menu-v7-action-btn" onClick={onIdle}>
          <span className="menu-v7-action-icon">🛌</span>
          <span>挂机收益</span>
        </button>
        <button className="menu-v7-action-btn" onClick={onChallenge}>
          <span className="menu-v7-action-icon">⚔</span>
          <span>挑战</span>
        </button>
      </div>

      {/* 中间偏下：大大的开始游戏按钮 */}
      <div className="menu-v7-row menu-v7-row-start">
        <button className="menu-v7-start-btn" onClick={isFirstPlay ? onStart : onContinue}>
          <span className="menu-v7-start-icon">⚡</span>
          <span>开始游戏</span>
        </button>
        <span className="menu-v7-stamina-hint">⚡消耗 {5} 体力</span>
      </div>

      {/* 下方：排行+图鉴+武器背包 */}
      <div className="menu-v7-row menu-v7-row-bottom">
        <button className="menu-v7-bottom-btn" onClick={onRanking}>
          <span className="menu-v7-bottom-icon">🏆</span>
          <span>排行</span>
        </button>
        <button className="menu-v7-bottom-btn" onClick={onCodex}>
          <span className="menu-v7-bottom-icon">📖</span>
          <span>图鉴</span>
        </button>
        <button className="menu-v7-bottom-btn" onClick={onBag}>
          <span className="menu-v7-bottom-icon">🎒</span>
          <span>武器背包</span>
        </button>
      </div>

      {home.stamina < 5 && (
        <button className="menu-v7-stamina-btn" onClick={onRestoreStamina}>
          ⚡体力不足，看广告恢复 10 点
        </button>
      )}

      <small className="version-footer">{appVersion}</small>

      <button className="debug-toggle" onClick={onDebug}>🛠</button>

      {showCoinModal && (
        <CurrencyModal
          title="如何获得金币？"
          onClose={() => setShowCoinModal(false)}
          items={[
            { title: "通关胜利", desc: "每关胜利基础40金币", amount: "40" },
            { title: "击杀奖励", desc: "每击杀一个敌军获得1金币", amount: "1" },
            { title: "评级加成", desc: "C→B→A→S→SS→神 0/20/50/100/180/300", amount: "0~300" },
            { title: "挂机产出", desc: "离线最多24小时", amount: "20/h" },
            { title: "广告翻倍", desc: "结算页看广告使奖励×2", amount: "×2" }
          ]}
        />
      )}

      {showStaminaModal && (
        <CurrencyModal
          title="如何获得体力？"
          onClose={() => setShowStaminaModal(false)}
          items={[
            { title: "每日登录", desc: "首次登录自动补给10点", amount: "+10" },
            { title: "自动恢复", desc: "每3分钟自动恢复1点", amount: "1/3分" },
            { title: "看广告", desc: "看一次恢复广告获得10体力", amount: "+10" },
            { title: "上限30", desc: "体力上限30点", amount: "30" }
          ]}
        />
      )}
    </section>
  );
}
