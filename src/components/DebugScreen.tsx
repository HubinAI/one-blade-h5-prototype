import { useState } from "react";
import {
  readProgress,
  writeProgress,
} from "../game/services/ProgressionService";
import { generateBlade, type Blade } from "../game/services/BladeService";
import {
  debugSetHighestFloor,
  debugSetRankIndex,
  debugRemoveClearedBreakthrough,
  debugAddClearedBreakthrough,
  debugResetBreakthroughs,
} from "../game/services/ProgressionService";
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

  function clearCache() {
    if (!confirm("确认清理所有缓存？\n\n会清除：\n- 进度存档\n- 今日BUFF\n- 图鉴\n- 关卡完成记录\n- 缓存数据\n\n（确认后刷新页面）")) return;
    const keys = [
      "one_blade_v04_progression",
      "one_blade_today_buffs",
      "one_blade_v02_progress",
      "one_blade_first_run_done",
      "one_blade_v02_levels",
      "one_blade_completion_today",
    ];
    let removed = 0;
    for (const k of keys) {
      if (window.localStorage.getItem(k) !== null) {
        window.localStorage.removeItem(k);
        removed++;
      }
    }
    // 清理所有以 one_blade 开头的 key（兜底）
    const allKeys = Object.keys(window.localStorage);
    for (const k of allKeys) {
      if (k.startsWith("one_blade") && !keys.includes(k)) {
        window.localStorage.removeItem(k);
        removed++;
      }
    }
    show(`已清理 ${removed} 项缓存，1秒后刷新`);
    setTimeout(() => window.location.reload(), 1000);
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
          <div className="debug-btn-grid">
            <button className="debug-btn" onClick={clearCache}>🧹 清理全部缓存</button>
            <button className="debug-btn danger" onClick={resetProgress}>重置所有进度</button>
          </div>
        </div>

        <div className="debug-group">
          <div className="debug-group-title">主线测试</div>
          <button onClick={() => { debugSetHighestFloor(1); onBack(); }}>跳到第1关</button>
          <button onClick={() => { debugSetHighestFloor(4); onBack(); }}>跳到第4关：测试分裂兵</button>
          <button onClick={() => { debugSetHighestFloor(5); onBack(); }}>跳到第5关：测试分裂巩固</button>
          <button onClick={() => { debugSetHighestFloor(7); onBack(); }}>跳到第7关：测试牵引兵</button>
          <button onClick={() => { debugSetHighestFloor(6); debugAddClearedBreakthrough("breakthrough_lianqi"); debugSetRankIndex(1); onBack(); }}>跳到第6关：练气突破后</button>
          <button onClick={() => { debugSetHighestFloor(5); debugRemoveClearedBreakthrough("breakthrough_lianqi"); debugSetRankIndex(0); onBack(); }}>设置为第5关已通关：触发练气突破</button>
          <button onClick={() => { debugAddClearedBreakthrough("breakthrough_lianqi"); onBack(); }}>标记练气突破已完成</button>
          <button onClick={() => { debugRemoveClearedBreakthrough("breakthrough_lianqi"); onBack(); }}>清除练气突破完成状态</button>
          <button onClick={() => { debugResetBreakthroughs(); onBack(); }}>重置所有突破状态</button>
        </div>

        {message && <div className="debug-toast">{message}</div>}
      </div>
    </div>
  );
}
