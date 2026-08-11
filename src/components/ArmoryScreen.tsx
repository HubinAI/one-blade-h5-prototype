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

/* ── 真实品质色 (修复: 绿色必须是绿色) ── */
const QN:Record<string,string>={white:"白色",green:"绿色",blue:"蓝色",purple:"紫色",orange:"橙色",red:"红色",gold:"金色",pink:"粉色",rainbow:"彩色"};
const BN:Record<string,string>={white:"凡铁刀胚",green:"青锋刀",blue:"玄锋刀",purple:"灵霄刀",orange:"镇岳刀",red:"赤霄刀",gold:"天罡刀",pink:"太虚刀",rainbow:"开天刀"};
const QC:Record<string,string>={
  white:"#d0d0d0",   // 浅灰
  green:"#4ade80",   // 真正的绿色
  blue:"#60a5fa",    // 蓝色
  purple:"#c084fc",  // 紫色
  orange:"#fb923c",  // 橙色
  red:"#f87171",     // 红色
  gold:"#fbbf24",    // 金色
  pink:"#f472b6",    // 粉色
  rainbow:"#5eead4"  // 青色
};
const QO:BladeQualityId[]=["rainbow","pink","gold","red","orange","purple","blue","green","white"];
function qn(q:string){return QN[q]??q;}function qc(q:string){return QC[q]??"#888";}function bn(q:string){return BN[q]??"刀";}

/* ── backpack ── */
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

/* ── pure action resolver ── */
type DragAction = "FORGE"|"MERGE_EXP"|"EQUIP_MAIN"|"EQUIP_SUB1"|"UPGRADE_MAIN"|"UPGRADE_SUB1"|"NONE";
interface DragSession {
  sourceIdx: number;
  sourceQuality: string;
  sourceType: "blade"|"exp";
  action: DragAction;
  batchIds: string[];
  hoveredItemIdx: number;  // 当前鼠标所在的item index, -1 = 非item
  hoveredSlot: string;     // 当前鼠标所在的slot, "" = 无
  targetQuality: string;
  upgradeCost: number;
  upgradeCanAfford: boolean;
  tooltip: string;
}

function resolveAction(src:BpItem|null, hoveredItemIdx:number, hoveredSlot:string, hoveredQuality:string, backpack:BpItem[], eq:{main:Blade|null,sub1:Blade|null}):DragSession{
  const empty: DragSession = { sourceIdx:-1,sourceQuality:"",sourceType:"blade",action:"NONE",batchIds:[],hoveredItemIdx:0,hoveredSlot:"",targetQuality:"",upgradeCost:0,upgradeCanAfford:false,tooltip:"" };
  if(!src) return empty;

  // 1. EXP→slot同品质刀: UPGRADE
  if(hoveredSlot && isE(src)){
    const bl = hoveredSlot==="main"?eq.main:eq.sub1;
    if(!bl) return {...empty, hoveredSlot, hoveredItemIdx, sourceType:"exp", sourceQuality:src.quality};
    if(bl.quality!==src.quality) return {...empty, hoveredSlot, hoveredItemIdx, sourceType:"exp", sourceQuality:src.quality, tooltip:"品质不匹配"};
    if(bl.level>=40) return {...empty, hoveredSlot, hoveredItemIdx, sourceType:"exp", sourceQuality:src.quality, tooltip:"已满级"};
    const lv = getBladeLevelConfig(bl.level);
    const cost = lv?.expCostToNextLevel??0;
    const can = src.count >= cost;
    const act:DragAction = hoveredSlot==="main"?"UPGRADE_MAIN":"UPGRADE_SUB1";
    return {...empty, sourceType:"exp", sourceQuality:src.quality, action:act, upgradeCost:cost, upgradeCanAfford:can, hoveredSlot, hoveredItemIdx, targetQuality:src.quality, tooltip:can?`消耗 ${cost} 个`:`消耗 ${cost} 个 (不足)`};
  }

  // 2. BLADE→slot非白: EQUIP
  if(hoveredSlot && isB(src) && src.quality!=="white"){
    const act:DragAction = hoveredSlot==="main"?"EQUIP_MAIN":"EQUIP_SUB1";
    return {...empty, sourceType:"blade", sourceQuality:src.quality, action:act, hoveredSlot, hoveredItemIdx, tooltip:hoveredSlot==="main"?"装备主刀":"装备副刀1"};
  }

  // 3. BLADE→item同品质刀: FORGE (批量)
  if(hoveredItemIdx>=0 && hoveredItemIdx<backpack.length && hoveredQuality && isB(src) && src.quality===hoveredQuality){
    const cfg = getForgeConfig(src.quality as BladeQualityId, src.quality as BladeQualityId);
    if(!cfg) return {...empty, hoveredItemIdx, sourceType:"blade", sourceQuality:src.quality, tooltip:"无recipe"};
    const fb = getUnequippedBlades(src.quality);
    if(fb.length<2) return {...empty, hoveredItemIdx, sourceType:"blade", sourceQuality:src.quality, tooltip:"同品质刀不足2把"};
    const rate = getWhiteGreenForgeRate();
    const groups = Math.floor(fb.length/2);
    return {...empty, sourceType:"blade", sourceQuality:src.quality, action:"FORGE", batchIds:fb.map(b=>b.id), hoveredItemIdx, targetQuality:src.quality, tooltip:`合成成功率 ${Math.round(rate*100)}% · ${groups}组`};
  }

  // 4. EXP→item同品质经验: MERGE_EXP
  if(hoveredItemIdx>=0 && hoveredItemIdx<backpack.length && hoveredQuality && isE(src) && src.quality===hoveredQuality){
    const total = readProgress().expOrbs[src.quality]??0;
    if(total<2) return {...empty, hoveredItemIdx, sourceType:"exp", sourceQuality:src.quality, tooltip:"需要至少2个同品质经验球"};
    return {...empty, sourceType:"exp", sourceQuality:src.quality, action:"MERGE_EXP", hoveredItemIdx, targetQuality:src.quality, tooltip:"经验合成"};
  }

  return {...empty, hoveredItemIdx, hoveredSlot, sourceType:isE(src)?"exp":"blade", sourceQuality:isE(src)?src.quality:isB(src)?src.quality:""};
}

