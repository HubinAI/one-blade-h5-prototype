import type { BattleResult } from "../game/types";

type ResultScreenProps = {
  result: BattleResult;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onLevels: () => void;
};

export function ResultScreen({ result, hasNext, onRetry, onNext, onLevels }: ResultScreenProps) {
  return (
    <section className="screen result-screen">
      <div className={`result-medal ${result.win ? "win" : "lost"}`}>{result.rating}</div>
      <h2>{result.win ? "胜利" : "失败"}</h2>
      <p>
        第 {result.levelId} 关 · {result.levelTitle}
      </p>

      <dl className="result-grid">
        <div>
          <dt>分数</dt>
          <dd>{result.score}</dd>
        </div>
        <div>
          <dt>击杀</dt>
          <dd>{result.kills}</dd>
        </div>
        <div>
          <dt>最大单刀</dt>
          <dd>{result.maxSingleBlade}</dd>
        </div>
        <div>
          <dt>连锁</dt>
          <dd>{result.maxChain}</dd>
        </div>
        <div>
          <dt>挥刀</dt>
          <dd>{result.slashes}</dd>
        </div>
      </dl>

      <div className="menu-actions">
        {result.win && hasNext && (
          <button className="primary-button" onClick={onNext}>
            下一关
          </button>
        )}
        <button className={result.win && hasNext ? "ghost-button" : "primary-button"} onClick={onRetry}>
          再来一局
        </button>
        <button className="ghost-button" onClick={onLevels}>
          返回选关
        </button>
      </div>
    </section>
  );
}
