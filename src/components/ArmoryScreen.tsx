import { useState, useEffect, useRef, useCallback } from "react";
import {
  getBladeInventory, initBladeGrowthDefaults, getEquippedBladeInfo,
  equipBladeToSlot, upgradeBladeExp, getExpOrbInventory, readProgress,
} from "../game/services/ProgressionService";
import { getWhiteGreenForgeRate, resetForgeFailCount,
  addWhiteBladeMaterial, addGreenExpOrb, mergeExpOrbs, forgeQualityBlades,
} from "../game/services/ProgressionService";
import { getBladeLevelConfig, computeBladeAttack, getForgeConfig } from "../game/config/bladeGrowth";
import type { BladeQualityId } from "../game/config/bladeGrowth";
import type { Blade } from "../game/services/BladeService";

/* ── metadata ── */
const QN:Record<string,string>={white:"白色",green:"绿色",blue:"蓝色",purple:"紫色",orange:"橙色",red:"红色",gold:"金色",pink:"粉色",rainbow:"彩色"};
const BN:Record<string,string>={white:"凡铁刀胚",green:"青锋刀",blue:"玄锋刀",purple:"灵霄刀",orange:"镇岳刀",red:"赤霄刀",gold:"天罡刀",pink:"太虚刀",rainbow:"开天刀"};
const QC:Record<string,string>={white:"#ccc",green:"#5bc0ff",blue:"#5b7fff",purple:"#b58cff",orange:"#f6a623",red:"#f05050",gold:"#ffd35a",pink:"#ff80b0",rainbow:"#80ffd0"};
const QO:BladeQualityId[]=["rainbow","pink","gold","red","orange","purple","blue","green","white"];
function qn(q:string){return QN[q]??q;}function qc(q:string){return QC[q]??"#888";}function bn(q:string){return BN[q]??"刀";}

/* ── backpack item types ── */
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

function getUnequippedBlades(quality:string):Blade[]{
  const inv=getBladeInventory(); const eq=getEquippedBladeInfo();
  const eIds=new Set([eq.main?.id,eq.sub1?.id].filter(Boolean));
  return inv.filter(b=>b.quality===quality&&!eIds.has(b.id));
}

/* ── pure action resolver (testable) ── */
type DragAction = "FORGE"|"MERGE_EXP"|"EQUIP_MAIN"|"EQUIP_SUB1"|"UPGRADE_MAIN"|"UPGRADE_SUB1"|"NONE";
interface DragSession {
  sourceIdx: number;
  action: DragAction;
  batchIds: string[];
  targetQuality: string;
  upgradeCost: number;
  upgradeCanAfford: boolean;
  tooltip: string;
  committed: boolean;
}

function resolveAction(
  src:BpItem|null, tgtType:string|null, tgtQuality:string|null, tgtSlot:string|null,
  backpack:BpItem[], equips:{main:Blade|null,sub1:Blade|null}
):DragSession{
  const empty: DragSession = { sourceIdx:-1, action:"NONE", batchIds:[], targetQuality:"", upgradeCost:0, upgradeCanAfford:false, tooltip:"", committed:false };
  if(!src) return empty;

  // exp→equip slot: upgrade
  if(tgtType==="slot" && tgtSlot && isE(src)){
    const bl = tgtSlot==="main"?equips.main:equips.sub1;
    if(!bl) return empty;
    if(bl.quality!==src.quality) return {...empty, tooltip:"品质不匹配"};
    if(bl.level>=40) return {...empty, tooltip:"已满级"};
    const lv = getBladeLevelConfig(bl.level);
    const cost = lv?.expCostToNextLevel??0;
    const can = src.count >= cost;
    const act:DragAction = tgtSlot==="main"?"UPGRADE_MAIN":"UPGRADE_SUB1";
    return {...empty, action:act, upgradeCost:cost, upgradeCanAfford:can, targetQuality:src.quality, tooltip:can?`消耗 ${cost} 个`:`消耗 ${cost} 个 (不足)`};
  }

  // blade→equip slot: equip
  if(tgtType==="slot" && tgtSlot && isB(src) && src.quality!=="white"){
    const act:DragAction = tgtSlot==="main"?"EQUIP_MAIN":"EQUIP_SUB1";
    return {...empty, action:act, tooltip:tgtSlot==="main"?"装备主刀":"装备副刀1"};
  }

  // blade→blade: forge
  if(tgtType==="item" && tgtQuality && isB(src) && src.quality===tgtQuality){
    const cfg = getForgeConfig(src.quality as BladeQualityId, src.quality as BladeQualityId);
    if(!cfg) return {...empty, tooltip:"无recipe"};
    const fb = getUnequippedBlades(src.quality);
    if(fb.length<2) return {...empty, tooltip:"同品质刀不足2把"};
    const rate = getWhiteGreenForgeRate();
    const groups = Math.floor(fb.length/2);
    return {...empty, action:"FORGE", batchIds:fb.map(b=>b.id), targetQuality:src.quality, tooltip:`合成成功率 ${Math.round(rate*100)}% · ${groups}组`};
  }

  // exp→exp: merge
  if(tgtType==="item" && tgtQuality && isE(src) && src.quality===tgtQuality){
    const total = readProgress().expOrbs[src.quality]??0;
    if(total<2) return {...empty, tooltip:"需要至少2个同品质经验球"};
    return {...empty, action:"MERGE_EXP", targetQuality:src.quality, tooltip:"经验合成"};
  }

  return empty;
}

