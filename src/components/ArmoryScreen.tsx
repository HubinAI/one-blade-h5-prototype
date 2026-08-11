import { useState, useEffect, useRef, useCallback } from "react";
import {
  getBladeInventory, initBladeGrowthDefaults, getEquippedBladeInfo,
  equipBladeToSlot, upgradeBladeExp, getExpOrbInventory, readProgress,
} from "../game/services/ProgressionService";
import { resetForgeFailCount, getForgeRate,
  addWhiteBladeMaterial, addGreenExpOrb, mergeExpOrbs, forgeQualityBlades,
} from "../game/services/ProgressionService";
import { getBladeLevelConfig, computeBladeAttack, getForgeConfigBySource,
  QUALITY_META, type BladeQualityId } from "../game/config/bladeGrowth";
import type { Blade } from "../game/services/BladeService";
import ArmoryRewardModal, { type RewardItem } from "./ArmoryRewardModal";

/* ── from QUALITY_META ── */
function qn(q:string){ return QUALITY_META[q as BladeQualityId]?.displayName ?? q; }
function qc(q:string){ return QUALITY_META[q as BladeQualityId]?.color ?? "#888"; }
function bn(q:string){ return QUALITY_META[q as BladeQualityId]?.bladeName ?? "刀"; }
const QO:BladeQualityId[] = ["rainbow","pink","gold","red","orange","purple","blue","green","white"];

/* ── ViewModel ── */
type BpItem = Blade | {kind:"exp";quality:BladeQualityId;count:number};
function isE(i:BpItem):i is{kind:"exp";quality:BladeQualityId;count:number}{return (i as any).kind==="exp";}
function isB(i:BpItem):i is Blade{return !isE(i);}

function buildBackpack():BpItem[]{
  const inv=getBladeInventory(); const eq=getEquippedBladeInfo();
  const eIds=new Set([eq.main?.id,eq.sub1?.id].filter(Boolean));
  const orbs=getExpOrbInventory(); const items:BpItem[]=[];
  for(const q of QO){const o=orbs.find(e=>e.quality===q);if(!o||o.count<=0)continue;
    if(o.count===1)items.push({kind:"exp",quality:q as BladeQualityId,count:1});
    else{const a=Math.ceil(o.count/2),b=Math.floor(o.count/2);items.push({kind:"exp",quality:q as BladeQualityId,count:a});items.push({kind:"exp",quality:q as BladeQualityId,count:b});}}
  for(const q of QO)for(const b of inv.filter(b2=>b2.quality===q&&!eIds.has(b2.id)))items.push(b);
  return items;
}

/* ── Drag types ── */
type DragSource = {kind:"blade";bladeId:string;quality:BladeQualityId} | {kind:"exp";quality:BladeQualityId};
type DropTarget = {kind:"blade";bladeId:string;quality:BladeQualityId} | {kind:"exp";quality:BladeQualityId} | {kind:"slot";slot:"MAIN"|"SUB_1";quality?:BladeQualityId} | {kind:"none"};
type DragAction = "FORGE"|"MERGE_EXP"|"EQUIP_MAIN"|"EQUIP_SUB1"|"UPGRADE_MAIN"|"UPGRADE_SUB1"|"NONE";
type ReasonCode = "NONE"|"SAME_QUALITY_REQUIRED"|"WRONG_EXP_QUALITY"|"NO_RECIPE"|"NOT_ENOUGH_BLADES"|"NOT_ENOUGH_EXP"|"LOCKED_SLOT";
interface DragResult {action:DragAction;tooltip:string;rateDisplay:string;upgradeCost:number;upgradeCanAfford:boolean;batchIds:string[];reason:ReasonCode;}

function getSource(item:BpItem):DragSource{
  if(isE(item)) return {kind:"exp", quality:item.quality as BladeQualityId};
  return {kind:"blade", bladeId:item.id, quality:item.quality as BladeQualityId};
}

