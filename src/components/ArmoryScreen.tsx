import { useState, useEffect, useCallback } from "react";
import {
  getBladeInventory, initBladeGrowthDefaults, getEquippedBladeInfo,
  equipBladeToSlot, upgradeBladeExp, resetBladeExp,
  getExpOrbInventory,
} from "../game/services/ProgressionService";
import { forgeWhiteToGreen, getWhiteGreenForgeRate, resetForgeFailCount,
  addWhiteBladeMaterial, addGreenExpOrb,
} from "../game/services/ProgressionService";
import { getBladeQualityConfig, getBladeLevelConfig, computeBladeAttack, getForgeConfig } from "../game/config/bladeGrowth";
import type { BladeQualityId } from "../game/config/bladeGrowth";
import type { Blade } from "../game/services/BladeService";

/* ── quality metadata ── */
const Q_NAMES: Record<string, string> = { white:"白色", green:"绿色", blue:"蓝色", purple:"紫色", orange:"橙色", red:"红色", gold:"金色", pink:"粉色", rainbow:"彩色" };
const B_NAMES: Record<string, string> = { white:"凡铁刀胚", green:"青锋刀", blue:"玄锋刀", purple:"灵霄刀", orange:"镇岳刀", red:"赤霄刀", gold:"天罡刀", pink:"太虚刀", rainbow:"开天刀" };
const Q_COLORS: Record<string, string> = { white:"#ccc", green:"#5bc0ff", blue:"#5b7fff", purple:"#b58cff", orange:"#f6a623", red:"#f05050", gold:"#ffd35a", pink:"#ff80b0", rainbow:"#80ffd0" };
const Q_ORDER: BladeQualityId[] = ["rainbow","pink","gold","red","orange","purple","blue","green","white"];

function qName(q: string) { return Q_NAMES[q] ?? q; }
function qColor(q: string) { return Q_COLORS[q] ?? "#888"; }
function bName(q: string) { return B_NAMES[q] ?? "刀"; }

/* ── backpack helpers ── */
function buildBackpack(): (Blade | {kind:"exp",quality:BladeQualityId,count:number})[] {
  const inv = getBladeInventory();
  const equipped = getEquippedBladeInfo();
  const equippedIds = new Set([equipped.main?.id, equipped.sub1?.id].filter(Boolean));
  const expOrbs = getExpOrbInventory();

  const items: (Blade | {kind:"exp",quality:BladeQualityId,count:number})[] = [];

  // exp first: each quality with >=1 count → 1 or 2 stacks (ceil/floor)
  for (const q of Q_ORDER) {
    const orb = expOrbs.find(e => e.quality === q);
    if (!orb || orb.count <= 0) continue;
    if (orb.count === 1) {
      items.push({kind:"exp",quality:q as BladeQualityId,count:1});
    } else {
      const a = Math.ceil(orb.count/2);
      const b = Math.floor(orb.count/2);
      items.push({kind:"exp",quality:q as BladeQualityId,count:a});
      items.push({kind:"exp",quality:q as BladeQualityId,count:b});
    }
  }
  // blades: quality high→low, each individual instance (no stacking)
  for (const q of Q_ORDER) {
    const blades = inv.filter(b => b.quality === q && !equippedIds.has(b.id));
    for (const b of blades) items.push(b);
  }
  return items;
}

function totalExpForQuality(quality: string): number {
  const orbs = getExpOrbInventory();
  return orbs.find(e => e.quality === quality)?.count ?? 0;
}

/* ── forge helpers ── */
function getForgeableBlades(quality: string): Blade[] {
  const inv = getBladeInventory();
  const equipped = getEquippedBladeInfo();
  const equippedIds = new Set([equipped.main?.id, equipped.sub1?.id].filter(Boolean));
  return inv.filter(b => b.quality === quality && !equippedIds.has(b.id));
}

