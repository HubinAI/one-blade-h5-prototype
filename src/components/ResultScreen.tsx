import type { BattleResult } from "../game/types";

type ResultScreenProps = {
  result: BattleResult;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onLevels: () => void;
  onHome: () => void;
  onDoubleReward: () => void;
  onAdChest: () => void;
};

export function ResultScreen({
  result,
  hasNext,
  onRetry,
  onNext,
  onDoubleReward
}: ResultScreenProps) {
  const primaryAction = result.win && hasNext ? onNext : onRetry;
  const primaryLabel = result.win && hasNext ? "下一关" : "再来一局";
  const showDouble = result.win && result.canDoubleReward && !result.rewards.doubled;

  function generateShareImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 420;
    canvas.height = 640;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#1a1210";
    ctx.fillRect(0, 0, 420, 640);

    const grad = ctx.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, "#2d1f18");
    grad.addColorStop(1, "#1a1210");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 420, 200);

    ctx.fillStyle = result.win ? "#ffd35a" : "#d64b3b";
    ctx.font = 'bold 46px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(result.win ? "破阵成功" : "防线失守", 210, 80);

    ctx.fillStyle = "#f6e7bd";
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText(`第${result.levelId}关 · ${result.levelTitle}`, 210, 120);

    ctx.strokeStyle = "rgba(255,211,90,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 150);
    ctx.lineTo(360, 150);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    const data = [
      `击杀 ${result.kills}`,
      `最大单刀 ${result.maxSingleBlade} 连杀`,
      `用时 ${Math.round(result.duration)} 秒`,
      `得分 ${result.score}`
    ];
    data.forEach((line, i) => {
      ctx.fillStyle = i === 3 ? "#ffd35a" : "#f6e7bd";
      ctx.fillText(line, 60, 190 + i * 40);
    });

    if (result.triggeredOneBlade) {
      ctx.fillStyle = "#ff6a33";
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("⚔ 一刀破阵 ⚔", 210, 400);
    }

    ctx.fillStyle = "rgba(246,231,189,0.5)";
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("我只要一刀", 210, 560);
    ctx.fillText("刀势越满，一刀越爽", 210, 585);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `我只要一刀_第${result.levelId}关_${result.rating}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <section className="screen result-screen result-screen-v7">
      <div className="result-v7-header">
        <h1>{result.win ? "破阵成功" : "防线失守"}</h1>
        <p>第 {result.levelId} 关 · {result.levelTitle}</p>
      </div>

      <div className="result-v7-stats">
        <div>
          <span>击杀</span>
          <b>{result.kills}</b>
        </div>
        <div className="highlight">
          <span>最大单刀</span>
          <b>{result.maxSingleBlade}</b>
        </div>
        <div>
          <span>用时</span>
          <b>{Math.round(result.duration)}s</b>
        </div>
      </div>

      <div className="result-v7-rewards">
        <div className="reward-icon">
          <span className="reward-icon-symbol">🪙</span>
          <span className="reward-icon-count">{result.rewards.coins}</span>
        </div>
        <div className="reward-icon">
          <span className="reward-icon-symbol">⚔</span>
          <span className="reward-icon-count">{result.rewards.battlePass}</span>
        </div>
        <div className="reward-icon">
          <span className="reward-icon-symbol">💎</span>
          <span className="reward-icon-count">{result.rewards.shardName}+{result.rewards.shardCount}</span>
        </div>
      </div>

      <div className="result-v7-actions">
        <button className="primary-button" onClick={primaryAction}>{primaryLabel}</button>
        <div className="result-v7-sub-actions">
          {showDouble && (
            <button className="ad-button" onClick={onDoubleReward}>📺 广告翻倍</button>
          )}
          <button className="share-button" onClick={generateShareImage}>⚔ 分享</button>
        </div>
      </div>

      <small className="version-footer">V0708009</small>
    </section>
  );
}
