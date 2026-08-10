import { useState, useEffect, useRef } from "react";
import {
  getBladeInventory, initBladeGrowthDefaults, getEquippedBladeInfo,
  equipBladeToSlot, upgradeBladeExp, getExpOrbInventory,
} from "../game/services/ProgressionService";
import { getWhiteGreenForgeRate, resetForgeFailCount,
  addWhiteBladeMaterial, addGreenExpOrb, mergeExpOrbs, forgeQualityBlades,
} from "../game/services/ProgressionService";
import { getBladeLevelConfig, computeBladeAttack, getForgeConfig } from "../game/config/bladeGrowth";
import type { BladeQualityId } from "../game/config/bladeGrowth";
import type { Blade } from "../game/services/BladeService";

const QN:Record<string,string>={white:"白色",green:"绿色",blue:"蓝色",purple:"紫色",orange:"橙色",red:"红色",gold:"金色",pink:"粉色",rainbow:"彩色"};
const BN:Record<string,string>={white:"凡铁刀胚",green:"青锋刀",blue:"玄锋刀",purple:"灵霄刀",orange:"镇岳刀",red:"赤霄刀",gold:"天罡刀",pink:"太虚刀",rainbow:"开天刀"};
const QC:Record<string,string>={white:"#ccc",green:"#5bc0ff",blue:"#5b7fff",purple:"#b58cff",orange:"#f6a623",red:"#f05050",gold:"#ffd35a",pink:"#ff80b0",rainbow:"#80ffd0"};
const QO:BladeQualityId[]=["rainbow","pink","gold","red","orange","purple","blue","green","white"];
function qn(q:string){return QN[q]??q;}function qc(q:string){return QC[q]??"#888";}function bn(q:string){return BN[q]??"刀";}

type BpItem=Blade|{kind:"exp";quality:BladeQualityId;count:number};
function isE(i:BpItem):i is{kind:"exp";quality:BladeQualityId;count:number}{return(i as any).kind==="exp";}
function isB(i:BpItem):i is Blade{return!isE(i);}
function buildBp():BpItem[]{const inv=getBladeInventory();const eq=getEquippedBladeInfo();const eIds=new Set([eq.main?.id,eq.sub1?.id].filter(Boolean));const orbs=getExpOrbInventory();const items:BpItem[]=[];for(const q of QO){const o=orbs.find(e=>e.quality===q);if(!o||o.count<=0)continue;if(o.count===1)items.push({kind:"exp",quality:q as BladeQualityId,count:1});else{const a=Math.ceil(o.count/2),b=Math.floor(o.count/2);items.push({kind:"exp",quality:q as BladeQualityId,count:a});items.push({kind:"exp",quality:q as BladeQualityId,count:b});}}for(const q of QO)for(const b of inv.filter(b2=>b2.quality===q&&!eIds.has(b2.id)))items.push(b);return items;}
function getFB(quality:string):Blade[]{const inv=getBladeInventory();const eq=getEquippedBladeInfo();const eIds=new Set([eq.main?.id,eq.sub1?.id].filter(Boolean));return inv.filter(b=>b.quality===quality&&!eIds.has(b.id));}

