import { useState, useEffect } from "react";
import {
  getBladeInventory, getExpOrbInventory,
  getWhiteGreenForgeRate, forgeWhiteToGreen, resetForgeFailCount,
  addWhiteBladeMaterial, addGreenExpOrb,
} from "../game/services/ProgressionService";
import { getForgeConfig, getBladeQualityConfig } from "../game/config/bladeGrowth";

function showToast(text: string) {
  const el = document.getElementById("forge-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}

export default function ForgeScreen({ onBack, debug }: { onBack: () => void; debug?: boolean }) {
  const [result, setResult] = useState<string | null>(null);
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

  const doForge = () => {
    if (whiteCount < 2) { setResult("白刀胚不足，需要2把"); return; }
    const r = forgeWhiteToGreen(forceSuccess || undefined, forceFail || undefined);
    if (r.success) {
      setResult(`炼器成功！获得 ${r.blade?.name ?? "青锋刀"}`);
    } else {
      setResult(`炼器失败，获得 ${r.expOrbs ?? 1} 颗${greenCfg?.qualityName ?? "绿"}经验球。成功率提升至${Math.round(r.newRate * 100)}%`);
    }
    setForceSuccess(false);
    setForceFail(false);
    tick();
  };

  return (
    <div className="forge-screen">
      <div className="forge-header">
        <button className="forge-back" onClick={onBack}>← 返回</button>
        <h2>{greenCfg?.bladeName ?? "青锋刀"}炼器</h2>
      </div>

      <div className="forge-recipe">
        <div className="forge-mats">
          <span>凡铁刀胚 ×2</span>
          <span className="forge-arrow">→</span>
          <span>{greenCfg?.bladeName ?? "青锋刀"} ×1</span>
        </div>
        <div className="forge-rate">成功率：{Math.round(rate * 100)}%{rate >= 1 ? " (已达上限)" : ""}</div>
        <div className="forge-fail-reward">失败获得：{greenCfg?.qualityName ?? "绿"}经验球 ×{cfg?.failureExpCount ?? 1}</div>
      </div>

      <div className="forge-resources">
        <span>白刀胚：{whiteCount}</span>
        <span>绿经验：{greenExp}</span>
      </div>

      <button className="forge-btn" onClick={doForge} disabled={whiteCount < 2}>炼器（消耗2白刀胚）</button>

      {result && <div className="forge-result">{result}</div>}

      {debug && (
        <div className="forge-debug">
          <h4>Debug工具</h4>
          <button onClick={() => { addWhiteBladeMaterial(2); tick(); showToast("+2白刀"); }}>+2白刀</button>
          <button onClick={() => { addWhiteBladeMaterial(10); tick(); showToast("+10白刀"); }}>+10白刀</button>
          <button onClick={() => { addGreenExpOrb(1); tick(); showToast("+1绿经验"); }}>+1绿经验</button>
          <button onClick={() => { addGreenExpOrb(10); tick(); showToast("+10绿经验"); }}>+10绿经验</button>
          <button onClick={() => { setForceSuccess(!forceSuccess); showToast(forceSuccess ? "取消强制成功" : "下次炼器强制成功"); }}>{forceSuccess ? "⏹取消强制成功" : "⭐强制成功"}</button>
          <button onClick={() => { setForceFail(!forceFail); showToast(forceFail ? "取消强制失败" : "下次炼器强制失败"); }}>{forceFail ? "⏹取消强制失败" : "💀强制失败"}</button>
          <button onClick={() => { resetForgeFailCount(); tick(); showToast("已重置概率"); }}>重置概率</button>
        </div>
      )}

      <div id="forge-toast" className="bag-toast"/>
    </div>
  );
}
