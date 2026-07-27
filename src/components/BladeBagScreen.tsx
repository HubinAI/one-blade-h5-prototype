import { useState, useEffect, useMemo } from "react";
import {
  getBladeInventory,
  getEquippedBlades,
  setEquippedMainBlade,
  setEquippedSubBlade,
  removeEquippedSubBlade,
  saveDefaultWhiteBlade,
  getCurrentRankId,
  batchForgeAll,
  getExpOrbInventory,
  type EquippedBlades,
  type ExpOrbEntry,
} from "../game/services/ProgressionService";
import type { Blade } from "../game/services/BladeService";
import { QUALITY_META, QUALITY_ORDER, getSynthesisChance, type Quality } from "../game/config/synthesis";

type BladeBagScreenProps = {
  onBack: () => void;
  onOpenCodex?: () => void;
};

export function BladeBagScreen({ onBack, onOpenCodex }: BladeBagScreenProps) {
  const [inventory, setInventory] = useState<Blade[]>(getBladeInventory());
  const [equipped, setEquipped] = useState<EquippedBlades>(getEquippedBlades());
  const [expOrbs, setExpOrbs] = useState<ExpOrbEntry[]>(getExpOrbInventory());
  const [highestFloor, setHighestFloor] = useState(1);
  const [draggingBlade, setDraggingBlade] = useState<Blade | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<"main" | "sub1" | "sub2" | null>(null);
  const [hoverBlade, setHoverBlade] = useState<Blade | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showReward, setShowReward] = useState<{ name: string; quality: Quality; success: boolean } | null>(null);

  useEffect(() => {
    // 第一次进入时确保有默认绿刀+装备
    saveDefaultWhiteBlade();
    refresh();
    const home = JSON.parse(window.localStorage.getItem("one_blade_v04_progression") ?? "{}");
    setHighestFloor(home.highestFloor ?? 1);
  }, []);

  function refresh() {
    setInventory(getBladeInventory());
    setEquipped(getEquippedBlades());
    setExpOrbs(getExpOrbInventory());
  }

  // 飘字提示（不弹窗）
  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2200);
  }

  const mainBlade = equipped.main;
  const sub1Blade = equipped.subs[0] ?? null;
  const sub2Blade = equipped.subs[1] ?? null;

  // 排序：品质从高到低（god排最前），同品质按exp
  const sortedBlades = useMemo(() => {
    return [...inventory].sort((a, b) => {
      const qa = QUALITY_ORDER.indexOf(a.quality);
      const qb = QUALITY_ORDER.indexOf(b.quality);
      if (qa !== qb) return qb - qa;
      return b.exp - a.exp;
    });
  }, [inventory]);

  // 经验球排序：从god降序到white
  const sortedOrbs = useMemo(() => {
    return [...expOrbs].sort((a, b) => {
      const qa = QUALITY_ORDER.indexOf(a.quality);
      const qb = QUALITY_ORDER.indexOf(b.quality);
      return qb - qa;
    });
  }, [expOrbs]);

  // 槽位可接受拖动
  function isSlotDropable(slot: "main" | "sub1" | "sub2"): boolean {
    return true; // V0709017 后2个副刀槽默认开启
  }

  // 当前拖动刀的成功率
  const currentChance = useMemo(() => {
    if (!draggingBlade) return null;
    const failCount = (() => {
      try {
        const p = JSON.parse(window.localStorage.getItem("one_blade_v04_progression") ?? "{}");
        return p.synFailCount?.[draggingBlade.quality] ?? 0;
      } catch { return 0; }
    })();
    return getSynthesisChance(draggingBlade.quality, failCount);
  }, [draggingBlade]);

  // 拖动到槽位
  function handleDropOnSlot(slot: "main" | "sub1" | "sub2") {
    if (!draggingBlade) return;
    if (draggingBlade.quality === "white") {
      showToast("凡品（白色）刀不可装备，请用于合成炼器");
      setDraggingBlade(null);
      return;
    }
    if (!isSlotDropable(slot)) return;
    if (slot === "main") {
      setEquippedMainBlade(draggingBlade.id);
    } else if (slot === "sub1") {
      setEquippedSubBlade(draggingBlade.id, 0);
    } else if (slot === "sub2") {
      setEquippedSubBlade(draggingBlade.id, 1);
    }
    setDraggingBlade(null);
    setDragOverSlot(null);
    setHoverBlade(null);
    refresh();
  }

  // 卸下副刀
  function handleUnequipSub(slot: 0 | 1) {
    removeEquippedSubBlade(slot);
    refresh();
  }

  // 拖动合成：拖到同品质刀 → 批量二合
  function handleDropOnBlade(target: Blade) {
    if (!draggingBlade) return;
    if (draggingBlade.id === target.id) {
      setDraggingBlade(null);
      setHoverBlade(null);
      return;
    }
    if (draggingBlade.quality !== target.quality) {
      showToast("只能同品质刀合成");
      setDraggingBlade(null);
      setHoverBlade(null);
      return;
    }
    // 默认批量：把背包所有该品质刀两两配对二合
    const result = batchForgeAll(draggingBlade.quality);
    if (result) {
      showToast(`批量合成：成功 ${result.successCount} 把 / 失败 ${result.failCount} 次`);
      if (result.successCount > 0) {
        // 显示最后一把合成成功的刀
        setShowReward({ name: result.firstSuccessName ?? "新刀", quality: draggingBlade.quality, success: true });
        setTimeout(() => setShowReward(null), 1800);
      }
    }
    setDraggingBlade(null);
    setHoverBlade(null);
    refresh();
  }

  return (
    <div className="bag-overlay" onClick={onBack}>
      <div className="bag-popup" onClick={(e) => e.stopPropagation()}>
        <div className="bag-header">
          <button className="bag-back" onClick={onBack}>×</button>
          <h1>炼器合成</h1>
          {onOpenCodex && (
            <button className="bag-codex-btn" onClick={onOpenCodex}>📖 图鉴</button>
          )}
        </div>

        {/* 出战编队 */}
        <div className="bag-team">
          <h3 className="bag-section-title">当前出战</h3>
          <div className="bag-team-row">
            <div
              className={`bag-team-slot main ${mainBlade ? "filled" : ""} ${dragOverSlot === "main" ? "hover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverSlot("main"); }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={() => handleDropOnSlot("main")}
            >
              {mainBlade ? (
                <>
                  <span className="bag-team-quality" style={{ color: QUALITY_META[mainBlade.quality]?.color }}>
                    {QUALITY_META[mainBlade.quality]?.label}
                  </span>
                  <span className="bag-team-name" style={{ color: QUALITY_META[mainBlade.quality]?.color }}>
                    {mainBlade.name}
                  </span>
                  <span className="bag-team-lv">Lv.{mainBlade.level}</span>
                </>
              ) : (
                <span className="bag-team-empty">主刀槽</span>
              )}
            </div>
            <div
              className={`bag-team-slot sub ${sub1Blade ? "filled" : ""} ${dragOverSlot === "sub1" ? "hover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverSlot("sub1"); }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={() => handleDropOnSlot("sub1")}
            >
              {sub1Blade ? (
                <>
                  <span className="bag-team-quality" style={{ color: QUALITY_META[sub1Blade.quality]?.color }}>
                    {QUALITY_META[sub1Blade.quality]?.label}
                  </span>
                  <span className="bag-team-name" style={{ color: QUALITY_META[sub1Blade.quality]?.color }}>
                    {sub1Blade.name}
                  </span>
                  <span className="bag-team-lv">Lv.{sub1Blade.level}</span>
                  <button className="bag-team-remove" onClick={() => handleUnequipSub(0)}>卸</button>
                </>
              ) : (
                <span className="bag-team-empty">蓄势副刀槽</span>
              )}
            </div>
            <div
              className={`bag-team-slot sub ${sub2Blade ? "filled" : ""} ${dragOverSlot === "sub2" ? "hover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverSlot("sub2"); }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={() => handleDropOnSlot("sub2")}
            >
              {sub2Blade ? (
                <>
                  <span className="bag-team-quality" style={{ color: QUALITY_META[sub2Blade.quality]?.color }}>
                    {QUALITY_META[sub2Blade.quality]?.label}
                  </span>
                  <span className="bag-team-name" style={{ color: QUALITY_META[sub2Blade.quality]?.color }}>
                    {sub2Blade.name}
                  </span>
                  <span className="bag-team-lv">Lv.{sub2Blade.level}</span>
                  <button className="bag-team-remove" onClick={() => handleUnequipSub(1)}>卸</button>
                </>
              ) : (
                <span className="bag-team-empty">破点副刀槽</span>
              )}
            </div>
          </div>
        </div>

        {/* 经验球区（堆叠显示） */}
        {sortedOrbs.length > 0 && (
          <div className="bag-orbs">
            <h3 className="bag-section-title">经验球 ({sortedOrbs.reduce((s, o) => s + o.count, 0)})</h3>
            <div className="bag-orbs-grid">
              {sortedOrbs.map((orb) => {
                const meta = QUALITY_META[orb.quality];
                return (
                  <div
                    key={orb.quality}
                    className="bag-orb"
                    style={{ borderColor: meta.color, color: meta.color }}
                    title={`${meta.label}经验球 - 拖动到同品质刀上喂食`}
                    draggable
                    onDragStart={() => {
                      // 简化：暂不实现拖动喂食（Phase4 再说）
                    }}
                  >
                    <span className="bag-orb-name" style={{ color: meta.color }}>
                      {meta.label}球
                    </span>
                    <span className="bag-orb-count">×{orb.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 背包仓库 */}
        <div className="bag-inventory">
          <h3 className="bag-section-title">背包仓库 ({inventory.length})</h3>
          {sortedBlades.length === 0 ? (
            <div className="bag-empty">背包为空</div>
          ) : (
            QUALITY_ORDER.map((q) => {
              const items = sortedBlades.filter((b) => b.quality === q);
              if (items.length === 0) return null;
              const meta = QUALITY_META[q];
              const isGod = q === "god";
              const colorStyle = isGod
                ? { background: "linear-gradient(90deg, #ff3b8b, #ffb83b, #36e2ff, #b86bff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", color: "transparent" }
                : { color: meta.color };
              return (
                <div key={q} className="bag-quality-group">
                  <h4 className="bag-quality-title" style={colorStyle}>
                    {meta.label} ({items.length})
                  </h4>
                  <div className="bag-blade-grid">
                    {items.map((blade) => {
                      const isDragging = draggingBlade?.id === blade.id;
                      const isHover = hoverBlade?.id === blade.id;
                      const sameQuality = draggingBlade && draggingBlade.quality === blade.quality && draggingBlade.id !== blade.id;
                      return (
                        <div
                          key={blade.id}
                          className={`bag-blade ${isDragging ? "dragging" : ""} ${isGod ? "god-quality" : ""} ${isHover ? "hover-target" : ""} ${sameQuality ? "valid-target" : ""}`}
                          style={{ borderColor: isGod ? "#ffb83b" : meta.color }}
                          draggable
                          onDragStart={() => setDraggingBlade(blade)}
                          onDragEnd={() => { setDraggingBlade(null); setHoverBlade(null); }}
                          onDragOver={(e) => { e.preventDefault(); setHoverBlade(blade); }}
                          onDragLeave={() => setHoverBlade((b) => (b?.id === blade.id ? null : b))}
                          onDrop={() => handleDropOnBlade(blade)}
                        >
                          {isHover && sameQuality && currentChance !== null && (
                            <div className="bag-blade-chance" style={{ background: meta.color }}>
                              成功率 {currentChance}%
                            </div>
                          )}
                          <span className={`bag-blade-name ${isGod ? "god-quality-name" : ""}`}
                            style={isGod ? undefined : { color: meta.color }}>
                            {blade.name}
                          </span>
                          <span className="bag-blade-lv">Lv.{blade.level}</span>
                          {blade.quality === "white" && <span className="bag-blade-tag">合成材料</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 飘字提示 */}
        {toast && (
          <div className="bag-toast">{toast}</div>
        )}

        {/* 合成成功弹窗 */}
        {showReward && (
          <div className="bag-reward-modal">
            <div className="bag-reward-card">
              <h3 style={{ color: QUALITY_META[showReward.quality]?.color }}>合成成功！</h3>
              <p>获得 <strong style={{ color: QUALITY_META[showReward.quality]?.color }}>{showReward.name}</strong></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
