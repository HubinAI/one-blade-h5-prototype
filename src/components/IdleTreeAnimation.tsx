import { useState, useEffect, useRef, useMemo } from "react";

/** P4.1A.13: 带条件过滤的游戏攻略tips池 */
type MenuTip = { text: string; minFloor?: number; maxFloor?: number; pendingGateOnly?: boolean };

const TIPS_POOL: MenuTip[] = [
  { text: "按住屏幕拖动，松开即可挥出斩击", maxFloor: 3 },
  { text: "刀势越满，一刀伤害越高" },
  { text: "火药兵会爆炸，靠近时小心连锁" },
  { text: "阵眼崩坏会带走周围所有敌人" },
  { text: "副刀自动战斗，前期即可获得强援" },
  { text: "满刀势触发「一刀破阵」伤害翻倍" },
  { text: "每天看广告可获得体力与挂机翻倍" },
  { text: "5关之后要挑战练气突破才能继续", minFloor: 5 },
  { text: "精品刀在练气突破之后才开始掉落", minFloor: 5 },
  { text: "副刀越强，自动战斗贡献越大" },
  { text: "离线也能获得金币和刀胚挂机收益" },
  { text: "深蹲屏震 + 慢动作 = 一刀破军的爽点" },
  { text: "刀胚合成会随机提升品质" },
  { text: "主线可无限往上突破，共有8大境界", minFloor: 5 },
  { text: "挑战Boss关卡是境界突破的唯一途径", minFloor: 5, pendingGateOnly: true },
  { text: "BOSS战前先练满刀势，胜算更高", minFloor: 5, pendingGateOnly: true },
  { text: "图鉴会记录你击杀过的所有敌人" },
  { text: "Boss图鉴满后可开启对应的成就奖励", minFloor: 5, pendingGateOnly: true },
  { text: "精品以上的刀可以相互合成升级" },
  { text: "挂机奖励每分钟自动累积1份" }
];

/** 砍树动画：循环播放 树摇晃→倒→重生 */
export function IdleTreeAnimation() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      if (now - last > 60) {
        setTick(t => t + 1);
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 砍树状态机: 站立→准备→砍下→倒下→重生
  // 周期: 6秒站立 + 1秒砍 + 1秒倒 + 0.5秒空 + 1.5秒生长
  const cycle = 10000; // 10秒循环
  const t = (tick * 60) % cycle;
  let treeState: "stand" | "swing" | "falling" | "fallen" | "growing" = "stand";
  if (t < 5500) treeState = "stand";
  else if (t < 6500) treeState = "swing";
  else if (t < 7000) treeState = "falling";
  else if (t < 7200) treeState = "fallen";
  else treeState = "growing";

  // 砍刀位置
  const axeX = 100;
  const axeY = 70;
  const axeAngle = treeState === "swing" ? -60 : (treeState === "falling" ? 30 : -120);

  return (
    <div className="idle-tree-stage">
      <div className="idle-tree-bg" />
      <div className="idle-tree-glow" />
      {/* 树 */}
      <div className={`idle-tree ${treeState}`}>
        <div className="idle-tree-crown" />
        <div className="idle-tree-trunk" />
      </div>
      {/* 伐木工/砍刀 */}
      <div
        className="idle-tree-axe"
        style={{ transform: `translate(${axeX}px, ${axeY}px) rotate(${axeAngle}deg)` }}
      >
        <div className="axe-handle" />
        <div className="axe-head" />
      </div>
      {/* 木屑 */}
      {treeState === "falling" && (
        <div className="idle-tree-chips">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={`chip chip-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 挂机奖励 icon + 飞入动画 */
export function IdleRewardIcon({ count, onClick }: { count: number; onClick?: () => void }) {
  return (
    <div className="idle-reward-icon" onClick={onClick}>
      <div className="idle-reward-bag">🛍</div>
      <span className="idle-reward-badge">{count}</span>
    </div>
  );
}

/** 飞向奖励icon的道具动画 */
export function FlyingReward({ trigger, onComplete }: { trigger: number; onComplete?: () => void }) {
  const [items, setItems] = useState<Array<{ id: number; x: number; y: number; kind: string }>>([]);
  const counter = useRef(0);

  useEffect(() => {
    if (trigger === 0) return;
    const newItems = Array.from({ length: 3 }).map((_, i) => ({
      id: counter.current++,
      x: 30 + i * 30,
      y: 40 + (i % 2) * 20,
      kind: i % 2 === 0 ? "🪙" : "⚔"
    }));
    setItems(prev => [...prev, ...newItems]);
  }, [trigger]);

  useEffect(() => {
    if (items.length === 0) return;
    const timer = setTimeout(() => {
      setItems([]);
      onComplete?.();
    }, 1500);
    return () => clearTimeout(timer);
  }, [items.length, onComplete]);

  return (
    <div className="flying-reward-layer">
      {items.map(item => (
        <div
          key={item.id}
          className="flying-reward-item"
          style={{ left: `${item.x}%`, top: `${item.y}%` }}
        >
          {item.kind}
        </div>
      ))}
    </div>
  );
}

/** 随机tips hook */
export function useRandomTip(floor: number, pendingGate: boolean): string {
  return useMemo(() => {
    const available = TIPS_POOL.filter(tip => {
      if (tip.minFloor !== undefined && floor < tip.minFloor) return false;
      if (tip.maxFloor !== undefined && floor > tip.maxFloor) return false;
      if (tip.pendingGateOnly && !pendingGate) return false;
      return true;
    });
    const pool = available.length > 0 ? available : TIPS_POOL.filter(tip => !tip.pendingGateOnly);
    return pool[Math.floor(Math.random() * pool.length)].text;
  }, [floor, pendingGate]);
}
