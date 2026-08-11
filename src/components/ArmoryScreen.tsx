import { useState, useEffect, useRef, useCallback } from "react";
import { getBladeInventory, initBladeGrowthDefaults, getEquippedBladeInfo, equipBladeToSlot, upgradeBladeExp, getExpOrbInventory, readProgress } from "../game/services/ProgressionService";
import { resetForgeFailCount, getForgeRate, addWhiteBladeMaterial, addGreenExpOrb, mergeExpOrbs, forgeQualityBlades } from "../game/services/ProgressionService";
import { getBladeLevelConfig, computeBladeAttack, getForgeConfigBySource, QUALITY_META, type BladeQualityId } from "../game/config/bladeGrowth";
import type { Blade } from "../game/services/BladeService";
import ArmoryRewardModal, { type RewardItem } from "./ArmoryRewardModal";
import ArmoryExpRewardToast from "./ArmoryExpRewardToast";
import ItemDetailModal from "./ItemDetailModal";
import ArmoryItemIcon from "./armory/ArmoryItemIcon";

/* ── helpers ── */
function qn(q:string){return QUALITY_META[q as BladeQualityId]?.displayName??q;}
function qc(q:string){return QUALITY_META[q as BladeQualityId]?.color??"#888";}
function bn(q:string){return QUALITY_META[q as BladeQualityId]?.bladeName??"刀";}
const QO:BladeQualityId[]=["rainbow","pink","gold","red","orange","purple","blue","green","white"];
const SLOT_IDS=["MAIN","SUB_1"]as const;type SlotId=typeof SLOT_IDS[number];
function parseSlotId(raw:string|null|undefined):SlotId|null{return SLOT_IDS.includes(raw as any)?(raw as SlotId):null;}
function isSlotUnlocked(s:SlotId):boolean{if(s==="MAIN")return true;return(readProgress().highestFloor??1)>=3;}

type BpItem=Blade|{kind:"exp";quality:BladeQualityId;count:number;viewKey:string};
function isE(i:BpItem):i is{kind:"exp";quality:BladeQualityId;count:number;viewKey:string}{return(i as any).kind==="exp";}
function isB(i:BpItem):i is Blade{return!isE(i);}
function buildBackpack():BpItem[]{const inv=getBladeInventory();const eq=getEquippedBladeInfo();const eIds=new Set([eq.main?.id,eq.sub1?.id].filter(Boolean));const orbs=getExpOrbInventory();const items:BpItem[]=[];for(const q of QO){const o=orbs.find(e=>e.quality===q);if(!o||o.count<=0)continue;if(o.count===1)items.push({kind:"exp",quality:q,count:1,viewKey:`exp:${q}:0`});else{items.push({kind:"exp",quality:q,count:Math.ceil(o.count/2),viewKey:`exp:${q}:0`});items.push({kind:"exp",quality:q,count:Math.floor(o.count/2),viewKey:`exp:${q}:1`});}}for(const q of QO)for(const b of inv.filter(b2=>(b2.quality as string)===q&&!eIds.has(b2.id)))items.push(b);return items;}

type DragSource={kind:"blade";bladeId:string;quality:BladeQualityId}|{kind:"exp";quality:BladeQualityId;viewKey:string};
type DropTarget={kind:"blade";bladeId:string;quality:BladeQualityId}|{kind:"exp";quality:BladeQualityId;viewKey:string}|{kind:"slot";slot:SlotId;quality?:BladeQualityId}|{kind:"none"};
type DragAction="FORGE"|"MERGE_EXP"|"EQUIP_MAIN"|"EQUIP_SUB1"|"UPGRADE_MAIN"|"UPGRADE_SUB1"|"NONE";
type ReasonCode="NONE"|"SAME_QUALITY_REQUIRED"|"WRONG_EXP_QUALITY"|"NO_RECIPE"|"NOT_ENOUGH_BLADES"|"NOT_ENOUGH_EXP"|"LOCKED_SLOT";
interface DragResult{action:DragAction;tooltip:string;rateDisplay:string;rateX:number;rateY:number;upgradeCost:number;upgradeCanAfford:boolean;batchIds:string[];targetViewKey:string;reason:ReasonCode;targetSlot:SlotId|null;}