export default function ArmoryScreen({onBack,debug}:{onBack:()=>void;debug?:boolean}){
  const[t,setT]=useState(0);const rf=()=>setT(t=>t+1);
  useEffect(()=>{initBladeGrowthDefaults();rf();},[]);
  const eq=getEquippedBladeInfo();const bp=buildBp();
  const bpr=useRef<HTMLDivElement>(null);
  const[di,setDi]=useState<number|null>(null);
  const[hs,setHs]=useState<string|null>(null);
  const[hi,setHi]=useState<number|null>(null);
  const[hv,setHv]=useState(false);const[hn,setHn]=useState("");
  const[bi,setBi]=useState<Set<string>>(new Set());
  const[sp,setSp]=useState<"top"|"bot">("top");
  const[md,setMd]=useState<{t:string;l:string[]}|null>(null);
  const[tx,setTx]=useState<string|null>(null);
  const st=(m:string)=>{setTx(m);setTimeout(()=>setTx(null),2200);};
  const gi=(i:number)=>bp[i]??null;
  const cd=()=>{setDi(null);setHs(null);setHi(null);setHv(false);setHn("");setBi(new Set());};

  const us=()=>{const el=bpr.current;if(!el)return;setSp(el.scrollTop+el.clientHeight>=el.scrollHeight-10?"bot":"top");};
  const sc=(d:"top"|"bot")=>{const el=bpr.current;if(!el)return;el.scrollTo({top:d==="bot"?el.scrollHeight:0,behavior:"smooth"});setTimeout(us,400);};

  const so=(s:"SUB_1"|"MAIN"|"SUB_2")=>(e:React.DragEvent)=>{e.preventDefault();if(di===null)return;const it=gi(di);if(!it)return;setHs(s);setHi(null);if(s==="SUB_2"){setHv(false);return;}if(isE(it)){const b=s==="MAIN"?eq.main:eq.sub1;if(!b){setHv(false);return;}if(b.quality!==it.quality){setHv(false);setHn("品质不匹配");return;}if(b.level>=40){setHv(false);setHn("已满级");return;}const lv=getBladeLevelConfig(b.level);const c=lv?.expCostToNextLevel??0;if(it.count>=c){setHv(true);setHn(`消耗 ${c} 个`);}else{setHv(false);setHn(`消耗 ${c} 个 (不足)`);}}else if(isB(it)&&it.quality!=="white"){setHv(true);setHn(s==="MAIN"?"装备主刀":"装备副刀1");}};
  const sd=(s:"SUB_1"|"MAIN"|"SUB_2")=>()=>{if(di===null||s==="SUB_2"){cd();return;}const it=gi(di);if(isE(it)){const b=s==="MAIN"?eq.main:eq.sub1;if(b&&b.quality===it.quality&&b.level<40){const lv=getBladeLevelConfig(b.level);if(lv&&it.count>=lv.expCostToNextLevel){const r=upgradeBladeExp(b.id);st(r.ok?`升级到 Lv${r.newLevel}!`:r.reason??"失败");rf();}else st("经验不足");}else if(b&&b.level>=40)st("已满级");else if(b)st("需要同品质经验球");}else if(isB(it)&&it.quality!=="white"){equipBladeToSlot(it.id,s);rf();}cd();};
  const sl=()=>{setHs(null);setHv(false);setHn("");};

  const io=(ti:number)=>(e:React.DragEvent)=>{e.preventDefault();if(di===null)return;const sr=gi(di),tg=gi(ti);if(!sr||!tg)return;setHi(ti);setHs(null);if(isB(sr)&&isB(tg)&&sr.quality===tg.quality){const fb=getFB(sr.quality);const cf=getForgeConfig(sr.quality as BladeQualityId,sr.quality as BladeQualityId);if(fb.length>=2&&cf){setBi(new Set(fb.map(b=>b.id)));const rt=getWhiteGreenForgeRate();setHv(true);setHn(`合成成功率 ${Math.round(rt*100)}% · ${Math.floor(fb.length/2)}组`);}else{setHv(false);setHn("同品质刀不足2把或无recipe");setBi(new Set());}}else if(isE(sr)&&isE(tg)&&sr.quality===tg.quality){const orb=getExpOrbInventory().find(e=>e.quality===sr.quality);if(orb&&orb.count>=2){setHv(true);setHn("经验合成");}else{setHv(false);setHn("需要至少2个同品质经验球");}setBi(new Set());}else{setHv(false);setHn("");setBi(new Set());}};
  const id=(ti:number)=>()=>{if(di===null){cd();return;}const sr=gi(di),tg=gi(ti);if(!sr||!tg){cd();return;}if(isB(sr)&&isB(tg)&&sr.quality===tg.quality){const r=forgeQualityBlades(sr.quality as BladeQualityId);if(r.pairs>0){const ls:string[]=[];if(r.successes>0&&r.targetQuality)ls.push(`${qn(r.targetQuality)} ${bn(r.targetQuality)} ×${r.successes}`);if(r.fails>0)ls.push(`${qn(sr.quality)}经验球 ×${r.fails}`);if(ls.length>0)setMd({t:"炼器完成",l:ls});else st("炼器完成");}rf();cd();return;}if(isE(sr)&&isE(tg)&&sr.quality===tg.quality){const r=mergeExpOrbs(sr.quality as BladeQualityId);if(r.pairs>0){const ls:string[]=[];if(r.successes>0&&r.targetQuality)ls.push(`${qn(r.targetQuality)}经验球 ×${r.successes}`);if(r.fails>0)ls.push(`${qn(sr.quality)}经验球 ×${r.fails}`);st(ls.length>0?ls.join(" · "):"经验合成完成");}else st("需要至少2个同品质经验球");rf();cd();return;}cd();};
  const il=()=>{setHi(null);};
  const bpl=()=>{setBi(new Set());};

  const mb=eq.main,sb=eq.sub1;
  const ma=mb?Math.round(computeBladeAttack(mb.quality as BladeQualityId,mb.level)):0;
  const sa=sb?Math.round(computeBladeAttack(sb.quality as BladeQualityId,sb.level)):0;

  const ri=(it:BpItem,i:number)=>{const d=di===i,h=hi===i;const s=isB(it)&&bi.has(it.id);const bc=isE(it)?qc(it.quality):qc(it.quality);let cls=`as-item${d?" dragging":""}${h&&hv?" hover-valid":h&&!hv?" hover-invalid":""}${s?" batch-selected":""}`;if(isE(it))return(<div key={`e${i}`}className={cls}style={{borderColor:bc}}draggable onDragStart={()=>{setDi(i);setBi(new Set());}}onDragEnd={cd}onDragOver={io(i)}onDragLeave={il}onDrop={id(i)}><div className="as-exp-ball"style={{background:bc}}/><span className="as-item-label">{qn(it.quality)}经验</span><span className="as-item-count">{it.count}</span>{h&&di!==i&&<div className="as-drag-hint">{hn}</div>}</div>);const at=Math.round(computeBladeAttack(it.quality as BladeQualityId,it.level));return(<div key={`b${i}`}className={cls}style={{borderColor:bc}}draggable onDragStart={()=>{setDi(i);setBi(new Set());}}onDragEnd={cd}onDragOver={io(i)}onDragLeave={il}onDrop={id(i)}><div className="as-blade-sq"style={{borderColor:bc,borderWidth:2,borderStyle:"solid"}}>⚔</div><span className="as-item-label">{bn(it.quality)}</span><span className="as-item-lv">Lv.{it.level} 攻{at}</span>{h&&di!==i&&<div className="as-drag-hint">{hn}</div>}</div>);};

  return(<div className="as-root">
    <div className="as-header"><button className="as-back"onClick={onBack}>←</button><h2>装备</h2></div>
    <div className="as-equip-zone">
      <div className={`as-slot sub${hs==="SUB_1"?(hv?" hover-valid":" hover-invalid"):""}`}style={{borderColor:sb?qc(sb.quality):"#5bc0ff"}}onDragOver={so("SUB_1")}onDragLeave={sl}onDrop={sd("SUB_1")}>
        {sb?<><div className="as-slot-q"style={{color:qc(sb.quality)}}>{qn(sb.quality)}</div><div className="as-slot-name">{bn(sb.quality)}</div><div className="as-slot-lv">Lv.{sb.level}</div><div className="as-slot-atk">攻{sa}</div></>:<div className="as-slot-empty">副刀1</div>}</div>
      <div className={`as-slot main${hs==="MAIN"?(hv?" hover-valid":" hover-invalid"):""}`}style={{borderColor:mb?qc(mb.quality):"#ffd35a"}}onDragOver={so("MAIN")}onDragLeave={sl}onDrop={sd("MAIN")}>
        {mb?<><div className="as-slot-q"style={{color:qc(mb.quality)}}>{qn(mb.quality)}</div><div className="as-slot-name">{bn(mb.quality)}</div><div className="as-slot-lv">Lv.{mb.level}</div><div className="as-slot-atk">攻{ma}</div></>:<div className="as-slot-empty">主刀</div>}</div>
      <div className="as-slot locked"style={{borderColor:"#444"}}><div className="as-lock">🔒</div><span>副刀2 · 未开放</span></div>
    </div>
    <div className="as-backpack"ref={bpr}onScroll={us}onDragLeave={bpl}><h3>背包</h3><div className="as-grid">{bp.map((it,i)=>ri(it,i))}{bp.length===0&&<div className="as-empty">暂无物品</div>}</div></div>
    <div className="as-scroll-zone">
      {sp==="top"&&<button className="as-scroll-btn"onClick={()=>sc("bot")}disabled={bp.length===0}>▼</button>}
      {sp==="bot"&&<button className="as-scroll-btn"onClick={()=>sc("top")}>▲</button>}
    </div>
    {debug&&<div className="as-debug"><h4>🔧 Debug</h4><button onClick={()=>{addWhiteBladeMaterial(2);rf();}}>+2白刀</button><button onClick={()=>{addWhiteBladeMaterial(10);rf();}}>+10白刀</button><button onClick={()=>{addGreenExpOrb(1);rf();}}>+1绿经验</button><button onClick={()=>{addGreenExpOrb(10);rf();}}>+10绿经验</button><button onClick={()=>{resetForgeFailCount();rf();}}>重置概率</button></div>}
    {md&&<div className="as-modal-overlay"onClick={()=>setMd(null)}><div className="as-modal"onClick={e=>e.stopPropagation()}><div className="as-modal-title">{md.t}</div>{md.l.map((l,i)=><div key={i}className="as-modal-line">{l}</div>)}<button className="as-modal-close"onClick={()=>setMd(null)}>确定</button></div></div>}
    {tx&&<div className="as-toast">{tx}</div>}
  </div>);
}
