import { useState, useEffect } from "react";
import type { Blade } from "../game/services/BladeService";
import { getBladeInventory, equipMainBlade, equipSubBlade, unequipSubBlade, getEquippedBlades } from "../game/services/ProgressionService";
import { QUALITY_META, BLADE_BASE_STATS, AFFIX_CONFIG } from "../game/config/synthesis";
import type { Quality } from "../game/config/synthesis";

type TeamScreenProps = {
  onBack: () => void;
};

const SLOTS = [
  { id: "main", label: "主刀", desc: "玩家操控" },
  { id: "sub1", label: "副刀·壹", desc: "自动攻击" },
  { id: "sub2", label: "副刀·贰", desc: "自动攻击" },
];

export function TeamScreen({ onBack }: TeamScreenProps) {
  const [inventory] = useState<Blade[]>(getBladeInventory());
  const [equipped, setEquipped] = useState(getEquippedBlades());
  const [selectingSlot, setSelectingSlot] = useState<string | null>(null);
  const [showStats, setShowStats] = useState<Blade | null>(null);

  function refresh() {
    setEquipped(getEquippedBlades());
  }

  function handleSelectSlot(slot: string) {
    setSelectingSlot(slot);
    setShowStats(null);
  }

  function handleEquip(blade: Blade) {
    if (selectingSlot === "main") {
      equipMainBlade(blade.id);
    } else if (selectingSlot === "sub1") {
      equipSubBlade(blade.id, 0);
    } else if (selectingSlot === "sub2") {
      equipSubBlade(blade.id, 1);
    }
    setSelectingSlot(null);
    refresh();
  }

  function handleUnequip(slot: string) {
    if (slot === "main") {
      equipMainBlade(null);
    } else if (slot === "sub1") {
      unequipSubBlade(0);
    } else if (slot === "sub2") {
      unequipSubBlade(1);
    }
    refresh();
  }

  function getBladeForSlot(slot: string): Blade | null {
    if (slot === "main") return equipped.main;
    if (slot === "sub1") return equipped.subs[0] ?? null;
    if (slot === "sub2") return equipped.subs[1] ?? null;
    return null;
  }

  const stats = BLADE_BASE_STATS;

  return (
    <section className="screen team-screen">
      <div className="team-header">
        <button className="team-back" onClick={onBack}>← 返回</button>
        <h1>出战编队</h1>
      </div>

      <div className="team-slots">
        {SLOTS.map((slot) => {
          const blade = getBladeForSlot(slot.id);
          return (
            <div
              key={slot.id}
              className={`team-slot ${blade ? "filled" : "empty"} ${slot.id === "main" ? "main" : "sub"}`}
              onClick={() => handleSelectSlot(slot.id)}
            >
              {blade ? (
                <div className="team-slot-blade">
                  <span className="team-slot-label">{slot.label}</span>
                  <span className="team-slot-quality" style={{ color: QUALITY_META[blade.quality]?.color }}>
                    {QUALITY_META[blade.quality]?.label}
                  </span>
                  <span className="team-slot-name">{blade.name}</span>
                  {blade.affix && (
                    <span className="team-slot-affix">
                      {AFFIX_CONFIG[blade.affix]?.name ?? blade.affix}
                    </span>
                  )}
                  <span className="team-slot-lv">Lv.{blade.level}</span>
                  <button className="team-slot-remove" onClick={(e) => { e.stopPropagation(); handleUnequip(slot.id); }}>卸下</button>
                </div>
              ) : (
                <div className="team-slot-empty">
                  <span className="team-slot-label">{slot.label}</span>
                  <span className="team-slot-placeholder">点击装备</span>
                  <span className="team-slot-desc">{slot.desc}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 选中属性预览 */}
      {showStats && (
        <div className="team-stats-preview">
          <h3>{showStats.name} 属性</h3>
          <div className="team-stats-grid">
            <span>品质：{showStats.quality}</span>
            <span>刀芒倍率：×{stats[showStats.quality]?.bladeMultiplier?.toFixed(2)}</span>
            <span>伤害倍率：×{stats[showStats.quality]?.damageMultiplier?.toFixed(2)}</span>
            {showStats.affix && <span>词缀：{AFFIX_CONFIG[showStats.affix]?.name} — {AFFIX_CONFIG[showStats.affix]?.description}</span>}
          </div>
        </div>
      )}

      {/* 刀库列表 */}
      {selectingSlot && (
        <div className="team-select-overlay" onClick={() => setSelectingSlot(null)}>
          <div className="team-select-panel" onClick={(e) => e.stopPropagation()}>
            <h3>选择{SLOTS.find(s => s.id === selectingSlot)?.label ?? ""}</h3>
            <div className="team-select-list">
              {inventory.length === 0 && <p className="team-empty">刀库为空</p>}
              {inventory.map((blade) => {
                const meta = QUALITY_META[blade.quality];
                return (
                  <div key={blade.id} className="team-select-card" onClick={() => handleEquip(blade)}>
                    <span className="team-select-quality" style={{ color: meta?.color }}>
                      {meta?.label}
                    </span>
                    <span className="team-select-name">{blade.name}</span>
                    <span className="team-select-lv">Lv.{blade.level}</span>
                    {blade.affix && <span className="team-select-affix">{AFFIX_CONFIG[blade.affix]?.name}</span>}
                  </div>
                );
              })}
            </div>
            <button className="team-select-close" onClick={() => setSelectingSlot(null)}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