export default function ArmoryScreen({ onBack, debug }: { onBack: () => void; debug?: boolean }) {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  useEffect(() => { initBladeGrowthDefaults(); refresh(); }, []);

  const equips = getEquippedBladeInfo();
  const backpack = buildBackpack();

  // drag
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [hoverItemIdx, setHoverItemIdx] = useState<number | null>(null);
  const [hoverValid, setHoverValid] = useState(false);
  const [hoverInfo, setHoverInfo] = useState("");
  // batch forge selection
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());

  // modal / toast
  const [modal, setModal] = useState<{title:string;lines:string[]}|null>(null);
  const [toast, setToast] = useState<string|null>(null);
  const showToast = (m:string) => { setToast(m); setTimeout(()=>setToast(null),2200); };

  // safe get
  const getItem = (i:number) => backpack[i] ?? null;
  const isExp = (item:any): item is {kind:"exp";quality:BladeQualityId;count:number} => item?.kind === "exp";
  const isBlade = (item:any): item is Blade => item && !item.kind;

  /* ═══ slot handlers ═══ */
  const onSlotOver = (slot:"SUB_1"|"MAIN"|"SUB_2") => (e:React.DragEvent) => {
    e.preventDefault(); if(dragIdx===null)return;
    const item = getItem(dragIdx);
    if(!item)return; setHoverSlot(slot);
    if(isExp(item)) {
      const blade = slot==="MAIN"?equips.main:equips.sub1;
      if(!blade) { setHoverValid(false);return; }
      if(blade.quality!==item.quality) { setHoverValid(false);setHoverInfo("品质不匹配");return; }
      if(blade.level>=40) { setHoverValid(false);setHoverInfo("已满级");return; }
      const lvl = getBladeLevelConfig(blade.level);
      const cost = lvl?.expCostToNextLevel??0;
      if(item.count>=cost) { setHoverValid(true);setHoverInfo(`消耗 ${cost} 个`); }
      else { setHoverValid(false);setHoverInfo(`消耗 ${cost} 个 (不足)`); }
    } else if(isBlade(item) && item.quality!=="white") {
      setHoverValid(true);setHoverInfo(slot==="SUB_2"?"": slot==="MAIN"?"装备主刀":"装备副刀1");
    }
  };
  const onSlotDrop = (slot:"SUB_1"|"MAIN"|"SUB_2") => () => {
    if(dragIdx===null||slot==="SUB_2") { clearDrag();return; }
    const item = getItem(dragIdx);
    if(isExp(item)) {
      const blade = slot==="MAIN"?equips.main:equips.sub1;
      if(blade&&blade.quality===item.quality&&blade.level<40) {
        const lvl = getBladeLevelConfig(blade.level);
        if(lvl&&item.count>=lvl.expCostToNextLevel) {
          const r = upgradeBladeExp(blade.id);
          if(r.ok) showToast(`升级到 Lv${r.newLevel}!`); else showToast(r.reason??"失败");
          refresh();
        } else { showToast("经验不足"); }
      } else if(blade&&blade.level>=40) { showToast("已满级"); }
      else if(blade) { showToast("需要同品质经验球"); }
    } else if(isBlade(item)&&item.quality!=="white") {
      equipBladeToSlot(item.id, slot); refresh();
    }
    clearDrag();
  };

  /* ═══ backpack item handlers ═══ */
  const onItemOver = (ti:number) => (e:React.DragEvent) => {
    e.preventDefault(); if(dragIdx===null) return;
    const src = getItem(dragIdx), tgt = getItem(ti);
    if(!src||!tgt||dragIdx===ti) { setHoverItemIdx(null);return; }
    setHoverItemIdx(ti);

    // blade → blade: batch forge
    if(isBlade(src)&&isBlade(tgt)&&src.quality===tgt.quality) {
      const cfg = getForgeConfig(src.quality as BladeQualityId, src.quality as BladeQualityId);
      if(cfg) {
        const forgeable = getForgeableBlades(src.quality);
        const count = forgeable.length;
        if(count>=2) {
          const rate = getWhiteGreenForgeRate();
          setBatchIds(new Set(forgeable.map(b=>b.id)));
          setHoverValid(true);
          setHoverInfo(`合成成功率 ${Math.round(rate*100)}% · ${Math.floor(count/2)}组`);
        } else { setHoverValid(false);setHoverInfo("同品质刀不足2把"); }
      }
    }
    // exp → exp: merge (same quality, same "stack" pair)
    else if(isExp(src)&&isExp(tgt)&&src.quality===tgt.quality) {
      setHoverValid(true);setHoverInfo("经验合成");
    } else { setHoverValid(false);setHoverInfo(""); }
  };
  const onItemDrop = (ti:number) => () => {
    if(dragIdx===null) { clearDrag();return; }
    const src = getItem(dragIdx), tgt = getItem(ti);
    if(!src||!tgt) { clearDrag();return; }

    // batch blade forge
    if(isBlade(src)&&isBlade(tgt)&&src.quality===tgt.quality) {
      const forgeable = getForgeableBlades(src.quality);
      const groups = Math.floor(forgeable.length/2);
      if(groups>0) {
        let successes = 0, fails = 0;
        for(let g=0;g<groups;g++) {
          const r = forgeWhiteToGreen(undefined, undefined);
          if(r.success) successes++; else fails++;
        }
        const lines:string[] = [];
        if(successes>0) lines.push(`${bName("green")} ×${successes}`);
        if(fails>0) lines.push(`${qName("green")}经验球 ×${fails}`);
        if(lines.length>0) setModal({title:"炼器完成",lines});
        else showToast("炼器完成");
      }
      refresh();
    }
    // exp merge
    if(isExp(src)&&isExp(tgt)&&src.quality===tgt.quality) {
      const total = totalExpForQuality(src.quality);
      if(total>=2) {
        const pairs = Math.floor(total/2);
        showToast(`经验合成 ${pairs}组 (WIP)`);
        refresh();
      } else {
        showToast("需要至少2个同品质经验球");
      }
    }
    clearDrag();
  };
  const onItemLeave = () => { setHoverItemIdx(null);setBatchIds(new Set());setHoverValid(false);setHoverInfo(""); };
  const onSlotLeave = () => { setHoverSlot(null);setHoverValid(false);setHoverInfo(""); };
  const clearDrag = () => { setDragIdx(null);setHoverSlot(null);setHoverItemIdx(null);setHoverValid(false);setHoverInfo("");setBatchIds(new Set()); };

  /* ═══ render ═══ */
  const renderSlot = (slot:"SUB_1"|"MAIN"|"SUB_2") => {
    const b = slot==="MAIN"?equips.main:slot==="SUB_1"?equips.sub1:null;
    const atk = b?Math.round(computeBladeAttack(b.quality as BladeQualityId,b.level)):0;
    const hov = hoverSlot===slot;
    const border = b?qColor(b.quality):"#444";
    return (
      <div key={slot} className={`as-slot${hov?(hoverValid?" hover-valid":" hover-invalid"):""}${slot==="MAIN"?" main":slot==="SUB_2"?" locked":""}`}
        style={{borderColor: hov&&hoverValid?"#5bc0ff":border}}
        onDragOver={onSlotOver(slot)} onDragLeave={onSlotLeave} onDrop={onSlotDrop(slot)}>
        {slot==="SUB_2" ? <><div className="as-lock">🔒</div><span>副刀2 · 未开放</span></>
        : b ? <>
          <div className="as-slot-q" style={{color:border}}>{qName(b.quality)}</div>
          <div className="as-slot-name">{bName(b.quality)}</div>
          <div className="as-slot-lv">Lv.{b.level}</div>
          <div className="as-slot-atk">攻{atk}</div>
          {hov && <div className={`as-slot-hint${hoverValid?"":" invalid"}`}>{hoverInfo}</div>}
        </> : <div className="as-slot-empty">{slot==="MAIN"?"主刀":"副刀1"}</div>}
      </div>
    );
  };

  const renderItem = (item:typeof backpack[0], i:number) => {
    const drg = dragIdx===i;
    const hov = hoverItemIdx===i;
    const sel = isBlade(item) && batchIds.has(item.id);
    let cls = `as-item${drg?" dragging":""}${hov&&hoverValid?" hover-valid":hov?" hover-invalid":""}${sel?" batch-selected":""}`;
    const bc = isExp(item)?qColor(item.quality):qColor(item.quality);

    if(isExp(item)) return (
      <div key={`e${i}`} className={cls} style={{borderColor:bc}} draggable
        onDragStart={()=>setDragIdx(i)} onDragEnd={clearDrag}
        onDragOver={onItemOver(i)} onDragLeave={onItemLeave} onDrop={onItemDrop(i)}>
        <div className="as-exp-ball" style={{background:bc}}/>
        <div className="as-item-label">{qName(item.quality)}经验</div>
        <div className="as-item-count">{item.count}</div>
        {hov&&dragIdx!==i&&<div className="as-drag-hint">{hoverInfo}</div>}
      </div>
    );

    const atk = Math.round(computeBladeAttack(item.quality as BladeQualityId,item.level));
    return (
      <div key={`b${i}`} className={cls} style={{borderColor:bc}} draggable
        onDragStart={()=>setDragIdx(i)} onDragEnd={clearDrag}
        onDragOver={onItemOver(i)} onDragLeave={onItemLeave} onDrop={onItemDrop(i)}>
        <div className="as-blade-sq" style={{borderColor:bc,borderWidth:2,borderStyle:"solid"}}>⚔</div>
        <div className="as-item-label">{bName(item.quality)}</div>
        <div className="as-item-lv">Lv.{item.level} 攻{atk}</div>
        {hov&&dragIdx!==i&&<div className="as-drag-hint">{hoverInfo}</div>}
      </div>
    );
  };

  return (
    <div className="as-root">
      <div className="as-header"><button className="as-back" onClick={onBack}>←</button><h2>装备</h2></div>
      <div className="as-equip-zone">
        <div className="as-slot sub" style={{borderColor:"#5bc0ff"}} onDragOver={onSlotOver("SUB_1")} onDragLeave={onSlotLeave} onDrop={onSlotDrop("SUB_1")}>
          {equips.sub1 ? <>
            <div className="as-slot-q" style={{color:"#5bc0ff"}}>{qName(equips.sub1.quality)}</div>
            <div className="as-slot-name">{bName(equips.sub1.quality)}</div>
            <div className="as-slot-lv">Lv.{equips.sub1.level}</div>
            <div className="as-slot-atk">攻{Math.round(computeBladeAttack(equips.sub1.quality as BladeQualityId,equips.sub1.level))}</div>
          </> : <div className="as-slot-empty">副刀1</div>}
        </div>
        <div className="as-slot main" style={{borderColor:equips.main?qColor(equips.main.quality):"#5bc0ff"}} onDragOver={onSlotOver("MAIN")} onDragLeave={onSlotLeave} onDrop={onSlotDrop("MAIN")}>
          {equips.main ? <>
            <div className="as-slot-q" style={{color:qColor(equips.main.quality)}}>{qName(equips.main.quality)}</div>
            <div className="as-slot-name">{bName(equips.main.quality)}</div>
            <div className="as-slot-lv">Lv.{equips.main.level}</div>
            <div className="as-slot-atk">攻{Math.round(computeBladeAttack(equips.main.quality as BladeQualityId,equips.main.level))}</div>
          </> : <div className="as-slot-empty">主刀</div>}
        </div>
        <div className="as-slot locked" style={{borderColor:"#444"}}>
          <div className="as-lock">🔒</div><span>副刀2 · 未开放</span>
        </div>
      </div>
      <div className="as-backpack">
        <h3>背包</h3>
        <div className="as-grid">{backpack.map((item,i)=>renderItem(item,i))}
          {backpack.length===0&&<div className="as-empty">暂无物品</div>}
        </div>
      </div>
      {debug&&<div className="as-debug">
        <h4>🔧 Debug</h4>
        <button onClick={()=>{addWhiteBladeMaterial(2);refresh();}}>+2白刀</button>
        <button onClick={()=>{addWhiteBladeMaterial(10);refresh();}}>+10白刀</button>
        <button onClick={()=>{addGreenExpOrb(1);refresh();}}>+1绿经验</button>
        <button onClick={()=>{addGreenExpOrb(10);refresh();}}>+10绿经验</button>
        <button onClick={()=>{resetForgeFailCount();refresh();}}>重置概率</button>
      </div>}
      {modal&&<div className="as-modal-overlay" onClick={()=>setModal(null)}>
        <div className="as-modal" onClick={e=>e.stopPropagation()}>
          <div className="as-modal-title">{modal.title}</div>
          {modal.lines.map((l,i)=><div key={i} className="as-modal-line">{l}</div>)}
          <button className="as-modal-close" onClick={()=>setModal(null)}>确定</button>
        </div>
      </div>}
      {toast&&<div className="as-toast">{toast}</div>}
    </div>
  );
}