/* ── commit helpers ── */
function commitForge(quality:string):{title:string;lines:string[]}{
  const r = forgeQualityBlades(quality as BladeQualityId);
  const lines:string[]=[];
  if(r.successes>0&&r.targetQuality) lines.push(`${qn(r.targetQuality)} ${bn(r.targetQuality)} ×${r.successes}`);
  if(r.fails>0) lines.push(`${qn(quality)}经验球 ×${r.fails}`);
  return {title:"炼器完成",lines};
}

function commitMerge(quality:string, refresh:()=>void):string|null{
  const r = mergeExpOrbs(quality as BladeQualityId);
  if(r.pairs>0){
    const ls:string[]=[];
    if(r.successes>0&&r.targetQuality)ls.push(`${qn(r.targetQuality)}经验球 ×${r.successes}`);
    if(r.fails>0)ls.push(`${qn(quality)}经验球 ×${r.fails}`);
    return ls.length>0?ls.join(" · "):"经验合成完成";
  }
  return "需要至少2个同品质经验球";
}

/* ═══ Component ═══ */
export default function ArmoryScreen({onBack,debug}:{onBack:()=>void;debug?:boolean}){
  const[t,setT]=useState(0); const rf=()=>setT(t=>t+1);
  useEffect(()=>{initBladeGrowthDefaults();rf();},[]);
  const eq=getEquippedBladeInfo(); const bp=buildBackpack();
  const bpr=useRef<HTMLDivElement>(null);
  const rootRef=useRef<HTMLDivElement>(null);

  const [session,setSession]=useState<DragSession|null>(null);
  const [ghost,setGhost]=useState<{x:number;y:number;text:string}|null>(null);
  const [modal,setModal]=useState<{title:string;lines:string[]}|null>(null);
  const [toast,setTx]=useState<string|null>(null);
  const st=(m:string)=>{setTx(m);setTimeout(()=>setTx(null),2200);};
  const [sp,setSp]=useState<"top"|"bot">("top");

  // scroll
  const us=()=>{const el=bpr.current;if(!el)return;setSp(el.scrollTop+el.clientHeight>=el.scrollHeight-10?"bot":"top");};
  const sc=(d:"top"|"bot")=>{const el=bpr.current;if(!el)return;el.scrollTo({top:d==="bot"?el.scrollHeight:0,behavior:"smooth"});setTimeout(us,400);};

  // Pointer Events drag system
  const onPointerDown = useCallback((e:React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest('[data-item-idx]') as HTMLElement|null;
    if(!el) return;
    const idx = parseInt(el.dataset.itemIdx||"-1");
    if(idx<0||idx>=bp.length) return;
    const src = bp[idx];
    el.setPointerCapture(e.pointerId);
    setSession({sourceIdx:idx,action:"NONE",batchIds:[],targetQuality:"",upgradeCost:0,upgradeCanAfford:false,tooltip:"",committed:false});
    setGhost({x:e.clientX, y:e.clientY, text: isE(src)?`${qn(src.quality)}经验`:bn(src.quality)});
  },[bp]);

  const onPointerMove = useCallback((e:React.PointerEvent) => {
    if(!session||session.committed) return;
    setGhost(prev=>prev?{...prev,x:e.clientX,y:e.clientY}:null);

    // Get target under pointer
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement|null;
    if(!el) return;

    const dropEl = el.closest('[data-drop-key]') as HTMLElement|null;
    if(!dropEl) { setSession({...session,action:"NONE",batchIds:[],tooltip:""}); return; }

    const tgtType = dropEl.dataset.dropType||null;
    const tgtQuality = dropEl.dataset.dropQuality||null;
    const tgtSlot = dropEl.dataset.dropSlot||null;

    const src = bp[session.sourceIdx];
    const result = resolveAction(src, tgtType, tgtQuality, tgtSlot, bp, eq);
    setSession({...result, sourceIdx:session.sourceIdx, committed:false});
  },[session,bp,eq]);

  const onPointerUp = useCallback((e:React.PointerEvent) => {
    if(!session||session.committed) { setSession(null);setGhost(null);return; }
    setGhost(null);

    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement|null;
    const dropEl = el?.closest('[data-drop-key]') as HTMLElement|null;
    const tgtType = dropEl?.dataset.dropType||null;
    const tgtSlot = dropEl?.dataset.dropSlot||null;
    const src = bp[session.sourceIdx];

    // Only commit if we have a valid resolved action
    const action = session.action;
    if(action==="NONE"||!dropEl||!src) { setSession(null); return; }

    // Commit based on action
    if(action==="FORGE" && isB(src)){
      const r = commitForge(src.quality);
      if(r.lines.length>0) setModal(r);
      else st("炼器完成");
      rf();
    } else if(action==="MERGE_EXP" && isE(src)){
      const msg = commitMerge(src.quality, rf);
      st(msg??"经验合成完成");
      rf();
    } else if(action==="EQUIP_MAIN"||action==="EQUIP_SUB1"){
      const slot = action==="EQUIP_MAIN"?"MAIN":"SUB_1";
      if(isB(src)) { equipBladeToSlot(src.id, slot); rf(); }
    } else if(action==="UPGRADE_MAIN"||action==="UPGRADE_SUB1"){
      const bl = action==="UPGRADE_MAIN"?eq.main:eq.sub1;
      if(bl&&session.upgradeCanAfford){
        const r = upgradeBladeExp(bl.id);
        st(r.ok?`升级到 Lv${r.newLevel}!`:r.reason??"失败");
        rf();
      } else if(bl&&bl.level>=40) st("已满级");
      else if(bl) st("经验不足");
      else st("需要同品质经验球");
    }

    setSession(null);
    (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  },[session,bp,eq]);

  const onPointerCancel = useCallback(() => { setSession(null); setGhost(null); },[]);

  // render
  const ri = (item:BpItem,i:number)=>{
    const sel = isB(item) && session?.batchIds?.includes(item.id);
    const bc = isE(item)?qc(item.quality):qc(item.quality);
    const cls = `as-item${session?.sourceIdx===i?" dragging":""}${sel?" batch-selected":""}`;
    if(isE(item)) return (
      <div key={`e${i}`} className={cls} style={{borderColor:bc}}
        data-item-idx={i} data-drop-key="true" data-drop-type="item" data-drop-quality={item.quality}>
        <div className="as-exp-ball" style={{background:bc}}/>
        <span className="as-item-label">{qn(item.quality)}经验</span>
        <span className="as-item-count">{item.count}</span>
        {session?.action!=="NONE" && session?.sourceIdx!==i && session?.batchIds.length===0 && <div className="as-drag-hint">{session.tooltip}</div>}
      </div>
    );
    const atk = Math.round(computeBladeAttack(item.quality as BladeQualityId,item.level));
    return (
      <div key={`b${i}`} className={cls} style={{borderColor:bc}}
        data-item-idx={i} data-drop-key="true" data-drop-type="item" data-drop-quality={item.quality}>
        <div className="as-blade-sq" style={{borderColor:bc,borderWidth:2,borderStyle:"solid"}}>⚔</div>
        <span className="as-item-label">{bn(item.quality)}</span>
        <span className="as-item-lv">Lv.{item.level} 攻{atk}</span>
        {session?.action!=="NONE" && session?.sourceIdx!==i && session?.batchIds.length===0 && <div className="as-drag-hint">{session.tooltip}</div>}
      </div>
    );
  };

  const mb=eq.main,sb=eq.sub1;
  const ma=mb?Math.round(computeBladeAttack(mb.quality as BladeQualityId,mb.level)):0;
  const sa=sb?Math.round(computeBladeAttack(sb.quality as BladeQualityId,sb.level)):0;

  return (
    <div className="as-root" ref={rootRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
      <div className="as-header"><button className="as-back" onClick={onBack}>←</button><h2>装备</h2></div>
      <div className="as-equip-zone">
        <div className="as-slot sub" style={{borderColor:sb?qc(sb.quality):"#5bc0ff"}}
          data-drop-key="true" data-drop-type="slot" data-drop-slot="sub1" data-drop-quality={sb?.quality??""}
          onPointerDown={(e)=>e.stopPropagation()}>
          {sb?<><div className="as-slot-q" style={{color:qc(sb.quality)}}>{qn(sb.quality)}</div><div className="as-slot-name">{bn(sb.quality)}</div><div className="as-slot-lv">Lv.{sb.level}</div><div className="as-slot-atk">攻{sa}</div></>:<div className="as-slot-empty">副刀1</div>}
          {session?.action==="UPGRADE_SUB1" && <div className="as-slot-hint" style={{color:session.upgradeCanAfford?"#5bc0ff":"#f05050"}}>{session.tooltip}</div>}
          {session?.action==="EQUIP_SUB1" && <div className="as-slot-hint">装备副刀1</div>}
        </div>
        <div className="as-slot main" style={{borderColor:mb?qc(mb.quality):"#ffd35a"}}
          data-drop-key="true" data-drop-type="slot" data-drop-slot="main" data-drop-quality={mb?.quality??""}
          onPointerDown={(e)=>e.stopPropagation()}>
          {mb?<><div className="as-slot-q" style={{color:qc(mb.quality)}}>{qn(mb.quality)}</div><div className="as-slot-name">{bn(mb.quality)}</div><div className="as-slot-lv">Lv.{mb.level}</div><div className="as-slot-atk">攻{ma}</div></>:<div className="as-slot-empty">主刀</div>}
          {session?.action==="UPGRADE_MAIN" && <div className="as-slot-hint" style={{color:session.upgradeCanAfford?"#5bc0ff":"#f05050"}}>{session.tooltip}</div>}
          {session?.action==="EQUIP_MAIN" && <div className="as-slot-hint">装备主刀</div>}
        </div>
        <div className="as-slot locked" style={{borderColor:"#444"}}>
          <div className="as-lock">🔒</div><span>副刀2 · 未开放</span>
        </div>
      </div>
      <div className="as-backpack" ref={bpr} onScroll={us}>
        <h3>背包</h3>
        <div className="as-grid" onPointerDown={onPointerDown}>
          {bp.map((item,i)=>ri(item,i))}
          {bp.length===0&&<div className="as-empty">暂无物品</div>}
        </div>
      </div>
      <div className="as-scroll-zone">
        {sp==="top"&&<button className="as-scroll-btn" onClick={()=>sc("bot")} disabled={bp.length===0}>▼</button>}
        {sp==="bot"&&<button className="as-scroll-btn" onClick={()=>sc("top")}>▲</button>}
      </div>
      {/* drag ghost */}
      {ghost&&<div className="as-ghost" style={{position:"fixed",left:ghost.x+10,top:ghost.y+10,pointerEvents:"none",zIndex:500,padding:"4px 10px",background:"rgba(0,0,0,0.85)",color:"#ffd35a",borderRadius:6,fontSize:13,fontWeight:700}}>{ghost.text}</div>}
      {debug&&<div className="as-debug"><h4>🔧 Debug</h4><button onClick={()=>{addWhiteBladeMaterial(2);rf();}}>+2白刀</button><button onClick={()=>{addWhiteBladeMaterial(10);rf();}}>+10白刀</button><button onClick={()=>{addGreenExpOrb(1);rf();}}>+1绿经验</button><button onClick={()=>{addGreenExpOrb(10);rf();}}>+10绿经验</button><button onClick={()=>{resetForgeFailCount();rf();}}>重置概率</button></div>}
      {modal&&<div className="as-modal-overlay" onClick={()=>setModal(null)}><div className="as-modal" onClick={e=>e.stopPropagation()}><div className="as-modal-title">{modal.title}</div>{modal.lines.map((l,i)=><div key={i} className="as-modal-line">{l}</div>)}<button className="as-modal-close" onClick={()=>setModal(null)}>确定</button></div></div>}
      {toast&&<div className="as-toast">{toast}</div>}
    </div>
  );
}
