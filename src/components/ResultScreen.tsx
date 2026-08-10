import { useState, useEffect, useRef } from "react";
import type { BattleResult } from "../game/types";
import { showRewardedAdMock, incrementDailyAdCount } from "../game/services/AdService";

type ResultScreenProps = {
  result: BattleResult;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onLevels: () => void;
  onHome: () => void;
  restartCurrentLevel: () => void;
};

function getFailReason(result: BattleResult): string {
  if (result.kills === 0) return "没有及时挥刀";
  if (result.maxSingleBlade <= 3) return "单刀击杀过少，积蓄刀势再挥刀";
  if (result.explosiveCount === 0) return "没有利用火药兵连锁爆炸";
  return "炼刀变强，再战此关";
}

// 0809-11F-4C: 输入锁时长
const INPUT_LOCK_MS = 1500;

export function ResultScreen({
  result,
  onHome,
  onRetry,
  restartCurrentLevel,
}: ResultScreenProps) {
  const displayId = result.levelId >= 10000 ? result.levelId - 10000 : result.levelId;
  const [adState, setAdState] = useState<"idle" | "playing">("idle");
  const [extraSlashUsed, setExtraSlashUsed] = useState(false);
  // 0809-11F-4C: 输入锁
  const [inputLocked, setInputLocked] = useState(true);
  const mountRef = useRef(performance.now());

  useEffect(() => {
    mountRef.current = performance.now();
    const t = setTimeout(() => setInputLocked(false), INPUT_LOCK_MS);
    return () => clearTimeout(t);
  }, []);

  // 0809-11F-4C: 锁定期间忽略所有点击
  const handleLockedClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleReviveSlash = async () => {
    setAdState("playing");
    const ok = await showRewardedAdMock("revive_extra_slash");
    setAdState("idle");
    if (ok) {
      incrementDailyAdCount("revive_extra_slash");
      setExtraSlashUsed(true);
      restartCurrentLevel();
    }
  };

  const ratingStars: Record<string, string> = {
    "C": "★★☆☆☆", "B": "★★★☆☆", "A": "★★★★☆", "S": "★★★★★",
    "SS": "★★★★★", "神之一刀": "★★★★★",
  };

  // 0809-11F-4C: 背景点击不再快速关闭，解锁后返回主页
  function handleBackgroundClick() {
    if (inputLocked) return;
    onHome();
  }

  const btnStyle: React.CSSProperties = inputLocked
    ? { opacity: 0.6, pointerEvents: "none", cursor: "default", transition: "opacity 0.3s" }
    : { opacity: 1, transition: "opacity 0.3s" };

  return (
    <section
      className="screen result-screen market-result-screen"
      onClick={handleBackgroundClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        padding: "20px 16px",
      }}
    >
      {/* 0809-11F-4C: 居中结果卡 + 淡入+轻微scale动画 */}
      <div
        onClick={inputLocked ? handleLockedClick : (e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 340,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          animation: "resultFadeIn 0.30s ease-out",
          opacity: inputLocked ? 1 : 1,
        }}
      >
        {/* 标题 */}
        <h1
          className={`result-title ${result.win ? "win" : "lose"}`}
          style={{ margin: 0, fontSize: 26 }}
        >
          {result.win ? "破阵成功！" : "失败"}
        </h1>
        <p className="result-level-info" style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>
          第 {displayId} 关
        </p>

        {/* 评级 */}
        <div className="result-rating-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="result-rating-grade"
            style={{
              color: result.rating === "SS" || result.rating === "神之一刀" ? "#ffd35a" : "#f6e7bd",
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            {result.rating}
          </span>
          <span className="result-rating-stars" style={{ fontSize: 18 }}>
            {ratingStars[result.rating] ?? ""}
          </span>
        </div>

        {/* 核心数据 */}
        <div className="result-stats-section" style={{ display: "flex", gap: 20, justifyContent: "center" }}>
          <div className="result-stat" style={{ textAlign: "center" }}>
            <span className="result-stat-label" style={{ display: "block", fontSize: 12, opacity: 0.6 }}>主刀最多</span>
            <span className="result-stat-value" style={{ fontSize: 20, fontWeight: 600 }}>{result.maxDirectMainSlashKills ?? result.maxSingleBlade}</span>
          </div>
          <div className="result-stat" style={{ textAlign: "center" }}>
            <span className="result-stat-label" style={{ display: "block", fontSize: 12, opacity: 0.6 }}>最大连锁</span>
            <span className="result-stat-value" style={{ fontSize: 20, fontWeight: 600 }}>{result.maxChain}</span>
          </div>
          <div className="result-stat" style={{ textAlign: "center" }}>
            <span className="result-stat-label" style={{ display: "block", fontSize: 12, opacity: 0.6 }}>用时</span>
            <span className="result-stat-value" style={{ fontSize: 20, fontWeight: 600 }}>{Math.round(result.duration)}s</span>
          </div>
        </div>

        {/* 奖励 — 0814-01A: 金币奖励已屏蔽 */}
        <div className="result-rewards-section" style={{ display: "flex", gap: 16 }}>
          <div className="result-reward" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="result-reward-icon">⚔</span>
            <span className="result-reward-amount" style={{ fontWeight: 600 }}>+{result.rewards.battlePass}</span>
          </div>
          {result.triggeredOneBlade && (
            <div className="result-reward special" style={{ color: "#ffd35a", fontWeight: 600 }}>⚔ 一刀破阵</div>
          )}
        </div>

        {/* 失败原因 */}
        {!result.win && (
          <div className="result-fail-reason" style={{ fontSize: 13, opacity: 0.7, textAlign: "center" }}>
            💡 {getFailReason(result)}
          </div>
        )}

        {/* 按钮区 — 0814-01A: 金币翻倍按钮已屏蔽 */}
        <div className="result-actions-section" style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 260, marginTop: 4 }}>
          {!result.win && (
            <>
              {!extraSlashUsed && (
                <button
                  className="result-btn ad-btn single-btn"
                  onClick={inputLocked ? undefined : handleReviveSlash}
                  disabled={adState === "playing" || inputLocked}
                  style={{ ...btnStyle, padding: "12px 0", fontSize: 15, borderRadius: 10 }}
                >
                  📺 看广告·补一刀
                </button>
              )}
              <button
                className="result-btn retry-btn"
                onClick={inputLocked ? undefined : onRetry}
                disabled={inputLocked}
                style={{ ...btnStyle, padding: "12px 0", fontSize: 15, borderRadius: 10 }}
              >
                🔄 重新挑战
              </button>
              <button
                className="result-btn home-btn"
                onClick={inputLocked ? undefined : onHome}
                disabled={inputLocked}
                style={{ ...btnStyle, padding: "12px 0", fontSize: 15, borderRadius: 10 }}
              >
                返回主页
              </button>
            </>
          )}
        </div>

        {/* 底部提示：锁定期间不显示"点击返回" */}
        {result.win && !inputLocked && (
          <div className="result-tap-tip" style={{ fontSize: 12, opacity: 0.4, marginTop: 4 }}>
            · 点击空白处返回 ·
          </div>
        )}
        {inputLocked && (
          <div className="result-tap-tip" style={{ fontSize: 11, opacity: 0.25, marginTop: 2 }}>
            结算中...
          </div>
        )}
      </div>

      {/* 0809-11F-4C: CSS keyframes注入 */}
      <style>{`
        @keyframes resultFadeIn {
          0% { opacity: 0; transform: scale(0.96); }
          100% { opacity: 1; transform: scale(1.00); }
        }
      `}</style>
    </section>
  );
}
