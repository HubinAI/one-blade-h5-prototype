import { useState } from "react";
import {
  getBladeInventory, getExpOrbInventory,
  getWhiteGreenForgeRate, forgeWhiteToGreen, resetForgeFailCount,
  addWhiteBladeMaterial, addGreenExpOrb,
} from "../game/services/ProgressionService";
import { getForgeConfig, getBladeQualityConfig } from "../game/config/bladeGrowth";

let _ftTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(text: string) {
  const el = document.getElementById("forge-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  if (_ftTimer) clearTimeout(_ftTimer);
  _ftTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

export default function ForgeScreen({ onBack, debug }: { onBack: () => void; debug?: boolean }) {
  const [result, setResult] = useState<{ok: boolean; msg: string} | null>(null);
  const [forceSuccess, setForceSuccess] = useState(false);
  const [forceFail, setForceFail] = useState(false);
  const [_, setTick] = useState(0);
  const tick = () => setTick(t => t + 1);

  const inventory = getBladeInventory();
  const whiteCount = inventory.filter(b => b.quality === "white").length;
  const expOrbs = getExpOrbInventory();
  const greenExp = expOrbs.find(e => e.quality === "green")?.count ?? 0;
  const rate = getWhiteGreenForgeRate();
  const cfg = getForgeConfig("white", "green");
  const greenCfg = getBladeQualityConfig("green");
  const failCount = whiteCount >= 2 ? Math.round((rate - 0.8) / 0.2 * 5) / 5 : 0;

  const doForge = () => {
    if (whiteCount < 2) { setResult({ok: false, msg: "白刀胚不足，需要2把"}); return; }
    const r = forgeWhiteToGreen(forceSuccess || undefined, forceFail || undefined);
    setForceSuccess(false); setForceFail(false);
    if (r.success) {
      setResult({ok: true, msg: `炼器成功！获得 ${r.blade?.name ?? "青锋刀"} ×1`});
    } else {
      setResult({ok: false, msg: `炼器失败，获得 ${greenCfg?.qualityName ?? "绿"}经验球 ×${r.expOrbs ?? 1}`});
    }
    tick();
  };

  return (
    <div className="bbs-root">
      <div className="bbs-topbar">
        <button className="bbs-back" onClick={onBack}>←</button>
        <h2>炼器</h2>
        <div className="bbs-res-bar">
          <span className="bbs-res">⚪ 白刀胚 {whiteCount}</span>
          <span className="bbs-res">🟢 绿经验 {greenExp}</span>
        </div>
      </div>

      <div className="bbs-tabs">
        <span className="bbs-tab" onClick={onBack}>← 刀袋</span>
        <span className="bbs-tab active">炼器</span>
      </div>

      <div className="bbs-section">
        <h3>白 → 绿炼器</h3>
        <div className="forge-recipe-box">
          <div className="forge-flow">
            <span className="forge-mat">凡铁刀胚 ×2</span>
            <span className="forge-arrow">→</span>
            <span className="forge-result-item">{greenCfg?.bladeName ?? "青锋刀"}</span>
          </div>
          <div className="forge-info">
            <div className="forge-rate-line">
              当前成功率：
              <span className="forge-rate-value">{Math.round(rate * 100)}%</span>
              {rate >= 1 && <span className="forge-rate-cap"> (已达上限)</span>}
            </div>
            <div className="forge-fail-line">
              失败补偿：{greenCfg?.qualityName ?? "绿"}经验球 ×{cfg?.failureExpCount ?? 1}
            </div>
          </div>
        </div>

        <button className="bbs-btn bbs-btn-cta" onClick={doForge} disabled={whiteCount < 2}>
          炼制一次（消耗 2 白刀胚）
        </button>
      </div>

      {result && (
        <div className={`forge-result-banner ${result.ok ? "success" : "fail"}`}>
          {result.msg}
        </div>
      )}

      {debug && (
        <div className="bbs-section forge-debug-area">
          <h4>🔧 调试工具</h4>
          <div className="forge-debug-grid">
            <button className="bbs-btn bbs-btn-secondary" onClick={() => { addWhiteBladeMaterial(2); tick(); showToast("+2白刀"); }}>+2 白刀</button>
            <button className="bbs-btn bbs-btn-secondary" onClick={() => { addWhiteBladeMaterial(10); tick(); showToast("+10白刀"); }}>+10 白刀</button>
            <button className="bbs-btn bbs-btn-secondary" onClick={() => { addGreenExpOrb(1); tick(); showToast("+1绿经验"); }}>+1 经验</button>
            <button className="bbs-btn bbs-btn-secondary" onClick={() => { addGreenExpOrb(10); tick(); showToast("+10绿经验"); }}>+10 经验</button>
            <button className={`bbs-btn ${forceSuccess ? "bbs-btn-danger" : "bbs-btn-secondary"}`} onClick={() => { setForceSuccess(!forceSuccess); showToast(forceSuccess ? "取消" : "下次必成功"); }}>
              {forceSuccess ? "⏹ 取消" : "⭐ 强制成功"}
            </button>
            <button className={`bbs-btn ${forceFail ? "bbs-btn-danger" : "bbs-btn-secondary"}`} onClick={() => { setForceFail(!forceFail); showToast(forceFail ? "取消" : "下次必失败"); }}>
              {forceFail ? "⏹ 取消" : "💀 强制失败"}
            </button>
            <button className="bbs-btn bbs-btn-secondary" onClick={() => { resetForgeFailCount(); tick(); showToast("已重置概率"); }}>重置概率</button>
          </div>
        </div>
      )}

      <div id="forge-toast" className="bbs-toast"/>
    </div>
  );
}
