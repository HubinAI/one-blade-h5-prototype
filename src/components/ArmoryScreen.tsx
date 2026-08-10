import { useState, useEffect, useCallback } from "react";
import {
  getBladeInventory, initBladeGrowthDefaults, getEquippedBladeInfo,
  equipBladeToSlot, upgradeBladeExp, resetBladeExp,
  getExpOrbInventory,
} from "../game/services/ProgressionService";
import { forgeWhiteToGreen, getWhiteGreenForgeRate, resetForgeFailCount,
  addWhiteBladeMaterial, addGreenExpOrb,
} from "../game/services/ProgressionService";
import { getBladeQualityConfig, getBladeLevelConfig, computeBladeAttack, getForgeConfig,
  BLADE_QUALITY_CONFIG,
} from "../game/config/bladeGrowth";
import type { BladeQualityId } from "../game/config/bladeGrowth";
import type { Blade } from "../game/services/BladeService";

/* ── helpers ── */
const Q_COLORS: Record<string, string> = { white: "#ccc", green: "#5bc0ff", blue: "#5b7fff", purple: "#b58cff", orange: "#f6a623", red: "#f05050", gold: "#ffd35a", pink: "#ff80b0", rainbow: "#80ffd0" };
const QUALITY_ORDER: BladeQualityId[] = ["rainbow","pink","gold","red","orange","purple","blue","green","white"];
const QUALITY_META: Record<string, { label: string; color: string }> = { white: {label: "凡品", color: "#ccc"}, green: {label: "精炼", color: "#5bc0ff"}, blue: {label: "蓝品", color: "#5b7fff"}, purple: {label: "紫品", color: "#b58cff"}, orange: {label: "橙品", color: "#f6a623"}, red: {label: "红品", color: "#f05050"}, gold: {label: "金品", color: "#ffd35a"}, pink: {label: "粉品", color: "#ff80b0"}, rainbow: {label: "虹品", color: "#80ffd0"} };

function qLabel(q: string) { return QUALITY_META[q]?.label ?? q; }
function qColor(q: string) { return QUALITY_META[q]?.color ?? "#888"; }

/* ── backpack item types ── */
interface BpBlade { kind: "blade"; blade: Blade; stackable: boolean; count: number; }
interface BpExp { kind: "exp"; quality: BladeQualityId; count: number; }

function buildBackpack(): (BpBlade | BpExp)[] {
  const inv = getBladeInventory();
  const equipped = getEquippedBladeInfo();
  const equippedIds = new Set([equipped.main?.id, equipped.sub1?.id].filter(Boolean));
  const expOrbs = getExpOrbInventory();

  // stackable white blades
  const whiteBlades = inv.filter(b => b.quality === "white" && !equippedIds.has(b.id));
  const greenBlades = inv.filter(b => b.quality === "green" && !equippedIds.has(b.id));

  const items: (BpBlade | BpExp)[] = [];

  // exp orbs first (high quality first)
  for (const q of QUALITY_ORDER) {
    const orb = expOrbs.find(e => e.quality === q);
    if (orb && orb.count > 0) items.push({ kind: "exp", quality: q as BladeQualityId, count: orb.count });
  }
  // stackable white blades
  if (whiteBlades.length > 0) items.push({ kind: "blade", blade: whiteBlades[0], stackable: true, count: whiteBlades.length });
  // individual green blades
  for (const b of greenBlades) items.push({ kind: "blade", blade: b, stackable: false, count: 1 });

  return items;
}

const EQUIP_ORDER: ("SUB_1" | "MAIN" | "SUB_2")[] = ["SUB_1", "MAIN", "SUB_2"];