/* ═══ Component ═══ */
export default function ArmoryScreen({onBack,debug}:{onBack:()=>void;debug?:boolean}){
  const[t,setT]=useState(0); const rf=()=>setT(t=>t+1);
  useEffect(()=>{initBladeGrowthDefaults();rf();},[]);
  const eq=getEquippedBladeInfo(); const bp=buildBackpack();
  const bpr=useRef<HTMLDivElement>(null);
  const sessionRef=useRef<DragSession|null>(null);
  const [sessionTick,setSessionTick]=useState(0);
  const [ghost,setGhost]=useState<{x:number;y:number;text:string}|null>(null);
  const [modal,setModal]=useState<{title:string;lines:string[]}|null>(null);
  const [toast,setTx]=useState<string|null>(null);
  const st=(m:string)=>{setTx(m);setTimeout(()=>setTx(null),2200);};
  const [sp,setSp]=useState<"top"|"bot">("top");

  const us=()=>{const el=bpr.current;if(!el)return;setSp(el.scrollTop+el.clientHeight>=el.scrollHeight-10?"bot":"top");};
  const sc=(d:"top"|"bot")=>{const el=bpr.current;if(!el)return;el.scrollTo({top:d==="bot"?el.scrollHeight:0,behavior:"smooth"});setTimeout(us,400);};

  const findTarget = useCallback((x:number,y:number):{itemIdx:number, slot:string, quality:string, type:string}=>{
    const el = document.elementFromPoint(x,y) as HTMLElement|null;
    if(!el) return {itemIdx:-1,slot:"",quality:"",type:""};
    const dropEl = el.closest('[data-drop-key]') as HTMLElement|null;
    if(!dropEl) return {itemIdx:-1,slot:"",quality:"",type:""};
    return {
      itemIdx: parseInt(dropEl.dataset.itemIdx||"-1"),
      slot: dropEl.dataset.dropSlot||"",
      quality: dropEl.dataset.dropQuality||"",
      type: dropEl.dataset.dropType||"",
    };
  },[]);

  const updateSession = useCallback((x:number,y:number)=>{
    const s = sessionRef.current;
    if(!s) return;
    const tgt = findTarget(x,y);
    const src = bp[s.sourceIdx];
    const result = resolveAction(src, tgt.itemIdx, tgt.slot, tgt.quality, bp, eq);
    sessionRef.current = {...result, sourceIdx:s.sourceIdx};
    setSessionTick(t=>t+1);
  },[bp,eq,findTarget]);

  const commitSession = useCallback((x:number,y:number)=>{
    const s = sessionRef.current;
    if(!s) return;
    const src = bp[s.sourceIdx];
    if(s.action==="FORGE" && isB(src)){
      const r = forgeQualityBlades(src.quality as BladeQualityId);
      const lines:string[]=[];
      if(r.successes>0&&r.targetQuality)lines.push(`${qn(r.targetQuality)} ${bn(r.targetQuality)} ×${r.successes}`);
      if(r.fails>0)lines.push(`${qn(src.quality)}经验球 ×${r.fails}`);
      if(lines.length>0)setModal({title:"炼器完成",lines});
      else st("炼器完成");
      rf();
    } else if(s.action==="MERGE_EXP" && isE(src)){
      const r = mergeExpOrbs(src.quality as BladeQualityId);
      const ls:string[]=[];
      if(r.successes>0&&r.targetQuality)ls.push(`${qn(r.targetQuality)}经验球 ×${r.successes}`);
      if(r.fails>0)ls.push(`${qn(src.quality)}经验球 ×${r.fails}`);
      st(ls.length>0?ls.join(" · "):"经验合成完成");
      rf();
    } else if(s.action==="EQUIP_MAIN"||s.action==="EQUIP_SUB1"){
      const slot = s.action==="EQUIP_MAIN"?"MAIN":"SUB_1";
      if(isB(src)) { equipBladeToSlot(src.id, slot); rf(); }
    } else if(s.action==="UPGRADE_MAIN"||s.action==="UPGRADE_SUB1"){
      const bl = s.action==="UPGRADE_MAIN"?eq.main:eq.sub1;
      if(bl&&s.upgradeCanAfford){
        const r = upgradeBladeExp(bl.id);
        st(r.ok?`升级到 Lv${r.newLevel}!`:r.reason??"失败");
        rf();
      } else if(bl&&bl.level>=40) st("已满级");
      else if(bl) st("经验不足");
      else st("需要同品质经验球");
    }
    // cancel: 不做任何消耗
  },[bp,eq]);

  // Document-level event listeners (because setPointerCapture routes events to captured element, not as-root)
  useEffect(() => {
    const onMove = (e:PointerEvent) => {
      if(!sessionRef.current) return;
      setGhost(prev=>prev?{...prev,x:e.clientX,y:e.clientY}:null);
      updateSession(e.clientX, e.clientY);
    };
    const onUp = (e:PointerEvent) => {
      if(!sessionRef.current) return;
      commitSession(e.clientX, e.clientY);
      sessionRef.current = null;
      setGhost(null);
      setSessionTick(t=>t+1);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [updateSession, commitSession]);

  const onPointerDown = useCallback((e:React.PointerEvent) => {
    // 检查是否在 scroll-btn 或 scroll-zone 上 - 这些不应该启动拖拽
    const scrollEl = (e.target as HTMLElement).closest('.as-scroll-btn,.as-scroll-zone');
    if(scrollEl) return;
    // 检查是否在 modal/toast 上
    const blockedEl = (e.target as HTMLElement).closest('.as-modal-overlay,.as-toast,.as-debug');
    if(blockedEl) return;

    const el = (e.target as HTMLElement).closest('[data-item-idx]') as HTMLElement|null;
    if(!el) return;
    const idx = parseInt(el.dataset.itemIdx||"-1");
    if(idx<0||idx>=bp.length) return;
    const src = bp[idx];
    if(!src) return;

    e.preventDefault();
    const newSession:DragSession = {
      sourceIdx:idx, sourceQuality:isE(src)?src.quality:isB(src)?src.quality:"",
      sourceType:isE(src)?"exp":"blade", action:"NONE", batchIds:[],
      hoveredItemIdx:-1, hoveredSlot:"", targetQuality:"",
      upgradeCost:0, upgradeCanAfford:false, tooltip:"",
    };
    sessionRef.current = newSession;
    setSessionTick(t=>t+1);
    setGhost({x:e.clientX,y:e.clientY,text:isE(src)?`${qn(src.quality)}经验`:bn(src.quality)});
  },[bp]);

  const session = sessionRef.current;

  const ri = (item:BpItem,i:number)=>{
    const sel = isB(item) && session?.batchIds?.includes(item.id);
    const bc = qc(item.quality);
    const cls = `as-item${session?.sourceIdx===i?" dragging":""}${sel?" batch-selected":""}`;
    if(isE(item)) return (
      <div key={`e${i}`} className={cls} style={{borderColor:bc}}
        data-item-idx={i} data-drop-key="true" data-drop-type="item" data-drop-quality={item.quality}>
        <div className="as-exp-ball" style={{background:bc}}/>
        <span className="as-item-label">{qn(item.quality)}经验</span>
        <span className="as-item-count">{item.count}</span>
      </div>
    );
    const atk = Math.round(computeBladeAttack(item.quality as BladeQualityId,item.level));
    return (
      <div key={`b${i}`} className={cls} style={{borderColor:bc}}
        data-item-idx={i} data-drop-key="true" data-drop-type="item" data-drop-quality={item.quality}>
        <div className="as-blade-sq" style={{borderColor:bc,borderWidth:2,borderStyle:"solid"}}>⚔</div>
        <span className="as-item-label">{bn(item.quality)}</span>
        <span className="as-item-lv">Lv.{item.level} 攻{atk}</span>
      </div>
    );
  };

  const mb=eq.main,sb=eq.sub1;
  const ma=mb?Math.round(computeBladeAttack(mb.quality as BladeQualityId,mb.level)):0;
  const sa=sb?Math.round(computeBladeAttack(sb.quality as BladeQualityId,sb.level)):0;

  const slotHoverValid = (slot:string)=>{
    if(!session) return false;
    if(session.hoveredSlot!==slot) return false;
    if(slot==="main") return session.action==="EQUIP_MAIN"||session.action==="UPGRADE_MAIN";
    if(slot==="sub1") return session.action==="EQUIP_SUB1"||session.action==="UPGRADE_SUB1";
    return false;
  };

  return (
    <div className="as-root">
      <div className="as-header"><button className="as-back" onClick={onBack}>←</button><h2>装备</h2></div>
      <div className="as-equip-zone">
        <div className={`as-slot sub ${slotHoverValid("sub1")?"hover-valid":""}`} style={{borderColor:session && session.hoveredSlot==="sub1"?(session.action==="EQUIP_SUB1"||session.action==="UPGRADE_SUB1"?"#5bc0ff":"#444"):sb?qc(sb.quality):"#5bc0ff"}}
          data-drop-key="true" data-drop-type="slot" data-drop-slot="sub1" data-drop-quality={sb?.quality??""}>
          {sb?<><div className="as-slot-q" style={{color:qc(sb.quality)}}>{qn(sb.quality)}</div><div className="as-slot-name">{bn(sb.quality)}</div><div className="as-slot-lv">Lv.{sb.level}</div><div className="as-slot-atk">攻{sa}</div></>:<div className="as-slot-empty">副刀1</div>}
        </div>
        <div className={`as-slot main ${slotHoverValid("main")?"hover-valid":""}`} style={{borderColor:session && session.hoveredSlot==="main"?(session.action==="EQUIP_MAIN"||session.action==="UPGRADE_MAIN"?"#5bc0ff":"#444"):mb?qc(mb.quality):"#ffd35a"}}
          data-drop-key="true" data-drop-type="slot" data-drop-slot="main" data-drop-quality={mb?.quality??""}>
          {mb?<><div className="as-slot-q" style={{color:qc(mb.quality)}}>{qn(mb.quality)}</div><div className="as-slot-name">{bn(mb.quality)}</div><div className="as-slot-lv">Lv.{mb.level}</div><div className="as-slot-atk">攻{ma}</div></>:<div className="as-slot-empty">主刀</div>}
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
      <div className="as-scroll-zone" onPointerDown={(e)=>e.stopPropagation()}>
        {sp==="top"&&<button className="as-scroll-btn" onClick={()=>sc("bot")} disabled={bp.length===0}>▼</button>}
        {sp==="bot"&&<button className="as-scroll-btn" onClick={()=>sc("top")}>▲</button>}
      </div>
      {ghost&&<div style={{position:"fixed",left:ghost.x+10,top:ghost.y+10,pointerEvents:"none",zIndex:500,padding:"4px 10px",background:"rgba(0,0,0,0.85)",color:"#ffd35a",borderRadius:6,fontSize:13,fontWeight:700}}>{ghost.text}</div>}
      {debug&&<div className="as-debug" onPointerDown={(e)=>e.stopPropagation()}><h4>🔧 Debug</h4><button onClick={()=>{addWhiteBladeMaterial(2);rf();}}>+2白刀</button><button onClick={()=>{addWhiteBladeMaterial(10);rf();}}>+10白刀</button><button onClick={()=>{addGreenExpOrb(1);rf();}}>+1绿经验</button><button onClick={()=>{addGreenExpOrb(10);rf();}}>+10绿经验</button><button onClick={()=>{resetForgeFailCount();rf();}}>重置概率</button></div>}
      {modal&&<div className="as-modal-overlay" onClick={()=>setModal(null)}><div className="as-modal" onClick={e=>e.stopPropagation()}><div className="as-modal-title">{modal.title}</div>{modal.lines.map((l,i)=><div key={i} className="as-modal-line">{l}</div>)}<button className="as-modal-close" onClick={()=>setModal(null)}>确定</button></div></div>}
      {toast&&<div className="as-toast">{toast}</div>}
    </div>
  );
}