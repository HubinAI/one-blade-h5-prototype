import { useState } from "react";
import {
  readProgress,
  writeProgress,
} from "../game/services/ProgressionService";
import { generateBlade, type Blade } from "../game/services/BladeService";
import { QUALITY_ORDER, QUALITY_META, type Quality } from "../game/config/synthesis";

type DebugScreenProps = {
  onBack: () => void;
};

export function DebugScreen({ onBack }: DebugScreenProps) {
  const [message, setMessage] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);

  function show(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 1800);
  }

  function refresh() {
    setRefreshKey(k => k + 1);
  }

  function addBlade(quality: Quality) {
    const progress = readProgress();
    const blade = generateBlade(quality);
    progress.blades.push(blade);
    writeProgress(progress);
    show(`+1 ${QUALITY_META[quality].label}刀`);
    refresh();
  }

  function add100Coins() {
    const progress = readProgress();
    progress.coins += 100;
    writeProgress(progress);
    show("+100 金币");
    refresh();
  }

  function fullStamina() {
    const progress = readProgress();
    progress.stamina = 30;
    writeProgress(progress);
    show("体力已满");
    refresh();
  }

  function resetProgress() {
    if (!confirm("确认重置所有进度？此操作不可恢复")) return;
    const keys = [
      "one_blade_v04_progression",
      "one_blade_today_buffs",
      "one_blade_v02_progress",
      "one_blade_first_run_done",
      "one_blade_v02_levels",
      "one_blade_completion_today",
    ];
    for (const k of keys) window.localStorage.removeItem(k);
    show("已重置，刷新页面生效");
    setTimeout(() => window.location.reload(), 800);
  }

  function floorPlus10() {
    const progress = readProgress();
    progress.highestFloor = (progress.highestFloor ?? 1) + 10;
    writeProgress(progress);
    show("+10层");
    refresh();
  }

  return (
    <div className="debug-overlay" onClick={onBack}>
      <div className="debug-popup" onClick={(e) => e.stopPropagation()}>
        <div className="debug-header">
          <button className="debug-back" onClick={onBack}>×</button>
          <h1>🛠 Debug 控制台</h1>
        </div>

        <p className="debug-subtitle">当前最高层: {readProgress().highestFloor}</p>

        <div className="debug-section">
          <h3>添加刀</h3>
          <div className="debug-btn-grid">
            {QUALITY_ORDER.slice(0, 5).map((q) => (
              <button key={q} className="debug-btn" onClick={() => addBlade(q)}>
                +{QUALITY_META[q].label}刀
              </button>
            ))}
          </div>
        </div>

        <div className="debug-section">
          <h3>资源</h3>
          <div className="debug-btn-grid">
            <button className="debug-btn" onClick={add100Coins}>+100 金币</button>
            <button className="debug-btn" onClick={fullStamina}>体力回满</button>
            <button className="debug-btn" onClick={floorPlus10}>最高层+10</button>
          </div>
        </div>

        <div className="debug-section">
          <h3>危险操作</h3>
          <button className="debug-btn danger" onClick={resetProgress}>重置所有进度</button>
        </div>

        {message && <div className="debug-toast">{message}</div>}
      </div>
    </div>
  );
}