function getSource(item:BpItem):DragSource{if(isE(item))return{kind:"exp",quality:item.quality as BladeQualityId,viewKey:item.viewKey};return{kind:"blade",bladeId:item.id,quality:item.quality as BladeQualityId};}
function findDropTarget(x:number,y:number):DropTarget{const el=document.elementFromPoint(x,y)as HTMLElement|null;if(!el)return{kind:"none"};const dE=el.closest('[data-drop-key]')as HTMLElement|null;if(!dE)return{kind:"none"};const type=dE.dataset.dropType;if(type==="slot"){const sid=parseSlotId(dE.dataset.dropSlot);if(!sid)return{kind:"none"};const q=(dE.dataset.dropQuality||"")as BladeQualityId;return{kind:"slot",slot:sid,quality:q};}if(type==="item"){const idx=parseInt(dE.dataset.itemIdx||"-1");const bp=buildBackpack();const item=bp[idx];if(!item)return{kind:"none"};if(isE(item))return{kind:"exp",quality:item.quality as BladeQualityId,viewKey:item.viewKey};return{kind:"blade",bladeId:item.id,quality:item.quality as BladeQualityId};}return{kind:"none"};}

function resolveDragAction(src:DragSource,tgt:DropTarget,targetRect:DOMRect|null):DragResult{
  const none:DragResult={action:"NONE",tooltip:"",rateDisplay:"",rateX:0,rateY:0,upgradeCost:0,upgradeCanAfford:false,batchIds:[],targetViewKey:"",reason:"NONE",targetSlot:null};
  const rx=targetRect?targetRect.left+targetRect.width/2:0;const ry=targetRect?targetRect.top-6:0;
  if(tgt.kind==="none")return none;
  if(src.kind==="blade"&&tgt.kind==="blade"&&src.bladeId===tgt.bladeId)return none;
  if(src.kind==="exp"&&tgt.kind==="exp"&&src.viewKey===tgt.viewKey)return none;
  // Locked slot check
  if((src.kind==="blade"||src.kind==="exp")&&tgt.kind==="slot"&&!isSlotUnlocked(tgt.slot))return{...none,reason:"LOCKED_SLOT",tooltip:"未解锁"};
  if(src.kind==="exp"&&tgt.kind==="slot"){
    const eq=getEquippedBladeInfo();const bl=tgt.slot==="MAIN"?eq.main:eq.sub1;
    if(!bl||bl.quality!==src.quality)return{...none,reason:"WRONG_EXP_QUALITY",tooltip:"需要同品质经验球",rateX:rx,rateY:ry,targetSlot:tgt.slot};
    if(bl.level>=40)return{...none,tooltip:"已满级",rateX:rx,rateY:ry,targetSlot:tgt.slot};
    const lv=getBladeLevelConfig(bl.level);const cost=lv?.expCostToNextLevel??0;const total=readProgress().expOrbs[src.quality]??0;const can=total>=cost;
    const act:DragAction=tgt.slot==="MAIN"?"UPGRADE_MAIN":"UPGRADE_SUB1";
    return{...none,action:act,tooltip:can?`消耗 ${cost} 个`:`消耗 ${cost} 个 (不足)`,upgradeCost:cost,upgradeCanAfford:can,rateX:rx,rateY:ry,targetSlot:tgt.slot};
  }
  if(src.kind==="blade"&&tgt.kind==="slot"&&src.quality!=="white"){const act:DragAction=tgt.slot==="MAIN"?"EQUIP_MAIN":"EQUIP_SUB1";return{...none,action:act,tooltip:tgt.slot==="MAIN"?"装备主刀":"装备副刀1",rateX:rx,rateY:ry,targetSlot:tgt.slot};}
  if(src.kind==="blade"&&tgt.kind==="blade"){if(src.quality!==tgt.quality)return{...none,reason:"SAME_QUALITY_REQUIRED",tooltip:"相同品质才能合成",rateX:rx,rateY:ry};const cfg=getForgeConfigBySource(src.quality);if(!cfg)return{...none,reason:"NO_RECIPE",tooltip:"无recipe",rateX:rx,rateY:ry};const inv=getBladeInventory();const eq=getEquippedBladeInfo();const eIds=new Set([eq.main?.id,eq.sub1?.id].filter(Boolean));const fb=inv.filter(b=>b.quality===src.quality&&!eIds.has(b.id));if(fb.length<2)return{...none,reason:"NOT_ENOUGH_BLADES",tooltip:"同品质刀不足2把",rateX:rx,rateY:ry};const rate=getForgeRate(src.quality);const groups=Math.floor(fb.length/2);return{...none,action:"FORGE",tooltip:`${groups}组`,rateDisplay:`成功率 ${Math.round(rate*100)}%`,rateX:rx,rateY:ry,batchIds:fb.map(b=>b.id)};}
  if(src.kind==="exp"&&tgt.kind==="exp"){if(src.quality!==tgt.quality)return{...none,reason:"SAME_QUALITY_REQUIRED",tooltip:"相同品质才能合成",rateX:rx,rateY:ry};const total=readProgress().expOrbs[src.quality]??0;if(total<2)return{...none,reason:"NOT_ENOUGH_EXP",tooltip:"需要至少2个同品质经验球",rateX:rx,rateY:ry};const rate=getForgeRate(src.quality);return{...none,action:"MERGE_EXP",tooltip:"经验合成",rateDisplay:`成功率 ${Math.round(rate*100)}%`,rateX:rx,rateY:ry,targetViewKey:tgt.viewKey};}
  return none;
}

