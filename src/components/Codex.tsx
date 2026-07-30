import { useState, useEffect, useMemo, useRef } from "react";
import {
  QUALITY_META,
  QUALITY_ORDER,
  BLADE_BASE_STATS,
  AFFIX_CONFIG,
  RANK_CONFIG,
  RANK_ORDER,
  type Quality,
} from "../game/config/synthesis";
import { getBladeInventory, getCurrentRankId } from "../game/services/ProgressionService";

type CodexProps = {
  onClose: () => void;
};

const QUALITY_ICONS: Record<Quality, string> = {
  white: "🗡",
  green: "🗡",
  blue: "⚔",
  purple: "⚔",
  gold: "🗡",
  darkGold: "🗡",
  spirit: "🗡",
  immortal: "🗡",
  god: "🗡"
};

export function Codex({ onClose }: CodexProps) {
  const [selectedBlade, setSelectedBlade] = useState<string | null>(null);
  const [rankIndex, setRankIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; top: number } | null>(null);

  useEffect(() => {
    const rank = getCurrentRankId();
    const idx = RANK_ORDER.indexOf(rank);
    setRankIndex(idx >= 0 ? idx : 0);
  }, []);

  const inventory = useMemo(() => getBladeInventory(), []);
  const groups = useMemo(() => {
    const map: Record<string, typeof inventory> = {};
    for (const b of inventory) {
      if (!map[b.quality]) map[b.quality] = [];
      map[b.quality].push(b);
    }
    return map;
  }, [inventory]);

  // 已解锁品质数 = 当前段位 + 1 (含白品)
  const unlockedCount = Math.max(1, rankIndex + 2);
  // 仅展示：已解锁 + 下一个未解锁（半弹窗轻量化）
  const displayRange = QUALITY_ORDER.slice(0, unlockedCount + 1);

  // 拖动手势
  function onPointerDown(e: React.PointerEvent) {
    if (!scrollRef.current) return;
    dragRef.current = { y: e.clientY, top: scrollRef.current.scrollTop };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !scrollRef.current) return;
    const dy = dragRef.current.y - e.clientY;
    scrollRef.current.scrollTop = dragRef.current.top + dy;
  }

  return (
    <div className="codex-overlay" onClick={onClose}>
      <div className="codex-panel codex-v2" onClick={(e) => e.stopPropagation()}>
        <div className="codex-header">
          <button className="codex-back" onClick={onClose}>×</button>
          <h1>神兵图鉴</h1>
        </div>

        <div
          className="codex-list"
          ref={scrollRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
        >
          {displayRange.map((q) => {
            const meta = QUALITY_META[q];
            const blades = groups[q] ?? [];
            const stats = BLADE_BASE_STATS[q];
            const isUnlocked = q !== QUALITY_ORDER[unlockedCount];
            return (
              <div key={q} className={`codex-quality-block ${isUnlocked ? "" : "locked"}`}>
                <h2 className="codex-quality-heading" style={{ background: meta.color, color: "#1a100a" }}>
                  {meta.label}武学
                </h2>
                {isUnlocked ? (
                  blades.length === 0 ? (
                    <p className="codex-empty">尚未获得此类刀</p>
                  ) : (
                    <>
                      <div className="codex-blade-grid">
                        {blades.map((blade) => {
                          const isSelected = selectedBlade === blade.id;
                          return (
                            <div
                              key={blade.id}
                              className={`codex-blade-card ${isSelected ? "selected" : ""}`}
                              style={{ borderColor: meta.color }}
                              onClick={() => setSelectedBlade(isSelected ? null : blade.id)}
                            >
                              <span className="codex-blade-icon" style={{ background: meta.color }}>
                                {QUALITY_ICONS[blade.quality]}
                              </span>
                              <span className="codex-blade-name">{blade.name}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="codex-quality-stats">
                        <span>刀芒 ×{stats.bladeMultiplier.toFixed(1)}</span>
                        <span>伤害 ×{stats.damageMultiplier.toFixed(1)}</span>
                        <span>副刀 {stats.subSlashInterval.toFixed(1)}s</span>
                      </div>
                    </>
                  )
                ) : (
                  <p className="codex-locked-cond">
                    通过{RANK_CONFIG[RANK_ORDER[unlockedCount]]?.name ?? "下一段位"}后解锁
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {selectedBlade && (() => {
          const blade = inventory.find(b => b.id === selectedBlade);
          if (!blade) return null;
          const meta = QUALITY_META[blade.quality];
          const affix = blade.affix ? AFFIX_CONFIG[blade.affix] : null;
          return (
            <div className="codex-detail" onClick={(e) => e.stopPropagation()}>
              <div className="codex-detail-panel" onClick={(e) => e.stopPropagation()}>
                <div className="codex-detail-head" style={{ borderColor: meta.color }}>
                  <span className="codex-detail-quality" style={{ background: meta.color }}>
                    {meta.label}
                  </span>
                  <span className="codex-detail-name" style={{ color: meta.color }}>
                    {blade.name}
                  </span>
                  <button className="codex-detail-close" onClick={() => setSelectedBlade(null)}>×</button>
                </div>
                <div className="codex-detail-body">
                  <p className="codex-detail-row"><span>等级</span><b>Lv.{blade.level}</b></p>
                  {affix && <p className="codex-detail-row"><span>词缀</span><b>{affix.name}</b></p>}
                  {affix && <p className="codex-detail-desc">{affix.primaryEffect}</p>}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
