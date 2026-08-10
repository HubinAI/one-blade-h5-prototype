import { useState, useEffect, useRef } from "react";
import {
  getBladeInventory, initBladeGrowthDefaults, getEquippedBladeInfo,
  equipBladeToSlot, upgradeBladeExp,
  getExpOrbInventory,
} from "../game/services/ProgressionService";
import { forgeWhiteToGreen, getWhiteGreenForgeRate, resetForgeFailCount,
  addWhiteBladeMaterial, addGreenExpOrb, mergeExpOrbs,
} from "../game/services/ProgressionService";
import { getBladeLevelConfig, computeBladeAttack, getForgeConfig } from "../game/config/bladeGrowth";
import type { BladeQualityId } from "../game/config/bladeGrowth";
import type { Blade } from "../game/services/BladeService";

/* ── metadata ── */
const Q_NAMES: Record<string,string> = { white:"白色",green:"绿色",blue:"蓝色",purple:"紫色",orange:"橙色",red:"红色",gold:"金色",pink:"粉色",rainbow:"彩色" };
const B_NAMES: Record<string,string> = { white:"凡铁刀胚",green:"青锋刀",blue:"玄锋刀",purple:"灵霄刀",orange:"镇岳刀",red:"赤霄刀",gold:"天罡刀",pink:"太虚刀",rainbow:"开天刀" };
const Q_COLORS: Record<string,string> = { white:"#ccc",green:"#5bc0ff",blue:"#5b7fff",purple:"#b58cff",orange:"#f6a623",red:"#f05050",gold:"#ffd35a",pink:"#ff80b0",rainbow:"#80ffd0" };
const Q_ORDER: BladeQualityId[] = ["rainbow","pink","gold","red","orange","purple","blue","green","white"];
function qName(q:string){return Q_NAMES[q]??q;}
function qColor(q:string){return Q_COLORS[q]??"#888";}
function bName(q:string){return B_NAMES[q]??"刀";}

/* ── backpack build ── */
type BpItem = Blade|{kind:"exp";quality:BladeQualityId;count:number};
function isExp(i:BpItem):i is{kind:"exp";quality:BladeQualityId;count:number}{return(i as any).kind==="exp";}
function isBlade(i:BpItem):i is Blade{return!isExp(i);}
function buildBackpack():BpItem[]{const inv=getBladeInventory();const equips=getEquippedBladeInfo();const equippedIds=new Set([equips.main?.id,equips.sub1?.id].filter(Boolean));const expOrbs=getExpOrbInventory();const items:BpItem[]=[];for(const q of Q_ORDER){const orb=expOrbs.find(e=>e.quality===q);if(!orb||orb.count<=0)continue;if(orb.count===1)items.push({kind:"exp",quality:q as BladeQualityId,count:1});else{const a=Math.ceil(orb.count/2),b=Math.floor(orb.count/2);items.push({kind:"exp",quality:q as BladeQualityId,count:a});items.push({kind:"exp",quality:q as BladeQualityId,count:b});}}for(const q of Q_ORDER)for(const b of inv.filter(b2=>b2.quality===q&&!equippedIds.has(b2.id)))items.push(b);return items;}
function getForgeableBlades(quality:string):Blade[]{const inv=getBladeInventory();const equips=getEquippedBladeInfo();const equippedIds=new Set([equips.main?.id,equips.sub1?.id].filter(Boolean));return inv.filter(b=>b.quality===quality&&!equippedIds.has(b.id));}

