import { useState, useMemo, useEffect } from "react";
import type { HomeSnapshot } from "../game/services/ProgressionService";
import { getEquippedBlades } from "../game/services/ProgressionService";
import { getStageNameByFloor, MAIN_STAGE_GATES, getCurrentGate } from "../game/config/synthesis";
import { IdleTreeAnimation, IdleRewardIcon, FlyingReward, useRandomTip } from "./IdleTreeAnimation";

type MainMenuProps = {
  unlockedLevel: number;
  home: HomeSnapshot;
  onStart: () => void;
  onContinue: () => void;
  onRestoreStamina: () => void;
  onRanking: () => void;
  onBag: () => void;
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
  onDebug,
  appVersion,
  pendingGate,
  onBreakthrough,
}: MainMenuProps) {
  const isFirstPlay = unlockedLevel <= 1 && home.coins === 0;
  const randomTip = useRandomTip();

  // 关卡信息
  const stageName = getStageNameByFloor(Math.max(1, home.highestFloor));
  const floor = Math.max(1, home.highestFloor);

  // 挂机奖励计数（每分钟加1，最多60个=1小时）
  const [idleRewardCount, setIdleRewardCount] = useState(0);
  const [flyTrigger, setFlyTrigger] = useState(0);

  useEffect(() => {
    // 初始化：根据离线时间计算已累积
    const lastSeen = home.lastSeenAt ?? Date.now();
    const elapsedMin = Math.min(60, Math.floor((Date.now() - lastSeen) / 60000));
    setIdleRewardCount(Math.min(60, Math.max(0, elapsedMin)));
  }, [home.lastSeenAt]);

  useEffect(() => {
    if (idleRewardCount >= 60) return;
    const timer = setInterval(() => {
      setIdleRewardCount(c => Math.min(60, c + 1));
      setFlyTrigger(t => t + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, [idleRewardCount]);

  const handleClickReward = () => {
    setIdleRewardCount(0);
    setFlyTrigger(t => t + 1);
  };

  return (
    <section className="screen menu-screen v3-home-screen">
      {/* 1. 货币栏(顶部) */}
      <div className="v3-currency-bar">
        <div className="v3-currency-pill">
          <span className="v3-currency-icon coin-icon" />
          <span className="v3-currency-num">{home.coins}</span>
          <span className="v3-currency-plus">+</span>
        </div>
        <div className="v3-currency-pill stamina" onClick={home.stamina < 5 ? onRestoreStamina : undefined}>
          <span className="v3-currency-icon bun-icon" />
          <span className="v3-currency-num">{home.stamina}/{home.staminaMax}</span>
          {home.stamina < 5 && <span className="v3-currency-plus">+</span>}
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

      {/* 4. 挂机砍树动画区 */}
      <div className="v3-idle-tree-area">
        <IdleTreeAnimation />
        <div className="v3-idle-reward-corner">
          <IdleRewardIcon count={idleRewardCount} onClick={handleClickReward} />
        </div>
        <FlyingReward trigger={flyTrigger} />
      </div>

      {/* 5. 开始游戏按钮 (统一显示,根据模式内部切换) */}
      <div className="v3-start-area">
        <button
          className="v3-start-btn"
          onClick={pendingGate ? onBreakthrough : (isFirstPlay ? onStart : onContinue)}
        >
          <span className="v3-start-sword">{pendingGate ? "✦" : "⚔"}</span>
          <span className="v3-start-text">开始游戏</span>
          <span className="v3-start-stamina">
            {pendingGate ? "突破关卡" : "消耗 5 体力"}
          </span>
        </button>
      </div>

      {/* 6. 底部左右双入口 */}
      <div className="v3-bottom-row">
        <button className="v3-side-btn" onClick={onRanking}>
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
    </section>
  );
}
