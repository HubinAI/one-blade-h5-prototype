/** 唯一展示组件 — 背包/装备槽/奖励/详情统一Icon */
import { QUALITY_META, type BladeQualityId } from "../../game/config/bladeGrowth";

export type IconSize = "SMALL"|"NORMAL"|"LARGE";

interface Props {
  type: "BLADE"|"EXP";
  quality: BladeQualityId;
  size: IconSize;
  level?: number;
  attack?: number;
  count?: number;
  showLevel?: boolean;
  showAttack?: boolean;
  showCount?: boolean;
  showExpText?: boolean;
}

export default function ArmoryItemIcon({ type, quality, size, level, attack, count, showLevel, showAttack, showCount, showExpText }: Props) {
  const meta = QUALITY_META[quality];
  const bg = meta?.color ?? "#888";
  const dims = size==="LARGE"?{w:72,h:72,fs:36} : size==="NORMAL"?{w:48,h:48,fs:24} : {w:36,h:36,fs:18};
  const bgAlpha = `color-mix(in srgb, ${bg} 25%, #120e08)`; // 品质底+深色混合

  return (
    <div className="aii-wrap" style={{width:dims.w,height:dims.h,borderRadius:10,background:bgAlpha,border:`2px solid ${bg}`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      {type==="BLADE" ? (
        <span style={{color:bg,fontSize:dims.fs,lineHeight:1}}>⚔</span>
      ) : (
        /* EXP ball with "EXP" text */
        <div style={{width:dims.w-8,height:dims.h-8,borderRadius:"50%",background:bgAlpha,border:`2px solid ${bg}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{color:bg,fontSize:dims.fs*0.35,fontWeight:900,letterSpacing:1,lineHeight:1.1,textAlign:"center",userSelect:"none"}}>
            {showExpText?"EXP":""}
          </span>
        </div>
      )}
      {showLevel && level!==undefined && <span className="aii-lv">Lv.{level}</span>}
      {showAttack && attack!==undefined && <span className="aii-atk">攻{attack}</span>}
      {showCount && count!==undefined && count>0 && <span className="aii-cnt">{count}</span>}
    </div>
  );
}
