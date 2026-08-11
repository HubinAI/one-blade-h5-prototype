import { QUALITY_META, type BladeQualityId, getBladeQualityConfig, computeBladeAttack, getSlotConfig } from "../game/config/bladeGrowth";
import { resetBladeExp } from "../game/services/ProgressionService";
import type { Blade } from "../game/services/BladeService";
import ArmoryItemIcon from "./armory/ArmoryItemIcon";

interface BpExpItem { kind:"exp"; quality:BladeQualityId; count:number; viewKey:string; }

interface Props { item: Blade | BpExpItem; onClose: () => void; onRefresh: () => void; }

export default function ItemDetailModal({ item, onClose, onRefresh }: Props) {
  const isBlade = !("kind" in item && item.kind === "exp");
  const quality = item.quality as BladeQualityId;
  const meta = QUALITY_META[quality];
  const bs = isBlade ? (item as Blade) : null;
  const atk = bs ? Math.round(computeBladeAttack(quality, bs.level)) : 0;
  const lvl = bs ? bs.level : 1;
  const subDmg = Math.round(atk * (getSlotConfig("SUB_1")?.damageCoeff ?? 0.28));

  const handleReset = () => { if (!bs || bs.level < 2) return; const r = resetBladeExp(bs.id); if (r.ok) onRefresh(); };

  return (
    <div className="idm-overlay" onClick={onClose}>
      <div className="idm-panel" onClick={e => e.stopPropagation()}>
        <div className="idm-header"><span className="idm-title">道具详情</span><button className="idm-close" onClick={onClose}>✕</button></div>
        <div className="idm-summary">
          <ArmoryItemIcon type={isBlade?"BLADE":"EXP"} quality={quality} size="LARGE" showExpText={!isBlade} />
          <div className="idm-info">
            <div className="idm-name">{isBlade ? (bs?.name ?? meta?.bladeName) : `${meta?.displayName}经验球`}</div>
            <div className="idm-q-lv"><span style={{color:meta?.color}}>{meta?.displayName}</span><span> Lv.{lvl}</span></div>
          </div>
          {isBlade && bs && bs.level >= 2 && <button className="idm-reset-sm" onClick={handleReset}>重置</button>}
        </div>
        <div className="idm-desc">{isBlade ? `${meta?.displayName}品质刀胚锻造而成的武器。` : `用于升级${meta?.displayName}品质装备，拖到对应装备上可提升等级。`}</div>
        {isBlade && (
          <div className="idm-props">
            <div className="idm-prop-row"><span>主刀攻击</span><span>{atk}</span></div>
            <div className="idm-prop-row"><span>刀势效率</span><span>{Math.round((getBladeQualityConfig(quality)?.mainMomentumEfficiency ?? 1) * 100)}%</span></div>
            <div className="idm-prop-row"><span>副刀伤害</span><span>{subDmg}</span></div>
            <div className="idm-prop-row"><span>副刀冷却</span><span>{getBladeQualityConfig(quality)?.subCooldown ?? 0}s</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
