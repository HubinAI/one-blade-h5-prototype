import { useState } from "react";
import type { Blade } from "../game/services/BladeService";
import { getBladeInventory, forgeBlades, removeBlade } from "../game/services/ProgressionService";
import { QUALITY_META, getRandomAffixForQuality, QUALITY_ORDER, SYNTHESIS_RULES, getExpCostForLevel } from "../game/config/synthesis";
import { randomBladeName, createBlade } from "../game/services/BladeService";
import type { Quality } from "../game/config/synthesis";

type ForgeScreenProps = {
  onBack: () => void;
};

export function ForgeScreen({ onBack }: ForgeScreenProps) {
  const [inventory, setInventory] = useState<Blade[]>(getBladeInventory());
  const [slot1, setSlot1] = useState<Blade | null>(null);
  const [slot2, setSlot2] = useState<Blade | null>(null);
  const [result, setResult] = useState<{ success: boolean; name?: string; quality?: Quality; affix?: string; exp: number } | null>(null);
  const [animating, setAnimating] = useState(false);

  function selectBlade(blade: Blade) {
    if (blade.locked) return;
    if (!slot1) setSlot1(blade);
    else if (!slot2 && blade.id !== slot1.id) setSlot2(blade);
  }

  function clearSlot(slot: 1 | 2) {
    if (slot === 1) setSlot1(null);
    else setSlot2(null);
    setResult(null);
  }

  function doForge() {
    if (!slot1 || !slot2 || slot1.id === slot2.id) return;
    if (slot1.quality !== slot2.quality) return;

    setAnimating(true);
    setResult(null);

    // 短延迟制造动画感
    setTimeout(() => {
      const res = forgeBlades(slot1.id, slot2.id);
      if (res) {
        setResult({
          success: res.success,
          name: res.resultBlade?.name,
          quality: res.resultBlade?.quality,
          affix: res.resultBlade?.affix ?? undefined,
          exp: res.expReward,
        });
        if (res.success && res.resultBlade) {
          // 自动给新刀随机词缀
          const affix = getRandomAffixForQuality(res.resultBlade.quality);
          if (affix) res.resultBlade.affix = affix;
        }
      }
      setInventory(getBladeInventory());
      setSlot1(null);
      setSlot2(null);
      setAnimating(false);
    }, 400);
  }

  const sameQuality = slot1 && slot2 && slot1.quality === slot2.quality;
  const canForge = slot1 && slot2 && sameQuality && !animating;

  return (
    <section className="screen forge-screen">
      <div className="forge-header">
        <button className="forge-back" onClick={onBack}>← 返回</button>
        <h1>炼器炉</h1>
      </div>

      {/* 合成槽 */}
      <div className="forge-slots">
        <div className="forge-slot" onClick={() => clearSlot(1)}>
          {slot1 ? (
            <div className="forge-blade-card" style={{ borderColor: QUALITY_META[slot1.quality]?.color }}>
              <span className="forge-blade-quality" style={{ color: QUALITY_META[slot1.quality]?.color }}>
                {QUALITY_META[slot1.quality]?.label}
              </span>
              <span className="forge-blade-name">{slot1.name}</span>
              <span className="forge-blade-lv">Lv.{slot1.level}</span>
            </div>
          ) : (
            <span className="forge-slot-empty">选择材料</span>
          )}
        </div>
        <span className="forge-plus">+</span>
        <div className="forge-slot" onClick={() => clearSlot(2)}>
          {slot2 ? (
            <div className="forge-blade-card" style={{ borderColor: QUALITY_META[slot2.quality]?.color }}>
              <span className="forge-blade-quality" style={{ color: QUALITY_META[slot2.quality]?.color }}>
                {QUALITY_META[slot2.quality]?.label}
              </span>
              <span className="forge-blade-name">{slot2.name}</span>
              <span className="forge-blade-lv">Lv.{slot2.level}</span>
            </div>
          ) : (
            <span className="forge-slot-empty">选择材料</span>
          )}
        </div>
      </div>

      {/* 概率 + 合成按钮 */}
      {sameQuality && (
        <div className="forge-info">
          {slot1.quality !== "white" && slot1.quality !== "green" && (
            <p className="forge-chance">
              成功率：{Math.min(100, (SYNTHESIS_RULES[slot1.quality]?.baseChance ?? 0))}%
              （每次失败提升{SYNTHESIS_RULES[slot1.quality]?.increment ?? 0}%）
            </p>
          )}
          <p className="forge-hint">
            {slot1.quality === "white" || slot1.quality === "green"
              ? "100%必成"
              : `保底${SYNTHESIS_RULES[slot1.quality]?.maxAttempts ?? 7}次`}
          </p>
        </div>
      )}

      <button
        className={`forge-button ${canForge ? "" : "disabled"}`}
        onClick={doForge}
        disabled={!canForge}
      >
        {animating ? "炼器中..." : "开始炼器"}
      </button>

      {/* 合成结果 */}
      {result && (
        <div className={`forge-result ${result.success ? "success" : "fail"}`}>
          {result.success ? (
            <>
              <p className="forge-result-title">✨ 炼器成功！</p>
              <p className="forge-result-name" style={{ color: result.quality ? QUALITY_META[result.quality]?.color : "#fff" }}>
                {result.name}
              </p>
              <p className="forge-result-quality">
                {result.quality ? QUALITY_META[result.quality]?.label : ""}
                {result.affix ? ` · ${result.affix}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="forge-result-title">💥 炼器失败</p>
              <p className="forge-result-exp">获得 +{result.exp} 点{slot1?.quality ? QUALITY_META[slot1.quality]?.label : ""}经验</p>
            </>
          )}
        </div>
      )}

      {/* 刀库列表 */}
      <div className="forge-inventory">
        <h2>刀库 ({inventory.length}把)</h2>
        <div className="forge-inventory-grid">
          {inventory.map((blade) => {
            const meta = QUALITY_META[blade.quality];
            const selected = slot1?.id === blade.id || slot2?.id === blade.id;
            return (
              <div
                key={blade.id}
                className={`forge-inv-card ${selected ? "selected" : ""} ${blade.locked ? "locked" : ""}`}
                style={{ borderColor: meta?.color }}
                onClick={() => selectBlade(blade)}
              >
                <span className="forge-inv-quality" style={{ color: meta?.color }}>
                  {meta?.label}
                </span>
                <span className="forge-inv-name">{blade.name}</span>
                <span className="forge-inv-lv">Lv.{blade.level}</span>
                {blade.affix && <span className="forge-inv-affix">{blade.affix}</span>}
                {blade.locked && <span className="forge-inv-locked">🔒</span>}
                {/* 等级进度条 */}
                {blade.level < 40 && (
                  <div className="forge-lv-progress">
                    <div className="forge-lv-bar" style={{ width: `${(blade.exp / getExpCostForLevel(blade.level)) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {inventory.length === 0 && <p className="forge-empty">刀库为空，去主线获取刀吧</p>}
        </div>
      </div>
    </section>
  );
}
