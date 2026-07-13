import { useState, useEffect, useMemo } from "react";
import {
  getBladeInventory,
  getEquippedBlades,
  setEquippedMainBlade,
  setEquippedSubBlade,
  removeEquippedSubBlade,
  forgeBlades,
  saveDefaultWhiteBlade,
  getCurrentRankId,
  type EquippedBlades,
} from "../game/services/ProgressionService";
import type { Blade } from "../game/services/BladeService";
import { QUALITY_META, QUALITY_ORDER, type Quality } from "../game/config/synthesis";

type BladeBagScreenProps = {
  onBack: () => void;
  onOpenCodex?: () => void;
};

const SUB1_UNLOCK_FLOOR = 50; // 第1把副刀解锁需要50层
const SUB2_UNLOCK_FLOOR = 100; // 第2把副刀解锁需要100层

export function BladeBagScreen({ onBack, onOpenCodex }: BladeBagScreenProps) {
  const [inventory, setInventory] = useState<Blade[]>(getBladeInventory());
  const [equipped, setEquipped] = useState<EquippedBlades>(getEquippedBlades());
  const [batchMode, setBatchMode] = useState(false);
  const [highestFloor, setHighestFloor] = useState(1);
  const [draggingBlade, setDraggingBlade] = useState<Blade | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<"main" | "sub1" | "sub2" | null>(null);
  const [showReward, setShowReward] = useState<{ name: string; quality: Quality; success: boolean } | null>(null);

  useEffect(() => {
    // 第一次进入时确保有默认白刀+装备
    saveDefaultWhiteBlade();
    refresh();
    const home = JSON.parse(window.localStorage.getItem("one_blade_v04_progression") ?? "{}");
    setHighestFloor(home.highestFloor ?? 1);
  }, []);

  function refresh() {
    setInventory(getBladeInventory());
    setEquipped(getEquippedBlades());
  }

  // 主刀为空时自动装备第一把白刀
  const mainBlade = equipped.main;

  const sub1Blade = equipped.subs[0] ?? null;
  const sub2Blade = equipped.subs[1] ?? null;
  const sub1Unlocked = highestFloor >= SUB1_UNLOCK_FLOOR;
  const sub2Unlocked = highestFloor >= SUB2_UNLOCK_FLOOR;

  // 排序
  const sorted = useMemo(() => {
    return [...inventory].sort((a, b) => {
      const qa = QUALITY_ORDER.indexOf(a.quality);
      const qb = QUALITY_ORDER.indexOf(b.quality);
      if (qa !== qb) return qb - qa;
      return b.exp - a.exp;
    });
  }, [inventory]);

  const grouped = useMemo(() => {
    const groups: Record<string, Blade[]> = {};
    for (const b of sorted) {
      if (!groups[b.quality]) groups[b.quality] = [];
      groups[b.quality].push(b);
    }
    return groups;
  }, [sorted]);

  // 槽位可接受拖动的高亮
  function isSlotDropable(slot: "main" | "sub1" | "sub2"): boolean {
    if (slot === "main") return true;
    if (slot === "sub1") return sub1Unlocked;
    if (slot === "sub2") return sub2Unlocked;
    return false;
  }

  // 拖动到槽位
  function handleDropOnSlot(slot: "main" | "sub1" | "sub2") {
    if (!draggingBlade) return;
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
    refresh();
  }

  // 卸下副刀
  function handleUnequipSub(slot: 0 | 1) {
    removeEquippedSubBlade(slot);
    refresh();
  }

  // 拖动合成：拖一把到另一把同品质上
  function handleDropOnBlade(target: Blade) {
    if (!draggingBlade) return;
    if (draggingBlade.id === target.id) {
      setDraggingBlade(null);
      return;
    }
    if (draggingBlade.quality !== target.quality) {
      setDraggingBlade(null);
      return;
    }
    const result = forgeBlades(draggingBlade.id, target.id);
    if (result && result.success && result.resultBlade) {
      setShowReward({ name: result.resultBlade.name, quality: result.resultBlade.quality, success: true });
      setTimeout(() => setShowReward(null), 1800);
    }
    setDraggingBlade(null);
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
                  <span className="bag-team-name">{mainBlade.name}</span>
                  <span className="bag-team-lv">Lv.{mainBlade.level}</span>
                </>
              ) : (
                <span className="bag-team-empty">主刀</span>
              )}
            </div>
            <div
              className={`bag-team-slot sub ${sub1Blade ? "filled" : ""} ${!sub1Unlocked ? "locked" : ""} ${dragOverSlot === "sub1" ? "hover" : ""}`}
              onDragOver={(e) => { if (sub1Unlocked) { e.preventDefault(); setDragOverSlot("sub1"); } }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={() => handleDropOnSlot("sub1")}
            >
              {sub1Unlocked ? (
                sub1Blade ? (
                  <>
                    <span className="bag-team-quality" style={{ color: QUALITY_META[sub1Blade.quality]?.color }}>
                      {QUALITY_META[sub1Blade.quality]?.label}
                    </span>
                    <span className="bag-team-name">{sub1Blade.name}</span>
                    <button className="bag-team-remove" onClick={() => handleUnequipSub(0)}>卸</button>
                  </>
                ) : (
                  <span className="bag-team-add">+</span>
                )
              ) : (
                <>
                  <span className="bag-team-lock">🔒</span>
                  <span className="bag-team-cond">第{SUB1_UNLOCK_FLOOR}层解锁</span>
                </>
              )}
            </div>
            <div
              className={`bag-team-slot sub ${sub2Blade ? "filled" : ""} ${!sub2Unlocked ? "locked" : ""} ${dragOverSlot === "sub2" ? "hover" : ""}`}
              onDragOver={(e) => { if (sub2Unlocked) { e.preventDefault(); setDragOverSlot("sub2"); } }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={() => handleDropOnSlot("sub2")}
            >
              {sub2Unlocked ? (
                sub2Blade ? (
                  <>
                    <span className="bag-team-quality" style={{ color: QUALITY_META[sub2Blade.quality]?.color }}>
                      {QUALITY_META[sub2Blade.quality]?.label}
                    </span>
                    <span className="bag-team-name">{sub2Blade.name}</span>
                    <button className="bag-team-remove" onClick={() => handleUnequipSub(1)}>卸</button>
                  </>
                ) : (
                  <span className="bag-team-add">+</span>
                )
              ) : (
                <>
                  <span className="bag-team-lock">🔒</span>
                  <span className="bag-team-cond">第{SUB2_UNLOCK_FLOOR}层解锁</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 批量合成开关 */}
        <div className="bag-batch-row">
          <label className="bag-batch-toggle">
            <input
              type="checkbox"
              checked={batchMode}
              onChange={(e) => setBatchMode(e.target.checked)}
            />
            <span>勾选后批量合成</span>
          </label>
        </div>

        {/* 背包仓库 */}
        <div className="bag-inventory">
          <h3 className="bag-section-title">背包仓库 ({inventory.length})</h3>
          {inventory.length === 0 ? (
            <p className="bag-empty">刀库为空</p>
          ) : (
            QUALITY_ORDER.map((q) => {
              const items = grouped[q] ?? [];
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
                      return (
                        <div
                          key={blade.id}
                          className={`bag-blade ${isDragging ? "dragging" : ""} ${isGod ? "god-quality" : ""}`}
                          style={{ borderColor: isGod ? "#ffb83b" : meta.color }}
                          draggable
                          onDragStart={() => setDraggingBlade(blade)}
                          onDragEnd={() => { setDraggingBlade(null); setDragOverSlot(null); }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDropOnBlade(blade)}
                        >
                          <span className={`bag-blade-name ${isGod ? "god-quality-name" : ""}`}
                            style={isGod ? undefined : { color: meta.color }}>
                            {blade.name}
                          </span>
                          <span className="bag-blade-lv">Lv.{blade.level}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {showReward && (
          <div className="bag-reward-anim">
            <div className="bag-reward-anim-card">
              <div className="bag-reward-anim-light" />
              <h3>合成成功！</h3>
              <span style={{ color: QUALITY_META[showReward.quality]?.color }}>
                {QUALITY_META[showReward.quality]?.label} {showReward.name}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
