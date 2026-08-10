import { useState, useEffect } from "react";
import {
  getBladeInventory, initBladeGrowthDefaults,
  getEquippedBladeInfo, getUnequippedGreenBlades,
  equipBladeToSlot, upgradeBladeExp, resetBladeExp,
  getExpOrbInventory,
} from "../game/services/ProgressionService";
import { getBladeQualityConfig, getBladeLevelConfig, computeBladeAttack } from "../game/config/bladeGrowth";
import type { BladeQualityId } from "../game/config/bladeGrowth";
import type { Blade } from "../game/services/BladeService";

let _toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(text: string) {
  const el = document.getElementById("bag-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
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

  const renderBladeCard = (
    blade: Blade,
    slotLabel: string,
    showSlotTag: boolean,
    actions: React.ReactNode
  ) => {
    const cfg = getBladeQualityConfig(blade.quality as BladeQualityId);
    const atk = Math.round(computeBladeAttack(blade.quality as BladeQualityId, blade.level));
    const lvlCfg = getBladeLevelConfig(blade.level);
    const cost = lvlCfg?.expCostToNextLevel ?? 0;
    const isMax = blade.level >= 40;

    return (
      <div className="bbs-card" key={blade.id}>
        <div className="bbs-card-top">
          {showSlotTag && <span className="bbs-slot-tag">{slotLabel}</span>}
          <span className="bbs-quality" style={{color: "#5bc0ff"}}>{cfg?.qualityName ?? "精炼"}</span>
          <span className="bbs-name">{blade.name}</span>
        </div>
        <div className="bbs-card-mid">
          <span className="bbs-level">Lv.{blade.level}</span>
          <span className="bbs-atk">攻击 {atk}</span>
          {isMax && <span className="bbs-max">满级</span>}
        </div>
        <div className="bbs-card-actions">
          {actions}
          {!isMax && (
            <button className="bbs-btn bbs-btn-primary" onClick={() => {
              const r = upgradeBladeExp(blade.id);
              showToast(r.ok ? `升级到 Lv${r.newLevel}！消耗 ${r.cost} 经验` : (r.reason ?? "失败"));
              tick();
            }}>升级（需{isMax ? "-" : cost}经验）</button>
          )}
          {blade.level > 1 && (
            <button className="bbs-btn bbs-btn-secondary" onClick={() => {
              const r = resetBladeExp(blade.id);
              showToast(r.ok ? `重置返还 ${r.refunded} 经验` : (r.reason ?? "失败"));
              tick();
            }}>重置</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bbs-root">
      {/* 顶部 */}
      <div className="bbs-topbar">
        <button className="bbs-back" onClick={onBack}>←</button>
        <h2>刀袋</h2>
        <div className="bbs-res-bar">
          <span className="bbs-res">⚪ 白刀胚 {whiteCount}</span>
          <span className="bbs-res">🟢 绿经验 {greenExp}</span>
        </div>
      </div>

      {/* 页签 */}
      <div className="bbs-tabs">
        <span className="bbs-tab active">刀袋</span>
        {onOpenForge && <span className="bbs-tab" onClick={onOpenForge}>炼器 →</span>}
      </div>

      {/* 装备中 */}
      <div className="bbs-section">
        <h3>装备中</h3>
        {equips.main ? renderBladeCard(equips.main, "主刀", true,
          <span className="bbs-tag-main">● 主刀</span>
        ) : (
          <div className="bbs-card bbs-empty"><span>主刀槽：空</span></div>
        )}
        {equips.sub1 ? renderBladeCard(equips.sub1, "副刀1", true,
          <span className="bbs-tag-sub">● 副刀1</span>
        ) : (
          <div className="bbs-card bbs-empty"><span>副刀1槽：空</span></div>
        )}
        <div className="bbs-card bbs-locked">
          <span className="bbs-lock-icon">🔒</span>
          <span>副刀2 · 未开放</span>
        </div>
      </div>

      {/* 未装备 */}
      <div className="bbs-section">
        <h3>未装备 {unequipped.length > 0 ? `(${unequipped.length})` : ""}</h3>
        {unequipped.length === 0 ? (
          <div className="bbs-card bbs-empty"><span>暂无可装备的刀</span></div>
        ) : (
          unequipped.map(b => {
            const atk = Math.round(computeBladeAttack(b.quality as BladeQualityId, b.level));
            return (
              <div className="bbs-card" key={b.id}>
                <div className="bbs-card-top">
                  <span className="bbs-quality" style={{color: "#5bc0ff"}}>精炼</span>
                  <span className="bbs-name">{b.name}</span>
                </div>
                <div className="bbs-card-mid">
                  <span className="bbs-level">Lv.{b.level}</span>
                  <span className="bbs-atk">攻击 {atk}</span>
                </div>
                <div className="bbs-card-actions">
                  <button className="bbs-btn bbs-btn-primary" onClick={() => {
                    if (equipBladeToSlot(b.id, "MAIN")) { showToast("装备到主刀槽"); tick(); }
                    else showToast("装备失败");
                  }}>装备主刀</button>
                  <button className="bbs-btn bbs-btn-secondary" onClick={() => {
                    if (equipBladeToSlot(b.id, "SUB_1")) { showToast("装备到副刀1"); tick(); }
                    else showToast("装备失败");
                  }}>装备副刀1</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div id="bag-toast" className="bbs-toast"/>
    </div>
  );
}