export default function ArmoryScreen({ onBack, debug }: { onBack: () => void; debug?: boolean }) {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);

  useEffect(() => { initBladeGrowthDefaults(); refresh(); }, []);

  const equips = getEquippedBladeInfo();
  const backpack = buildBackpack();

  // drag state
  const [dragItem, setDragItem] = useState<{ idx: number } | null>(null);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<number | null>(null);
  const [hoverValid, setHoverValid] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<string>("");

  // forge result modal
  const [modal, setModal] = useState<{ title: string; subtitle: string; quality: string; name?: string } | null>(null);
  // toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  // ═══ drag helpers ═══
  const getItem = (idx: number) => backpack[idx] ?? null;
  const isDragging = dragItem !== null;

  const canForge = (a: BpBlade | BpExp, b: BpBlade | BpExp): { rate: number } | null => {
    if (a.kind !== "blade" || b.kind !== "blade") return null;
    if (a.blade.quality !== b.blade.quality) return null;
    if (a.blade.id === b.blade.id && !a.stackable) return null;
    const cfg = getForgeConfig(a.blade.quality as BladeQualityId, a.blade.quality as BladeQualityId);
    if (!cfg) return null;
    // For stacking: check enough count
    if (a.stackable && a.count >= 2) return { rate: getWhiteGreenForgeRate() };
    return { rate: getWhiteGreenForgeRate() };
  };

  const canMergeExp = (a: BpBlade | BpExp, b: BpBlade | BpExp): boolean => {
    if (a.kind !== "exp" || b.kind !== "exp") return false;
    return a.quality === b.quality && a !== b;
  };

  const canEquip = (item: BpBlade | BpExp, slot: string): boolean => {
    if (item.kind !== "blade") return false;
    if (slot === "SUB_2") return false;
    if (item.blade.quality === "white") return false;
    return true;
  };

  const canUpgrade = (item: BpBlade | BpExp, slot: string): { blade: Blade; cost: number; canAfford: boolean } | null => {
    if (item.kind !== "exp") return null;
    if (slot === "SUB_2") return null;
    const blade = slot === "MAIN" ? equips.main : equips.sub1;
    if (!blade) return null;
    if (blade.quality !== item.quality) return null;
    if (blade.level >= 40) return null;
    const lvlCfg = getBladeLevelConfig(blade.level);
    if (!lvlCfg) return null;
    const cost = lvlCfg.expCostToNextLevel;
    return { blade, cost, canAfford: item.count >= cost };
  };

  const onDragStart = (idx: number) => { setDragItem({ idx }); setHoverInfo(""); };
  const onDragEnd = () => { setDragItem(null); setHoverSlot(null); setHoverTarget(null); setHoverValid(false); setHoverInfo(""); };

  // ═══ slot drag handlers ═══
  const onSlotOver = (slot: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem) return;
    const item = getItem(dragItem.idx);
    if (!item) return;

    if (canEquip(item, slot)) {
      setHoverSlot(slot); setHoverValid(true); setHoverInfo("装备");
    } else if (item.kind === "exp") {
      const up = canUpgrade(item, slot);
      if (up) {
        setHoverSlot(slot); setHoverValid(true);
        if (up.canAfford) {
          setHoverInfo(`消耗 ${up.cost} 个`);
        } else {
          setHoverInfo(`消耗 ${up.cost} 个 (不足)`);
        }
      } else if (up === null && item.kind === "exp") {
        const blade = slot === "MAIN" ? equips.main : equips.sub1;
        if (blade && blade.level >= 40) {
          setHoverSlot(slot); setHoverValid(false); setHoverInfo("已满级");
        } else if (blade) {
          setHoverSlot(slot); setHoverValid(false); setHoverInfo("品质不匹配");
        }
      } else {
        setHoverSlot(null); setHoverValid(false);
      }
    } else {
      setHoverSlot(null); setHoverValid(false);
    }
  };
  const onSlotDrop = (slot: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem) return;
    const item = getItem(dragItem.idx);
    if (!item) return;

    if (canEquip(item, slot) && item.kind === "blade") {
      const slotKey = slot === "SUB_1" ? "SUB_1" : "MAIN";
      if (equipBladeToSlot(item.blade.id, slotKey)) { showToast(`装备到${slotKey}`); refresh(); }
    } else if (item.kind === "exp") {
      const up = canUpgrade(item, slot);
      if (up && up.canAfford) {
        const r = upgradeBladeExp(up.blade.id);
        if (r.ok) showToast(`升级到 Lv${r.newLevel}！`);
        else showToast(r.reason ?? "失败");
        refresh();
      } else if (up && !up.canAfford) {
        showToast("经验不足");
      } else if (item.kind === "exp") {
        const blade = slot === "MAIN" ? equips.main : equips.sub1;
        if (blade && blade.quality !== item.quality) showToast("需要同品质经验球");
      }
    }
    onDragEnd();
  };

  // ═══ backpack item drag handlers ═══
  const onItemOver = (targetIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem || dragItem.idx === targetIdx) return;
    const src = getItem(dragItem.idx);
    const tgt = getItem(targetIdx);
    if (!src || !tgt) return;

    setHoverTarget(targetIdx);

    if (src.kind === "blade" && tgt.kind === "blade") {
      const f = canForge(src, tgt);
      if (f) { setHoverValid(true); setHoverInfo(`合成成功率 ${Math.round(f.rate * 100)}%`); }
      else { setHoverValid(false); setHoverInfo(""); }
    } else if (src.kind === "exp" && tgt.kind === "exp") {
      if (canMergeExp(src, tgt)) { setHoverValid(true); setHoverInfo("经验合成"); }
      else { setHoverValid(false); setHoverInfo(""); }
    } else {
      setHoverValid(false); setHoverInfo("");
    }
  };
  const onItemDrop = (targetIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem || dragItem.idx === targetIdx) { onDragEnd(); return; }
    const src = getItem(dragItem.idx);
    const tgt = getItem(targetIdx);
    if (!src || !tgt) { onDragEnd(); return; }

    // Blade forge
    if (src.kind === "blade" && tgt.kind === "blade") {
      const f = canForge(src, tgt);
      if (f) {
        // Consume from stackable white
        if (src.stackable && src.count >= 2 && dragItem.idx === targetIdx) {
          const r = forgeWhiteToGreen(undefined, undefined);
          if (r.success && r.blade) {
            setModal({ title: "炼器成功", subtitle: qLabel(r.blade.quality), quality: r.blade.quality, name: r.blade.name });
          } else {
            showToast(`炼器失败，获得绿经验球 ×${r.expOrbs ?? 1}`);
          }
        } else if (src.stackable && tgt.stackable && src.blade.quality === tgt.blade.quality && src.count >= 2) {
          const r = forgeWhiteToGreen(undefined, undefined);
          if (r.success && r.blade) setModal({ title: "炼器成功", subtitle: qLabel(r.blade.quality), quality: r.blade.quality, name: r.blade.name });
          else showToast(`炼器失败，获得绿经验球 ×${r.expOrbs ?? 1}`);
        }
        refresh();
      }
    }
    // Exp merge
    if (src.kind === "exp" && tgt.kind === "exp" && canMergeExp(src, tgt)) {
      // simulate 2→1 merge
      if (src.count >= 2 && dragItem.idx === targetIdx) {
        const r = doExpMerge(src.quality);
        showToast(r ?? "合成失败");
      } else {
        showToast("需要2个同品质经验球");
      }
      refresh();
    }

    onDragEnd();
  };

  const onItemLeave = () => { setHoverTarget(null); setHoverValid(false); setHoverInfo(""); };
  const onSlotLeave = () => { setHoverSlot(null); setHoverValid(false); setHoverInfo(""); };

  // ═══ exp merge ═══
  const doExpMerge = (quality: BladeQualityId): string | null => {
    const cfg = getForgeConfig(quality, quality);
    if (!cfg) return null;
    // For first version: always succeed (2 → 1 next quality exp)
    // This is placeholder — real exp merge will be done in a future task
    return "经验合成 (WIP)";
  };

  // ═══ render ═══
  const renderSlot = (slot: "SUB_1" | "MAIN" | "SUB_2") => {
    const blade = slot === "MAIN" ? equips.main : slot === "SUB_1" ? equips.sub1 : null;
    const cfg = blade ? getBladeQualityConfig(blade.quality as BladeQualityId) : null;
    const atk = blade ? Math.round(computeBladeAttack(blade.quality as BladeQualityId, blade.level)) : 0;
    const isHovered = hoverSlot === slot;
    const cls = `as-slot ${isHovered ? (hoverValid ? "hover-valid" : "hover-invalid") : ""} ${slot === "MAIN" ? "main" : slot === "SUB_2" ? "locked" : ""}`;
    const borderColor = blade ? qColor(blade.quality) : "#444";

    return (
      <div className={cls} key={slot}
        style={{ borderColor }}
        onDragOver={onSlotOver(slot)}
        onDragLeave={onSlotLeave}
        onDrop={onSlotDrop(slot)}>
        {slot === "SUB_2" ? (
          <><div className="as-lock">🔒</div><span>未开放</span></>
        ) : blade ? (
          <>
            <div className="as-slot-q" style={{color: borderColor}}>{cfg?.qualityName ?? qLabel(blade.quality)}</div>
            <div className="as-slot-name">{blade.name}</div>
            <div className="as-slot-lv">Lv.{blade.level}</div>
            <div className="as-slot-atk">攻{atk}</div>
            {isHovered && <div className={`as-slot-hint ${hoverValid ? "" : "invalid"}`}>{hoverInfo}</div>}
          </>
        ) : (
          <div className="as-slot-empty">{slot === "MAIN" ? "主刀" : "副刀1"}</div>
        )}
      </div>
    );
  };

  const renderBackpackItem = (item: BpBlade | BpExp, idx: number) => {
    const isHovered = hoverTarget === idx;
    let cls = "as-item";
    if (dragItem?.idx === idx) cls += " dragging";
    if (isHovered) cls += hoverValid ? " hover-valid" : " hover-invalid";

    if (item.kind === "exp") {
      return (
        <div key={`e${idx}`} className={cls} draggable
          onDragStart={() => onDragStart(idx)} onDragEnd={onDragEnd}
          onDragOver={onItemOver(idx)} onDragLeave={onItemLeave} onDrop={onItemDrop(idx)}
          style={{borderColor: qColor(item.quality)}}>
          <div className="as-item-icon as-exp-ball" style={{background: qColor(item.quality)}}/>
          <div className="as-item-label">{qLabel(item.quality)}经验</div>
          {item.count > 1 && <div className="as-item-count">×{item.count}</div>}
          {isHovered && dragItem?.idx !== idx && <div className="as-drag-hint">{hoverInfo}</div>}
        </div>
      );
    } else {
      const blade = item.blade;
      const atk = item.stackable ? 0 : Math.round(computeBladeAttack(blade.quality as BladeQualityId, blade.level));
      return (
        <div key={`b${idx}`} className={cls} draggable
          onDragStart={() => onDragStart(idx)} onDragEnd={onDragEnd}
          onDragOver={onItemOver(idx)} onDragLeave={onItemLeave} onDrop={onItemDrop(idx)}
          style={{borderColor: qColor(blade.quality)}}>
          <div className="as-item-icon as-blade-sq" style={{borderColor: qColor(blade.quality)}}>⚔</div>
          <div className="as-item-label">{item.stackable ? "凡铁刀胚" : blade.name}</div>
          {item.stackable && item.count > 1 ? (
            <div className="as-item-count">×{item.count}</div>
          ) : (
            <div className="as-item-lv">Lv.{blade.level} {atk > 0 ? `攻${atk}` : ""}</div>
          )}
          {isHovered && dragItem?.idx !== idx && <div className="as-drag-hint">{hoverInfo}</div>}
        </div>
      );
    }
  };

  return (
    <div className="as-root">
      {/* header */}
      <div className="as-header">
        <button className="as-back" onClick={onBack}>←</button>
        <h2>装备</h2>
      </div>

      {/* equipment slots */}
      <div className="as-equip-zone">
        {EQUIP_ORDER.map(s => renderSlot(s))}
      </div>

      {/* backpack grid */}
      <div className="as-backpack">
        <h3>背包</h3>
        <div className="as-grid">
          {backpack.map((item, i) => renderBackpackItem(item, i))}
          {backpack.length === 0 && <div className="as-empty">暂无物品</div>}
        </div>
      </div>

      {/* debug tools */}
      {debug && (
        <div className="as-debug">
          <h4>🔧 Debug</h4>
          <button onClick={() => { addWhiteBladeMaterial(2); refresh(); }}>+2白刀</button>
          <button onClick={() => { addWhiteBladeMaterial(10); refresh(); }}>+10白刀</button>
          <button onClick={() => { addGreenExpOrb(1); refresh(); }}>+1绿经验</button>
          <button onClick={() => { addGreenExpOrb(10); refresh(); }}>+10绿经验</button>
          <button onClick={() => { resetForgeFailCount(); refresh(); }}>重置概率</button>
        </div>
      )}

      {/* forge success modal */}
      {modal && (
        <div className="as-modal-overlay" onClick={() => setModal(null)}>
          <div className="as-modal" onClick={e => e.stopPropagation()}>
            <div className="as-modal-title">{modal.title}</div>
            <div className="as-modal-blade" style={{borderColor: qColor(modal.quality)}}>
              <div className="as-modal-q" style={{color: qColor(modal.quality)}}>{modal.subtitle}</div>
              <div className="as-modal-name">{modal.name ?? "青锋刀"}</div>
              <div className="as-modal-icon" style={{color: qColor(modal.quality)}}>⚔</div>
            </div>
            <button className="as-modal-close" onClick={() => setModal(null)}>确定</button>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && <div className="as-toast">{toast}</div>}
    </div>
  );
}