export default function ArmoryScreen({onBack,debug}:{onBack:()=>void;debug?:boolean}){
  const[t,setT]=useState(0);const rf=()=>setT(t=>t+1);
  useEffect(()=>{initBladeGrowthDefaults();rf();},[]);
  const eq=getEquippedBladeInfo();const bp=buildBackpack();const bpr=useRef<HTMLDivElement>(null);
  const srcRef=useRef<DragSource|null>(null);const batchIdsRef=useRef<Set<string>>(new Set());
  const resultRef=useRef<DragResult>({action:"NONE",tooltip:"",rateDisplay:"",rateX:0,rateY:0,upgradeCost:0,upgradeCanAfford:false,batchIds:[],targetViewKey:"",reason:"NONE",targetSlot:null});
  const startPosRef=useRef<{x:number;y:number}|null>(null);
  const[sTick,setST]=useState(0);const[ghost,setGhost]=useState<{x:number;y:number;text:string}|null>(null);
  const[rewardItems,setRewardItems]=useState<RewardItem[]|null>(null);
  const[expRewards,setExpRewards]=useState<{quality:BladeQualityId;count:number}[]|null>(null);
  const[detailItem,setDetailItem]=useState<Blade|BpItem|null>(null);
  const[toast,setTx]=useState<string|null>(null);const st=(m:string)=>{setTx(m);setTimeout(()=>setTx(null),1800);};
  const[sp,setSp]=useState<"top"|"bot">("top");
  const us=()=>{const el=bpr.current;if(!el)return;setSp(el.scrollTop+el.clientHeight>=el.scrollHeight-10?"bot":"top");};
  const sc=(d:"top"|"bot")=>{const el=bpr.current;if(!el)return;el.scrollTo({top:d==="bot"?el.scrollHeight:0,behavior:"smooth"});setTimeout(us,400);};
  const cancelDrag=useCallback(()=>{srcRef.current=null;batchIdsRef.current=new Set();startPosRef.current=null;resultRef.current={action:"NONE",tooltip:"",rateDisplay:"",rateX:0,rateY:0,upgradeCost:0,upgradeCanAfford:false,batchIds:[],targetViewKey:"",reason:"NONE",targetSlot:null};setGhost(null);setST(t=>t+1);},[]);

  const onPointerMove=useCallback((e:PointerEvent)=>{
    const src=srcRef.current;if(!src)return;const start=startPosRef.current;
    if(start&&Math.abs(e.clientX-start.x)<8&&Math.abs(e.clientY-start.y)<8)return;
    setGhost(prev=>prev?{...prev,x:e.clientX,y:e.clientY}:null);
    const tgt=findDropTarget(e.clientX,e.clientY);
    if(tgt.kind==="none"){batchIdsRef.current=new Set();resultRef.current={...resultRef.current,action:"NONE",rateDisplay:"",tooltip:"",batchIds:[],reason:"NONE",rateX:0,rateY:0,targetSlot:null};setST(t=>t+1);return;}
    const te=document.elementFromPoint(e.clientX,e.clientY)as HTMLElement|null;const dE=te?.closest('[data-drop-key]')as HTMLElement|null;const rect=dE?.getBoundingClientRect()??null;
    const r=resolveDragAction(src,tgt,rect);resultRef.current=r;batchIdsRef.current=new Set(r.batchIds);setST(t=>t+1);
  },[]);
  const onPointerUp=useCallback((e:PointerEvent)=>{
    const src=srcRef.current;const start=startPosRef.current;
    if(src&&start&&Math.abs(e.clientX-start.x)<8&&Math.abs(e.clientY-start.y)<8&&!ghost){const item=bp.find((_,i)=>src.kind==="blade"?isB(bp[i])&&bp[i].id===src.bladeId:isE(bp[i])&&bp[i].viewKey===src.viewKey);if(item){setDetailItem(item);cancelDrag();return;}}
    if(!src){cancelDrag();return;}
    const tgt=findDropTarget(e.clientX,e.clientY);const te=document.elementFromPoint(e.clientX,e.clientY)as HTMLElement|null;const dE=te?.closest('[data-drop-key]')as HTMLElement|null;const rect=dE?.getBoundingClientRect()??null;const r=resolveDragAction(src,tgt,rect);
    if(r.action==="FORGE"){const fr=forgeQualityBlades(src.quality);const items:RewardItem[]=[];for(const e of fr.rewardEntries){if(e.type==="blade")items.push({label:e.bladeName,quality:e.quality as BladeQualityId,isBlade:true});else items.push({label:`${qn(e.quality)}经验球`,quality:e.quality,isBlade:false});}if(items.length>0)setRewardItems(items);rf();}
    else if(r.action==="MERGE_EXP"){const mr=mergeExpOrbs(src.quality);const ers:{quality:BladeQualityId;count:number}[]=[];if(mr.successes>0&&mr.targetQuality)ers.push({quality:mr.targetQuality,count:mr.successes});if(mr.fails>0)ers.push({quality:src.quality,count:mr.fails});if(ers.length>0)setExpRewards(ers);rf();}
    else if(r.action==="EQUIP_MAIN"||r.action==="EQUIP_SUB1"){const slot=r.action==="EQUIP_MAIN"?"MAIN":"SUB_1";if(src.kind==="blade"){equipBladeToSlot(src.bladeId,slot);rf();}}
    else if(r.action==="UPGRADE_MAIN"||r.action==="UPGRADE_SUB1"){const bl=r.action==="UPGRADE_MAIN"?eq.main:eq.sub1;if(bl&&r.upgradeCanAfford){const u=upgradeBladeExp(bl.id);st(u.ok?`升级到 Lv${u.newLevel}!`:u.reason??"失败");rf();}else if(bl&&bl.level>=40)st("已满级");else if(bl)st("经验不足");else st("需要同品质经验球");}
    else if(r.reason==="SAME_QUALITY_REQUIRED"){st("相同品质才能合成");}
    cancelDrag();
  },[cancelDrag,rf,eq,bp,ghost]);
  const onPointerCancel=useCallback(()=>{cancelDrag();},[cancelDrag]);

  useEffect(()=>{document.addEventListener("pointermove",onPointerMove);document.addEventListener("pointerup",onPointerUp);document.addEventListener("pointercancel",onPointerCancel);return()=>{document.removeEventListener("pointermove",onPointerMove);document.removeEventListener("pointerup",onPointerUp);document.removeEventListener("pointercancel",onPointerCancel);};},[onPointerMove,onPointerUp,onPointerCancel]);
  const onPointerDown=useCallback((e:React.PointerEvent)=>{
    const se=(e.target as HTMLElement).closest('.as-scroll-btn,.as-scroll-zone');if(se)return;const be=(e.target as HTMLElement).closest('.as-modal-overlay,.as-toast,.as-debug');if(be)return;
    const el=(e.target as HTMLElement).closest('[data-item-idx]')as HTMLElement|null;if(!el)return;const idx=parseInt(el.dataset.itemIdx||"-1");if(idx<0||idx>=bp.length)return;const item=bp[idx];if(!item)return;e.preventDefault();
    srcRef.current=getSource(item);batchIdsRef.current=new Set();startPosRef.current={x:e.clientX,y:e.clientY};
    resultRef.current={action:"NONE",tooltip:"",rateDisplay:"",rateX:0,rateY:0,upgradeCost:0,upgradeCanAfford:false,batchIds:[],targetViewKey:"",reason:"NONE",targetSlot:null};setST(t=>t+1);
  },[bp]);
  const batchIds=batchIdsRef.current;const result=resultRef.current;

  const ri=(item:BpItem,i:number)=>{
    const sel=isB(item)&&batchIds?.has(item.id);const bc=qc(item.quality);
    const isSrc=srcRef.current&&getSource(item).kind===srcRef.current.kind&&(srcRef.current.kind==="blade"?isB(item)&&srcRef.current.bladeId===item.id:isE(item)&&srcRef.current.viewKey===item.viewKey);
    const cls=`as-item${isSrc?" dragging":""}${sel?" batch-selected":""}`;
    if(isE(item))return(<div key={`e${i}`}className={cls}data-item-idx={i}data-drop-key="true"data-drop-type="item"data-drop-quality={item.quality}><ArmoryItemIcon type="EXP"quality={item.quality as BladeQualityId}size="NORMAL"showExpText={true}/><span className="as-item-count">{item.count}</span></div>);
    const atk=Math.round(computeBladeAttack(item.quality as BladeQualityId,item.level));
    return(<div key={`b${i}`}className={cls}data-item-idx={i}data-drop-key="true"data-drop-type="item"data-drop-quality={item.quality}><ArmoryItemIcon type="BLADE"quality={item.quality as BladeQualityId}size="NORMAL"showLevel={true}level={item.level}showAttack={true}attack={atk}/></div>);
  };
  const mb=eq.main,sb=eq.sub1;
  const ma=mb?Math.round(computeBladeAttack(mb.quality as BladeQualityId,mb.level)):0;
  const sa=sb?Math.round(computeBladeAttack(sb.quality as BladeQualityId,sb.level)):0;
  const slotClass=(s:SlotId)=>{const ts=result.targetSlot;if(!ts||ts!==s)return"";if(result.reason==="LOCKED_SLOT")return"";if(result.action==="EQUIP_MAIN"||result.action==="EQUIP_SUB1"||result.action==="UPGRADE_MAIN"||result.action==="UPGRADE_SUB1")return" slot-glow";return"";};
  const sub1Unlocked=isSlotUnlocked("SUB_1");

  return(<div className="as-root">
    {rewardItems&&<ArmoryRewardModal entries={rewardItems} onClose={()=>setRewardItems(null)}/>}
    {expRewards&&<ArmoryExpRewardToast rewards={expRewards} onDone={()=>setExpRewards(null)}/>}
    {detailItem&&<ItemDetailModal item={detailItem} onClose={()=>setDetailItem(null)} onRefresh={()=>{rf();setDetailItem(null);}}/>}
    <div className="as-header"><button className="as-back"onClick={onBack}>←</button><h2>装备</h2></div>
    <div className="as-equip-zone-diamond">
      {/* MAIN — always unlocked */}
      <div className={`as-slot-diamond main${slotClass("MAIN")}`}data-drop-key="true"data-drop-type="slot"data-drop-slot="MAIN"data-drop-quality={mb?.quality??""}
        onClick={()=>{if(mb)setDetailItem(mb);}}>
        {mb?<ArmoryItemIcon type="BLADE"quality={mb.quality as BladeQualityId}size="LARGE"showLevel={true}level={mb.level}showAttack={true}attack={ma}/>
        :<><div className="as-slot-empty">主刀</div><span className="as-slot-hint">已解锁</span></>}
      </div>
      {/* SUB_1 — locked until floor 3 */}
      <div className={`as-slot-diamond sub1${sub1Unlocked?slotClass("SUB_1"):""}`}
        data-drop-key={sub1Unlocked?"true":undefined} data-drop-type={sub1Unlocked?"slot":undefined} data-drop-slot={sub1Unlocked?"SUB_1":undefined} data-drop-quality={sb?.quality??""}
        onClick={()=>{if(sb)setDetailItem(sb);}}>
        {sb?<ArmoryItemIcon type="BLADE"quality={sb.quality as BladeQualityId}size="NORMAL"showLevel={true}level={sb.level}showAttack={true}attack={sa}/>
        :<><div className="as-lock">🔒</div><span className="as-slot-hint">通关第3关解锁</span></>}
      </div>
      {/* SUB_2 — always locked */}
      <div className="as-slot-diamond locked">
        <div className="as-lock">🔒</div><span className="as-slot-hint">练气阶段解锁</span>
      </div>
    </div>
    <div className="as-backpack"ref={bpr}onScroll={us}><h3>背包</h3><div className="as-grid"onPointerDown={onPointerDown}>{bp.map((item,i)=>ri(item,i))}{bp.length===0&&<div className="as-empty">暂无物品</div>}</div></div>
    {result.rateDisplay&&<div className="as-rate-badge"style={{left:result.rateX,top:result.rateY-32,transform:"translate(-50%,0)"}}>{result.rateDisplay}</div>}
    <div className="as-scroll-zone"onPointerDown={e=>e.stopPropagation()}>{sp==="top"&&<button className="as-scroll-btn"onClick={()=>sc("bot")}disabled={bp.length===0}>▼</button>}{sp==="bot"&&<button className="as-scroll-btn"onClick={()=>sc("top")}>▲</button>}</div>
    {ghost&&<div style={{position:"fixed",left:ghost.x+10,top:ghost.y+10,pointerEvents:"none",zIndex:500,padding:"4px 10px",background:"rgba(0,0,0,0.85)",color:"#ffd35a",borderRadius:6,fontSize:13,fontWeight:700}}>{ghost.text}</div>}
    {debug&&<div className="as-debug"onPointerDown={e=>e.stopPropagation()}><h4>🔧 Debug</h4><button onClick={()=>{addWhiteBladeMaterial(2);rf();}}>+2白刀</button><button onClick={()=>{addWhiteBladeMaterial(10);rf();}}>+10白刀</button><button onClick={()=>{addGreenExpOrb(1);rf();}}>+1绿经验</button><button onClick={()=>{addGreenExpOrb(10);rf();}}>+10绿经验</button><button onClick={()=>{resetForgeFailCount();rf();}}>重置概率</button></div>}
    {toast&&<div className="as-toast">{toast}</div>}
  </div>);}
