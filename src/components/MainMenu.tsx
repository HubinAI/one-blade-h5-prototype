import { useState, useMemo, useEffect } from "react";
import type { HomeSnapshot } from "../game/services/ProgressionService";
import { getEquippedBlades, restoreStaminaByAd, restoreStaminaByShare, readProgress, writeProgress, claimAutoIdle } from "../game/services/ProgressionService";
import { getStageNameByFloor, MAIN_STAGE_GATES, getCurrentGate } from "../game/config/synthesis";
import { IdleTreeAnimation, useRandomTip } from "./IdleTreeAnimation";
import { ThunderGeneralPreview } from "./ThunderGeneralPreview";

type MainMenuProps = {
  unlockedLevel: number;
  home: HomeSnapshot;
  onStart: () => void;
  onContinue: () => void;
  onRestoreStamina: () => void;
  onRanking: () => void;
  onBag: () => void;
  onIdle: () => void;
  onDebug: () => void;
  appVersion: string;
  pendingGate?: { breakthroughName: string; unlockText: string; breakthroughId: string } | null;
  onBreakthrough: () => void;
};

export function MainMenu({
  unlockedLevel,
  home,
  onStart,
  onContinue,
  onRestoreStamina,
  onRanking,
  onBag,
  onIdle,
  onDebug,
  appVersion,
  pendingGate,
  onBreakthrough,
}: MainMenuProps) {
  const isFirstPlay = unlockedLevel <= 1 && home.coins === 0;
  const floor = Math.max(1, home.highestFloor);
  const randomTip = useRandomTip(floor, Boolean(pendingGate));

  // 关卡信息
  const stageName = getStageNameByFloor(Math.max(1, home.highestFloor));

  // 挂机奖励计数（每分钟加1，最多60个=1小时）
  // 自动累积挂机收益到 idleCoins/blades（每分钟一次，无须玩家点击）
  const [, forceUpdate] = useState({});
  useEffect(() => {
    // 立即跑一次 + 每分钟跑
    const tick = () => {
      const result = claimAutoIdle();
      if (result.added > 0) {
        // 飘字显示已自动收入
        showToast(`+${result.added} 挂机收益`);
      }
      forceUpdate({});
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 货币+号点击交互
  const [staminaModal, setStaminaModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2200);
  }
  function handleCoinPlus() {
    showToast("挂机收益获得");
  }
  function handleStaminaPlus() {
    setStaminaModal(true);
  }
  function doStaminaByAd() {
    const result = restoreStaminaByAd();
    if (result.success) {
      showToast(`+10 体力`);
    } else {
      showToast(result.reason ?? "体力已满");
    }
    setStaminaModal(false);
  }
  function doStaminaByShare() {
    const result = restoreStaminaByShare();
    if (result.success) {
      showToast(`+5 体力`);
    } else {
      showToast(result.reason ?? "今日分享已达上限");
    }
    setStaminaModal(false);
  }

  return (
    <section className="screen menu-screen v3-home-screen">
      {/* 1. 货币栏(顶部) */}
      <div className="v3-currency-bar">
        <div className="v3-currency-pill" onClick={handleCoinPlus}>
          <span className="v3-currency-icon coin-icon" />
          <span className="v3-currency-num">{home.coins}</span>
          <span className="v3-currency-plus">+</span>
        </div>
        <div className="v3-currency-pill stamina" onClick={handleStaminaPlus}>
          <span className="v3-currency-icon bun-icon" />
          <span className="v3-currency-num">{home.stamina}/{home.staminaMax}</span>
          <span className="v3-currency-plus">+</span>
        </div>
      </div>

      {/* 2. 游戏名 + 随机tips */}
      <div className="v3-title-section">
        <h1 className="v3-title">我只要一刀</h1>
        <p className="v3-tip" key={randomTip}>💡 {randomTip}</p>
      </div>

      {/* 3. 当前关卡信息 / 突破信息 (互斥) */}
      {pendingGate ? (
        <div className="v3-stage-card v3-stage-card-breakthrough">
          <span className="v3-stage-tag">境界突破</span>
          <h2 className="v3-stage-name">{pendingGate.breakthroughName}</h2>
          <span className="v3-stage-subtitle">{pendingGate.unlockText}</span>
          <div className="v3-stage-sword-anim">✦</div>
        </div>
      ) : (
        <div className="v3-stage-card">
          <span className="v3-stage-tag">当前挑战</span>
          <h2 className="v3-stage-name">第 {floor} 关</h2>
          <span className="v3-stage-subtitle">{stageName}·火药连爆</span>
          <div className="v3-stage-sword-anim">⚔</div>
        </div>
      )}

      {/* 4. 中央展示区：突破→Boss预览/普通→砍树+挂机 */}
      <div
        className={`v3-idle-tree-area ${pendingGate ? "is-breakthrough" : ""}`}
        data-testid="home-main-preview"
      >
        {pendingGate ? (
          <ThunderGeneralPreview />
        ) : (
          <IdleTreeAnimation />
        )}

        {!pendingGate && (
          <button className="v3-idle-reward-btn"
            onClick={() => {
              if (unlockedLevel < 2) {
                showToast("通关第2关后解锁挂机收益");
                return;
              }
              onIdle();
            }}>
            <span className="v3-idle-reward-icon">🛍</span>
            <span className="v3-idle-reward-label">挂机</span>
            {home.offlineCoins > 0 && (
              <span className="v3-idle-reward-badge">{home.offlineCoins}</span>
            )}
          </button>
        )}
      </div>

      {/* 5. 开始游戏按钮 (圆角胶囊 + 居中对齐) */}
      <div className="v3-start-area">
        <button
          className="v3-start-btn"
          onClick={pendingGate ? onBreakthrough : (isFirstPlay ? onStart : onContinue)}
        >
          <span className="v3-start-lightning">⚡</span>
          <span className="v3-start-text">{pendingGate ? pendingGate.breakthroughName : "开始游戏"}</span>
        </button>
        <div className="v3-start-stamina-line">
          <span className="v3-start-stamina">⚡ {pendingGate ? "突破关卡" : "消耗 5 体力"}</span>
        </div>
      </div>

      {/* 6. 底部左右双入口 - 排行榜需要通关第30关后解锁 */}
      <div className="v3-bottom-row">
        <button className="v3-side-btn" onClick={() => {
          if (unlockedLevel < 30) {
            showToast("通关第30关后解锁排行榜");
            return;
          }
          onRanking();
        }}>
          <div className="v3-side-icon">🏯</div>
          <div className="v3-side-label">排行榜</div>
        </button>
        <button className="v3-side-btn" onClick={onBag}>
          <div className="v3-side-icon forge-icon">⚒</div>
          <div className="v3-side-label">炼器合成</div>
        </button>
      </div>

      {/* 调试入口 + 版本 */}
      <div className="v3-footer">
        <small className="version-footer">{appVersion}</small>
        <button className="debug-toggle" onClick={onDebug}>🛠</button>
      </div>

      {/* 飘字 */}
      {toast && <div className="bag-toast">{toast}</div>}

      {/* 体力获取弹窗 */}
      {staminaModal && (
        <div className="stamina-modal-overlay" onClick={() => setStaminaModal(false)}>
          <div className="stamina-modal" onClick={(e) => e.stopPropagation()}>
            <button className="stamina-modal-close" onClick={() => setStaminaModal(false)}>×</button>
            <h2 className="stamina-modal-title">获取体力</h2>
            <div className="stamina-modal-icon-big">⚡</div>
            <div className="stamina-modal-count">{home.stamina}/{home.staminaMax}</div>
            <div className="stamina-modal-status">体力充沛</div>
            <div className="stamina-modal-actions">
              <button className="stamina-modal-btn ad" onClick={doStaminaByAd}>
                <span className="stamina-modal-btn-icon">▶</span>
                <span className="stamina-modal-btn-text">+10</span>
              </button>
              <button className="stamina-modal-btn share" onClick={doStaminaByShare}>
                <span className="stamina-modal-btn-icon">⤴</span>
                <span className="stamina-modal-btn-text">+5</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
