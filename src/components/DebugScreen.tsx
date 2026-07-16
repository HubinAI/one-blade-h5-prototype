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
  getPendingGate,
  getHomeSnapshot,
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

        <p className="debug-subtitle">
          最高层: {readProgress().highestFloor} | 已通关: {Math.max(0, readProgress().highestFloor - 1)} | rankIdx: {readProgress().rankIndex}
        </p>

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

        <div className="debug-section">
          <h3>主线测试</h3>
          <div className="debug-btn-grid">
            <button className="debug-btn" onClick={() => { debugSetHighestFloor(1); refresh(); }}>跳到第1关</button>
            <button className="debug-btn" onClick={() => { debugSetHighestFloor(4); refresh(); }}>跳到第4关：分裂兵教学</button>
            <button className="debug-btn" onClick={() => { debugSetHighestFloor(5); refresh(); }}>跳到第5关：分裂巩固</button>
            <button className="debug-btn" onClick={() => { debugSetHighestFloor(6); refresh(); }}>跳到第6关：突破后主线</button>
            <button className="debug-btn" onClick={() => { debugSetHighestFloor(7); refresh(); }}>跳到第7关：牵引兵教学</button>
          </div>
        </div>

        <div className="debug-section">
          <h3>突破卡点模拟</h3>
          <div className="debug-btn-grid">
            <button className="debug-btn" onClick={() => { debugSetHighestFloor(5); debugRemoveClearedBreakthrough("breakthrough_lianqi"); debugSetRankIndex(0); refresh(); }}>模拟：已通关第4关</button>
            <button className="debug-btn" onClick={() => { debugSetHighestFloor(6); debugRemoveClearedBreakthrough("breakthrough_lianqi"); debugSetRankIndex(0); refresh(); }}>模拟：已通关第5关（未突破）</button>
            <button className="debug-btn" onClick={() => { debugSetHighestFloor(6); debugAddClearedBreakthrough("breakthrough_lianqi"); debugSetRankIndex(0); refresh(); }}>模拟：练气突破已完成</button>
            <button className="debug-btn" onClick={() => { debugRemoveClearedBreakthrough("breakthrough_lianqi"); refresh(); }}>清除练气突破记录</button>
            <button className="debug-btn" onClick={() => { debugAddClearedBreakthrough("breakthrough_lianqi"); refresh(); }}>标记练气突破完成</button>
            <button className="debug-btn danger" onClick={() => { debugResetBreakthroughs(); refresh(); }}>重置所有突破状态</button>
          </div>
        </div>

        <div className="debug-section">
          <h3>当前进度状态</h3>
          {(() => {
            const p = readProgress();
            const gate = getPendingGate();
            return (
              <div style={{ fontSize: 11, lineHeight: 1.6, color: "#f6e7bd", padding: "6px 4px", background: "rgba(0,0,0,0.3)", borderRadius: 4 }}>
                <div>highestFloor: <b style={{ color: "#ffd35a" }}>{p.highestFloor}</b></div>
                <div>clearedFloor: <b style={{ color: "#ffd35a" }}>{Math.max(0, p.highestFloor - 1)}</b></div>
                <div>rankIndex: <b style={{ color: "#ffd35a" }}>{p.rankIndex}</b></div>
                <div>pendingGate: <b style={{ color: gate ? "#ff7b6e" : "#5bc0ff" }}>{gate ? gate.breakthroughName : "无"}</b></div>
                <div>clearedBreakthroughs: {p.clearedBreakthroughs.length === 0 ? "无" : p.clearedBreakthroughs.join(", ")}</div>
              </div>
            );
          })()}
        </div>

        {message && <div className="debug-toast">{message}</div>}
      </div>
    </div>
  );
}