export default function ArmoryScreen({onBack,debug}:{onBack:()=>void;debug?:boolean}){
  const [tick,setTick]=useState(0);const refresh=()=>setTick(t=>t+1);
  useEffect(()=>{initBladeGrowthDefaults();refresh();},[]);
  const equips=getEquippedBladeInfo();const backpack=buildBackpack();
  const backpackRef=useRef<HTMLDivElement>(null);

  const [dragIdx,setDragIdx]=useState<number|null>(null);
  const [hoverSlot,setHoverSlot]=useState<string|null>(null);
  const [hoverItemIdx,setHoverItemIdx]=useState<number|null>(null);
  const [hoverValid,setHoverValid]=useState(false);
  const [hoverInfo,setHoverInfo]=useState("");
  const [batchIds,setBatchIds]=useState<Set<string>>(new Set());
  const [committed,setCommitted]=useState(false); // 0814-03.4: track valid drop
  const [scrollPos,setScrollPos]=useState<"top"|"mid"|"bot">("top");
  const [modal,setModal]=useState<{title:string;lines:string[]}|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  const showToast=(m:string)=>{setToast(m);setTimeout(()=>setToast(null),2200);};

  const getItem=(i:number)=>backpack[i]??null;
  const clearDrag=()=>{setDragIdx(null);setHoverSlot(null);setHoverItemIdx(null);setHoverValid(false);setHoverInfo("");setBatchIds(new Set());setCommitted(false);};

  const updateScrollPos=()=>{const el=backpackRef.current;if(!el)return;const m=el.scrollTop<=5?"top":el.scrollTop+el.clientHeight>=el.scrollHeight-5?"bot":"mid";setScrollPos(m);};
  const scrollTo=(dir:"top"|"bot")=>{const el=backpackRef.current;if(!el)return;el.scrollTo({top:dir==="bot"?el.scrollHeight:0,behavior:"smooth"});setTimeout(updateScrollPos,400);};

  /* ═══ slot ═══ */
  const slotOver=(s:"SUB_1"|"MAIN"|"SUB_2")=>(e:React.DragEvent)=>{e.preventDefault();if(dragIdx===null)return;const item=getItem(dragIdx);if(!item)return;setHoverSlot(s);setHoverItemIdx(null);if(s==="SUB_2"){setHoverValid(false);return;}if(isExp(item)){const b=s==="MAIN"?equips.main:equips.sub1;if(!b){setHoverValid(false);return;}if(b.quality!==item.quality){setHoverValid(false);setHoverInfo("品质不匹配");return;}if(b.level>=40){setHoverValid(false);setHoverInfo("已满级");return;}const lvl=getBladeLevelConfig(b.level);const cost=lvl?.expCostToNextLevel??0;if(item.count>=cost){setHoverValid(true);setHoverInfo(`消耗 ${cost} 个`);}else{setHoverValid(false);setHoverInfo(`消耗 ${cost} 个 (不足)`);}}else if(isBlade(item)&&item.quality!=="white"){setHoverValid(true);setHoverInfo(s==="MAIN"?"装备主刀":"装备副刀1");}};
  const slotDrop=(s:"SUB_1"|"MAIN"|"SUB_2")=>()=>{if(dragIdx===null||s==="SUB_2"){clearDrag();return;}const item=getItem(dragIdx);if(isExp(item)){const b=s==="MAIN"?equips.main:equips.sub1;if(b&&b.quality===item.quality&&b.level<40){const lvl=getBladeLevelConfig(b.level);if(lvl&&item.count>=lvl.expCostToNextLevel){const r=upgradeBladeExp(b.id);showToast(r.ok?`升级到 Lv${r.newLevel}!`:r.reason??"失败");refresh();}else showToast("经验不足");}else if(b&&b.level>=40)showToast("已满级");else if(b)showToast("需要同品质经验球");}else if(isBlade(item)&&item.quality!=="white"){equipBladeToSlot(item.id,s);refresh();}clearDrag();};
  const slotLeave=()=>{setHoverSlot(null);setHoverValid(false);setHoverInfo("");};

  /* ═══ item ═══ */
  const itemOver=(ti:number)=>(e:React.DragEvent)=>{e.preventDefault();if(dragIdx===null)return;const src=getItem(dragIdx),tgt=getItem(ti);if(!src||!tgt)return;setHoverItemIdx(ti);setHoverSlot(null);if(isBlade(src)&&isBlade(tgt)&&src.quality===tgt.quality){const fb=getForgeableBlades(src.quality);if(fb.length>=2){setBatchIds(new Set(fb.map(b=>b.id)));const rate=getWhiteGreenForgeRate();setHoverValid(true);setHoverInfo(`合成成功率 ${Math.round(rate*100)}% · ${Math.floor(fb.length/2)}组`);}else{setHoverValid(false);setHoverInfo("同品质刀不足2把");setBatchIds(new Set());}}else if(isExp(src)&&isExp(tgt)&&src.quality===tgt.quality){setHoverValid(true);setHoverInfo("经验合成");setBatchIds(new Set());}else{setHoverValid(false);setHoverInfo("");setBatchIds(new Set());}};
  const itemDrop=(ti:number)=>()=>{if(dragIdx===null){clearDrag();return;}const src=getItem(dragIdx),tgt=getItem(ti);if(!src||!tgt){clearDrag();return;}// 0814-03.4: track committed drop
    setCommitted(true);if(isBlade(src)&&isBlade(tgt)&&src.quality===tgt.quality){const fb=getForgeableBlades(src.quality);const groups=Math.floor(fb.length/2);if(groups>0){if(src.quality==="white"){let s=0,f=0;for(let g=0;g<groups;g++){const r=forgeWhiteToGreen(undefined,undefined);if(r.success)s++;else f++;}const lines:string[]=[];if(s>0)lines.push(`${qName("green")} ${bName("green")} ×${s}`);if(f>0)lines.push(`${qName("green")}经验球 ×${f}`);if(lines.length>0)setModal({title:"炼器完成",lines});else showToast("炼器完成");}else{showToast("该品质炼器待接入ForgeConfig");}}refresh();clearDrag();return;}if(isExp(src)&&isExp(tgt)&&src.quality===tgt.quality){const r=mergeExpOrbs(src.quality as BladeQualityId);if(r.pairs>0){const l:string[]=[];if(r.successes>0&&r.targetQuality)l.push(`${qName(r.targetQuality)}经验球 ×${r.successes}`);if(r.fails>0)l.push(`${qName(src.quality)}经验球 ×${r.fails}`);showToast(l.length>0?l.join(" · "):"经验合成完成");}else showToast("需要至少2个同品质经验球");refresh();clearDrag();return;}clearDrag();};
  const itemLeave=()=>{setHoverItemIdx(null);};
  const bpLeave=()=>{setBatchIds(new Set());};

  const mainBlade=equips.main,sub1Blade=equips.sub1;
  const mainAtk=mainBlade?Math.round(computeBladeAttack(mainBlade.quality as BladeQualityId,mainBlade.level)):0;
  const sub1Atk=sub1Blade?Math.round(computeBladeAttack(sub1Blade.quality as BladeQualityId,sub1Blade.level)):0;

  const ri=(item:BpItem,i:number)=>{const drg=dragIdx===i,hov=hoverItemIdx===i;const sel=isBlade(item)&&batchIds.has(item.id);const bc=isExp(item)?qColor(item.quality):qColor(item.quality);let cls=`as-item${drg?" dragging":""}${hov&&hoverValid?" hover-valid":hov&&!hoverValid?" hover-invalid":""}${sel?" batch-selected":""}`;if(isExp(item))return(<div key={`e${i}`}className={cls}style={{borderColor:bc}}draggable onDragStart={()=>{setDragIdx(i);setBatchIds(new Set());setCommitted(false);}}onDragEnd={clearDrag}onDragOver={itemOver(i)}onDragLeave={itemLeave}onDrop={itemDrop(i)}><div className="as-exp-ball"style={{background:bc}}/><span className="as-item-label">{qName(item.quality)}经验</span><span className="as-item-count">{item.count}</span>{hov&&dragIdx!==i&&<div className="as-drag-hint">{hoverInfo}</div>}</div>);const atk=Math.round(computeBladeAttack(item.quality as BladeQualityId,item.level));return(<div key={`b${i}`}className={cls}style={{borderColor:bc}}draggable onDragStart={()=>{setDragIdx(i);setBatchIds(new Set());setCommitted(false);}}onDragEnd={clearDrag}onDragOver={itemOver(i)}onDragLeave={itemLeave}onDrop={itemDrop(i)}><div className="as-blade-sq"style={{borderColor:bc,borderWidth:2,borderStyle:"solid"}}>⚔</div><span className="as-item-label">{bName(item.quality)}</span><span className="as-item-lv">Lv.{item.level} 攻{atk}</span>{hov&&dragIdx!==i&&<div className="as-drag-hint">{hoverInfo}</div>}</div>);};

  return(<div className="as-root">
    <div className="as-header"><button className="as-back"onClick={onBack}>←</button><h2>装备</h2></div>
    <div className="as-equip-zone">
      <div className={`as-slot sub${hoverSlot==="SUB_1"?(hoverValid?" hover-valid":" hover-invalid"):""}`}style={{borderColor:sub1Blade?qColor(sub1Blade.quality):"#5bc0ff"}}onDragOver={slotOver("SUB_1")}onDragLeave={slotLeave}onDrop={slotDrop("SUB_1")}>
        {sub1Blade?<><div className="as-slot-q"style={{color:qColor(sub1Blade.quality)}}>{qName(sub1Blade.quality)}</div><div className="as-slot-name">{bName(sub1Blade.quality)}</div><div className="as-slot-lv">Lv.{sub1Blade.level}</div><div className="as-slot-atk">攻{sub1Atk}</div></>:<div className="as-slot-empty">副刀1</div>}</div>
      <div className={`as-slot main${hoverSlot==="MAIN"?(hoverValid?" hover-valid":" hover-invalid"):""}`}style={{borderColor:mainBlade?qColor(mainBlade.quality):"#ffd35a"}}onDragOver={slotOver("MAIN")}onDragLeave={slotLeave}onDrop={slotDrop("MAIN")}>
        {mainBlade?<><div className="as-slot-q"style={{color:qColor(mainBlade.quality)}}>{qName(mainBlade.quality)}</div><div className="as-slot-name">{bName(mainBlade.quality)}</div><div className="as-slot-lv">Lv.{mainBlade.level}</div><div className="as-slot-atk">攻{mainAtk}</div></>:<div className="as-slot-empty">主刀</div>}</div>
      <div className="as-slot locked"style={{borderColor:"#444"}}><div className="as-lock">🔒</div><span>副刀2 · 未开放</span></div>
    </div>
    <div className="as-backpack"ref={backpackRef}onScroll={updateScrollPos}onDragLeave={bpLeave}>
      <h3>背包</h3>
      <div className="as-grid">{backpack.map((item,i)=>ri(item,i))}{backpack.length===0&&<div className="as-empty">暂无物品</div>}</div>
    </div>
    {/* scroll arrows */}
    <div className="as-scroll-btns">
      {scrollPos!=="bot"&&<button className="as-scroll-btn"onClick={()=>scrollTo("bot")}>▼</button>}
      {scrollPos!=="top"&&<button className="as-scroll-btn"onClick={()=>scrollTo("top")}>▲</button>}
    </div>
    {debug&&<div className="as-debug"><h4>🔧 Debug</h4><button onClick={()=>{addWhiteBladeMaterial(2);refresh();}}>+2白刀</button><button onClick={()=>{addWhiteBladeMaterial(10);refresh();}}>+10白刀</button><button onClick={()=>{addGreenExpOrb(1);refresh();}}>+1绿经验</button><button onClick={()=>{addGreenExpOrb(10);refresh();}}>+10绿经验</button><button onClick={()=>{resetForgeFailCount();refresh();}}>重置概率</button></div>}
    {modal&&<div className="as-modal-overlay"onClick={()=>setModal(null)}><div className="as-modal"onClick={e=>e.stopPropagation()}><div className="as-modal-title">{modal.title}</div>{modal.lines.map((l,i)=><div key={i}className="as-modal-line">{l}</div>)}<button className="as-modal-close"onClick={()=>setModal(null)}>确定</button></div></div>}
    {toast&&<div className="as-toast">{toast}</div>}
  </div>);
}