function findDropTarget(x:number,y:number):DropTarget{
  const el = document.elementFromPoint(x,y) as HTMLElement|null;
  if(!el) return {kind:"none"};
  const dE = el.closest('[data-drop-key]') as HTMLElement|null;
  if(!dE) return {kind:"none"};
  const type = dE.dataset.dropType;
  if(type==="slot"){const s=(dE.dataset.dropSlot||"MAIN")as"MAIN"|"SUB_1";const q=(dE.dataset.dropQuality||"")as BladeQualityId;return {kind:"slot",slot:s,quality:q};}
  if(type==="item"){
    const idx=parseInt(dE.dataset.itemIdx||"-1");const bp=buildBackpack();const item=bp[idx];
    if(!item) return {kind:"none"};
    if(isE(item)) return {kind:"exp",quality:item.quality as BladeQualityId};
    return {kind:"blade",bladeId:item.id,quality:item.quality as BladeQualityId};
  }
  return {kind:"none"};
}

/* ── pure drag resolver ── */
function resolveDragAction(src:DragSource,tgt:DropTarget):DragResult{
  const none = {action:"NONE"as DragAction,tooltip:"",rateDisplay:"",upgradeCost:0,upgradeCanAfford:false,batchIds:[],reason:"NONE"as ReasonCode};

  // EXP -> SLOT
  if(src.kind==="exp"&&tgt.kind==="slot"){
    const eq=getEquippedBladeInfo();const bl=tgt.slot==="MAIN"?eq.main:eq.sub1;
    if(!bl||bl.quality!==src.quality) return {...none,reason:"WRONG_EXP_QUALITY",tooltip:"需要同品质经验球"};
    if(bl.level>=40) return {...none,tooltip:"已满级"};
    const lv=getBladeLevelConfig(bl.level);const cost=lv?.expCostToNextLevel??0;
    const total=readProgress().expOrbs[src.quality]??0;const can=total>=cost;
    const act:DragAction=tgt.slot==="MAIN"?"UPGRADE_MAIN":"UPGRADE_SUB1";
    return {...none,action:act,tooltip:can?`消耗 ${cost} 个`:`消耗 ${cost} 个 (不足)`,upgradeCost:cost,upgradeCanAfford:can};
  }

  // BLADE -> SLOT
  if(src.kind==="blade"&&tgt.kind==="slot"&&src.quality!=="white"){
    const act:DragAction=tgt.slot==="MAIN"?"EQUIP_MAIN":"EQUIP_SUB1";
    return {...none,action:act,tooltip:tgt.slot==="MAIN"?"装备主刀":"装备副刀1"};
  }

  // BLADE -> BLADE
  if(src.kind==="blade"&&tgt.kind==="blade"){
    if(src.quality!==tgt.quality) return {...none, reason:"SAME_QUALITY_REQUIRED", tooltip:"相同品质才能合成"};
    const cfg=getForgeConfigBySource(src.quality);
    if(!cfg) return {...none, reason:"NO_RECIPE", tooltip:"无recipe"};
    const inv=getBladeInventory();const eq=getEquippedBladeInfo();
    const eIds=new Set([eq.main?.id,eq.sub1?.id].filter(Boolean));
    const fb=inv.filter(b=>b.quality===src.quality&&!eIds.has(b.id));
    if(fb.length<2) return {...none, reason:"NOT_ENOUGH_BLADES", tooltip:"同品质刀不足2把"};
    const rate=getForgeRate(src.quality);const groups=Math.floor(fb.length/2);
    return {...none,action:"FORGE",tooltip:`${groups}组`,rateDisplay:`成功率 ${Math.round(rate*100)}%`,batchIds:fb.map(b=>b.id)};
  }

  // EXP -> EXP
  if(src.kind==="exp"&&tgt.kind==="exp"){
    if(src.quality!==tgt.quality) return {...none, reason:"SAME_QUALITY_REQUIRED", tooltip:"相同品质才能合成"};
    const total=readProgress().expOrbs[src.quality]??0;
    if(total<2) return {...none, reason:"NOT_ENOUGH_EXP", tooltip:"需要至少2个同品质经验球"};
    const rate=getForgeRate(src.quality);
    return {...none,action:"MERGE_EXP",tooltip:"经验合成",rateDisplay:`成功率 ${Math.round(rate*100)}%`};
  }

  return none;
}

