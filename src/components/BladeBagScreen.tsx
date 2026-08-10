import { useState, useEffect } from "react";
import {
  getBladeInventory, initBladeGrowthDefaults,
  getEquippedBladeInfo, getUnequippedGreenBlades,
  equipBladeToSlot, upgradeBladeExp, resetBladeExp,
  getExpOrbInventory, getWhiteGreenForgeRate,
} from "../game/services/ProgressionService";
import { getBladeQualityConfig, getBladeLevelConfig, computeBladeAttack, BLADE_QUALITY_CONFIG } from "../game/config/bladeGrowth";
import type { BladeQualityId } from "../game/config/bladeGrowth";
import type { Blade } from "../game/services/BladeService";

function showToast(text: string) {
  const el = document.getElementById("bag-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}

export default function BladeBagScreen({ onBack, onOpenForge }: { onBack: () => void; onOpenForge?: () => void }) {
  const [refresh, setRefresh] = useState(0);
  const tick = () => setRefresh(r => r + 1);

  useEffect(() => { initBladeGrowthDefaults(); tick(); }, []);

  const equips = getEquippedBladeInfo();
  const unequipped = getUnequippedGreenBlades();
  const inventory = getBladeInventory();
  const expOrbs = getExpOrbInventory();
  const greenExp = expOrbs.find(e => e.quality === "green")?.count ?? 0;
  const whiteCount = inventory.filter(b => b.quality === "white").length;

  const renderBladeCard = (blade: Blade | null, slotLabel: string, slot: "MAIN" | "SUB_1") => {
    if (!blade) return <div className="bag-team-slot main empty"><span>{slotLabel}：空</span></div>;
    const cfg = getBladeQualityConfig(blade.quality as BladeQualityId);
    const atk = Math.round(computeBladeAttack(blade.quality as BladeQualityId, blade.level));
    const lvlCfg = getBladeLevelConfig(blade.level);
    const cost = lvlCfg?.expCostToNextLevel ?? 0;
    const isMax = blade.level >= 40;

    return (
      <div className="bag-team-slot main filled" key={blade.id}>
        <span className="bag-team-quality" style={{ color: "#5bc0ff" }}>{cfg?.qualityName ?? "绿"}</span>
        <span className="bag-team-name">{blade.name}</span>
        <span className="bag-team-lv">Lv.{blade.level}</span>
        <span className="bag-team-atk">攻{atk}</span>
        <div className="bag-slot-actions">
          {!isMax && <button className="bag-btn-upgrade" onClick={() => {
            const r = upgradeBladeExp(blade.id);
            showToast(r.ok ? `升级到Lv${r.newLevel}！消耗${r.cost}经验` : (r.reason ?? "失败"));
            tick();
          }}>升级({cost}经验)</button>}
          {isMax && <span className="bag-max-tag">满级</span>}
          {blade.level > 1 && <button className="bag-btn-reset" onClick={() => {
            const r = resetBladeExp(blade.id);
            showToast(r.ok ? `重置返还${r.refunded}经验` : (r.reason ?? "失败"));
            tick();
          }}>重置</button>}
        </div>
      </div>
    );
  };

  const renderEquippableList = () => {
    if (unequipped.length === 0) return <p className="bag-empty">暂无可装备的刀</p>;
    return unequipped.map(b => {
      const atk = Math.round(computeBladeAttack(b.quality as BladeQualityId, b.level));
      return (
        <div className="bag-equip-item" key={b.id}>
          <span>青锋刀 Lv.{b.level} 攻{atk}</span>
          <div>
            <button onClick={() => { if (equipBladeToSlot(b.id, "MAIN")) { showToast(`装备到主刀槽`); tick(); } else showToast("装备失败"); }}>装备主刀</button>
            <button onClick={() => { if (equipBladeToSlot(b.id, "SUB_1")) { showToast(`装备到副刀1`); tick(); } else showToast("装备失败"); }}>装备副刀1</button>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="bag-screen">
      <div className="bag-header">
        <button className="bag-back" onClick={onBack}>← 返回</button>
        <h2>刀袋</h2>
        {onOpenForge && <button className="bag-forge-btn" onClick={onOpenForge}>炼器</button>}
      </div>

      <div className="bag-resources">
        <span>白刀胚：{whiteCount}</span>
        <span>绿经验：{greenExp}</span>
      </div>

      <div className="bag-equipment">
        <h3>装备中</h3>
        {renderBladeCard(equips.main, "主刀", "MAIN")}
        {renderBladeCard(equips.sub1, "副刀1", "SUB_1")}
        <div className="bag-team-slot sub empty"><span>副刀2：🔒 未开放</span></div>
      </div>

      <div className="bag-unequipped">
        <h3>未装备</h3>
        {renderEquippableList()}
      </div>

      <div id="bag-toast" className="bag-toast"/>
    </div>
  );
}
