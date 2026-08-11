import { useState, useEffect } from "react";
import { QUALITY_META, type BladeQualityId } from "../game/config/bladeGrowth";

export interface RewardItem { label: string; quality: BladeQualityId; isBlade: boolean; }

export default function ArmoryRewardModal({ entries, onClose }: { entries: RewardItem[]; onClose: () => void }) {
  const [shown, setShown] = useState(0);
  useEffect(()=>{if(entries.length===0)onClose();},[entries.length,onClose]);
  useEffect(()=>{
    if(shown>=entries.length)return;
    const t=setTimeout(()=>setShown(s=>s+1),shown===0?250:140);
    return()=>clearTimeout(t);
  },[shown,entries.length]);
  if(entries.length===0)return null;

  return(
    <div className="arm-modal-overlay" onClick={shown>=entries.length?onClose:undefined}>
      <div className="arm-modal" onClick={e=>e.stopPropagation()}>
        <div className="arm-modal-title">恭喜获得</div>
        <div className="arm-reward-grid">
          {entries.slice(0,shown).map((item,i)=>{
            const qc=QUALITY_META[item.quality]?.color??"#888";
            return(
              <div key={i} className="arm-rw-card pop-bling" style={{borderColor:qc}}>
                {item.isBlade?(
                  <span className="arm-rw-blade" style={{color:qc}}>⚔</span>
                ):(
                  <div className="arm-rw-exp" style={{borderColor:qc}}><span style={{color:qc,fontSize:9,fontWeight:900}}>EXP</span></div>
                )}
              </div>
            );
          })}
        </div>
        {shown>=entries.length&&(
          <button className="arm-modal-close" onClick={onClose}>确定</button>
        )}
      </div>
    </div>
  );
}