/* ═══ Component ═══ */
export default function ArmoryScreen({onBack,debug}:{onBack:()=>void;debug?:boolean}){
  const[t,setT]=useState(0);const rf=()=>setT(t=>t+1);
  useEffect(()=>{initBladeGrowthDefaults();rf();},[]);
  const eq=getEquippedBladeInfo();const bp=buildBackpack();
  const bpr=useRef<HTMLDivElement>(null);

  const srcRef=useRef<DragSource|null>(null);
  const batchIdsRef=useRef<Set<string>>(new Set());
  const resultRef=useRef<DragResult>({action:"NONE",tooltip:"",rateDisplay:"",upgradeCost:0,upgradeCanAfford:false,batchIds:[],reason:"NONE"});
  const [sTick,setST]=useState(0);
  const [ghost,setGhost]=useState<{x:number;y:number;text:string}|null>(null);
  const [rewardItems,setRewardItems]=useState<RewardItem[]|null>(null);
  const [toast,setTx]=useState<string|null>(null);
  const st=(m:string)=>{setTx(m);setTimeout(()=>setTx(null),1800);};
  const [sp,setSp]=useState<"top"|"bot">("top");

  const us=()=>{const el=bpr.current;if(!el)return;setSp(el.scrollTop+el.clientHeight>=el.scrollHeight-10?"bot":"top");};
  const sc=(d:"top"|"bot")=>{const el=bpr.current;if(!el)return;el.scrollTo({top:d==="bot"?el.scrollHeight:0,behavior:"smooth"});setTimeout(us,400);};

  const cancelDrag = useCallback(()=>{
    srcRef.current=null;batchIdsRef.current=new Set();
    resultRef.current={action:"NONE",tooltip:"",rateDisplay:"",upgradeCost:0,upgradeCanAfford:false,batchIds:[],reason:"NONE"};
    setGhost(null);setST(t=>t+1);
  },[]);

  const onPointerMove = useCallback((e:PointerEvent)=>{
    const src=srcRef.current;if(!src)return;
    setGhost(prev=>prev?{...prev,x:e.clientX,y:e.clientY}:null);
    const tgt=findDropTarget(e.clientX,e.clientY);
    if(tgt.kind==="none"){batchIdsRef.current=new Set();resultRef.current={...resultRef.current,action:"NONE",rateDisplay:"",tooltip:"",batchIds:[],reason:"NONE"};setST(t=>t+1);return;}
    const r=resolveDragAction(src,tgt);
    resultRef.current=r;batchIdsRef.current=new Set(r.batchIds);setST(t=>t+1);
  },[]);

  const onPointerUp = useCallback((e:PointerEvent)=>{
    const src=srcRef.current;if(!src){cancelDrag();return;}
    const tgt=findDropTarget(e.clientX,e.clientY);
    const r=resolveDragAction(src,tgt);

    if(r.action==="FORGE"){
      const fb=r.batchIds;
      forgeQualityBlades(src.quality);
      const items:RewardItem[]=[];
      // Collect forge results from fresh state
      const inv=getBladeInventory();const eq2=getEquippedBladeInfo();const eIds2=new Set([eq2.main?.id,eq2.sub1?.id].filter(Boolean));
      // New blades created from this forge: those not in the consumed batch and not previously equipped
      const consumedSet=new Set(fb);
      const newBlades=inv.filter(b=>b.quality===src.quality&&!eIds2.has(b.id)&&!consumedSet.has(b.id));
      for(const b of newBlades) items.push({label:bn(b.quality),quality:b.quality as BladeQualityId,isBlade:true});
      // Exp gained from fails
      const orbs=getExpOrbInventory();const failOrb=orbs.find(o=>o.quality===src.quality);
      if(failOrb&&failOrb.count>0) items.push({label:`${qn(src.quality)}经验球 ×${failOrb.count}`,quality:src.quality as BladeQualityId,isBlade:false});
      if(items.length>0) setRewardItems(items);
      rf();
    } else if(r.action==="MERGE_EXP"){
      mergeExpOrbs(src.quality);
      st("经验合成完成");
      rf();
    } else if(r.action==="EQUIP_MAIN"||r.action==="EQUIP_SUB1"){
      const slot=r.action==="EQUIP_MAIN"?"MAIN":"SUB_1";
      if(src.kind==="blade"){equipBladeToSlot(src.bladeId,slot);rf();}
    } else if(r.action==="UPGRADE_MAIN"||r.action==="UPGRADE_SUB1"){
      const bl=r.action==="UPGRADE_MAIN"?eq.main:eq.sub1;
      if(bl&&r.upgradeCanAfford){const u=upgradeBladeExp(bl.id);st(u.ok?`升级到 Lv${u.newLevel}!`:u.reason??"失败");rf();}
      else if(bl&&bl.level>=40)st("已满级");
      else if(bl)st("经验不足");
      else st("需要同品质经验球");
    } else if(r.reason==="SAME_QUALITY_REQUIRED"){
      st("相同品质才能合成");
    }
    // NONE → silent cancel
    cancelDrag();
  },[cancelDrag,rf,eq]);

  const onPointerCancel = useCallback((e:PointerEvent)=>{cancelDrag();},[cancelDrag]);

  useEffect(()=>{
    document.addEventListener("pointermove",onPointerMove);document.addEventListener("pointerup",onPointerUp);document.addEventListener("pointercancel",onPointerCancel);
    return()=>{document.removeEventListener("pointermove",onPointerMove);document.removeEventListener("pointerup",onPointerUp);document.removeEventListener("pointercancel",onPointerCancel);};
  },[onPointerMove,onPointerUp,onPointerCancel]);

  const onPointerDown = useCallback((e:React.PointerEvent)=>{
    const se=(e.target as HTMLElement).closest('.as-scroll-btn,.as-scroll-zone');if(se)return;
    const be=(e.target as HTMLElement).closest('.as-modal-overlay,.as-toast,.as-debug');if(be)return;
    const el=(e.target as HTMLElement).closest('[data-item-idx]')as HTMLElement|null;if(!el)return;
    const idx=parseInt(el.dataset.itemIdx||"-1");if(idx<0||idx>=bp.length)return;
    const item=bp[idx];if(!item)return;e.preventDefault();
    srcRef.current=getSource(item);batchIdsRef.current=new Set();
    resultRef.current={action:"NONE",tooltip:"",rateDisplay:"",upgradeCost:0,upgradeCanAfford:false,batchIds:[],reason:"NONE"};
    setST(t=>t+1);setGhost({x:e.clientX,y:e.clientY,text:isE(item)?`${qn(item.quality)}经验`:bn(item.quality)});
  },[bp]);

  const batchIds=batchIdsRef.current;const result=resultRef.current;

  const ri=(item:BpItem,i:number)=>{
    const sel=isB(item)&&batchIds?.has(item.id);
    const bc=qc(item.quality);
    const dragging=srcRef.current&&getSource(item).kind===srcRef.current.kind&&(srcRef.current.kind==="blade"?isB(item)&&srcRef.current.bladeId===item.id:srcRef.current.quality===item.quality);
    const cls=`as-item${dragging?" dragging":""}${sel?" batch-selected":""}`;
    if(isE(item))return(<div key={`e${i}`}className={cls}style={{borderColor:bc}}data-item-idx={i}data-drop-key="true"data-drop-type="item"data-drop-quality={item.quality}><div className="as-exp-ball"style={{background:bc}}/><span className="as-item-label">{qn(item.quality)}经验</span><span className="as-item-count">{item.count}</span></div>);
    const atk=Math.round(computeBladeAttack(item.quality as BladeQualityId,item.level));
    return(<div key={`b${i}`}className={cls}style={{borderColor:bc}}data-item-idx={i}data-drop-key="true"data-drop-type="item"data-drop-quality={item.quality}><div className="as-blade-sq"style={{borderColor:bc,borderWidth:2,borderStyle:"solid"}}>⚔</div><span className="as-item-label">{bn(item.quality)}</span><span className="as-item-lv">Lv.{item.level} 攻{atk}</span></div>);
  };

  const mb=eq.main,sb=eq.sub1;
  const ma=mb?Math.round(computeBladeAttack(mb.quality as BladeQualityId,mb.level)):0;
  const sa=sb?Math.round(computeBladeAttack(sb.quality as BladeQualityId,sb.level)):0;

  return(<div className="as-root">
    {rewardItems&&<ArmoryRewardModal items={rewardItems} onClose={()=>setRewardItems(null)}/>}
    <div className="as-header"><button className="as-back"onClick={onBack}>←</button><h2>装备</h2></div>
    <div className="as-equip-zone">
      <div className="as-slot sub"style={{borderColor:sb?qc(sb.quality):"#5bc0ff"}}data-drop-key="true"data-drop-type="slot"data-drop-slot="sub1"data-drop-quality={sb?.quality??""}>
        {sb?<><div className="as-slot-q"style={{color:qc(sb.quality)}}>{qn(sb.quality)}</div><div className="as-slot-name">{bn(sb.quality)}</div><div className="as-slot-lv">Lv.{sb.level}</div><div className="as-slot-atk">攻{sa}</div></>:<div className="as-slot-empty">副刀1</div>}</div>
      <div className="as-slot main"style={{borderColor:mb?qc(mb.quality):"#ffd35a"}}data-drop-key="true"data-drop-type="slot"data-drop-slot="main"data-drop-quality={mb?.quality??""}>
        {mb?<><div className="as-slot-q"style={{color:qc(mb.quality)}}>{qn(mb.quality)}</div><div className="as-slot-name">{bn(mb.quality)}</div><div className="as-slot-lv">Lv.{mb.level}</div><div className="as-slot-atk">攻{ma}</div></>:<div className="as-slot-empty">主刀</div>}</div>
      <div className="as-slot locked"style={{borderColor:"#444"}}><div className="as-lock">🔒</div><span>副刀2 · 未开放</span></div>
    </div>
    <div className="as-backpack"ref={bpr}onScroll={us}><h3>背包</h3><div className="as-grid"onPointerDown={onPointerDown}>{bp.map((item,i)=>ri(item,i))}{bp.length===0&&<div className="as-empty">暂无物品</div>}</div></div>
    {/* Success rate badge */}
    {result.rateDisplay&&<div className="as-rate-badge">{result.rateDisplay}</div>}
    <div className="as-scroll-zone"onPointerDown={e=>e.stopPropagation()}>{sp==="top"&&<button className="as-scroll-btn"onClick={()=>sc("bot")}disabled={bp.length===0}>▼</button>}{sp==="bot"&&<button className="as-scroll-btn"onClick={()=>sc("top")}>▲</button>}</div>
    {ghost&&<div style={{position:"fixed",left:ghost.x+10,top:ghost.y+10,pointerEvents:"none",zIndex:500,padding:"4px 10px",background:"rgba(0,0,0,0.85)",color:"#ffd35a",borderRadius:6,fontSize:13,fontWeight:700}}>{ghost.text}</div>}
    {debug&&<div className="as-debug"onPointerDown={e=>e.stopPropagation()}><h4>🔧 Debug</h4><button onClick={()=>{addWhiteBladeMaterial(2);rf();}}>+2白刀</button><button onClick={()=>{addWhiteBladeMaterial(10);rf();}}>+10白刀</button><button onClick={()=>{addGreenExpOrb(1);rf();}}>+1绿经验</button><button onClick={()=>{addGreenExpOrb(10);rf();}}>+10绿经验</button><button onClick={()=>{resetForgeFailCount();rf();}}>重置概率</button></div>}
    {toast&&<div className="as-toast">{toast}</div>}
  </div>);}
