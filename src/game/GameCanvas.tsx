import { useEffect, useRef, useState } from "react";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "./config/constants";
import { Game, type ReviveOffer } from "./Game";
import type { BattleResult, BossPhaseState, LevelConfig, Vec2 } from "./types";
import { TribulationOverlay } from "../components/TribulationOverlay";

type GameCanvasProps = {
  level: LevelConfig;
  onFinish: (result: BattleResult) => void;
  onReviveOffer?: (offer: ReviveOffer) => void;
  reviveSignal?: number;
  declineReviveSignal?: number;
  paused?: boolean;
  runMode?: "normal" | "challenge";
  /** P4.4A.4: 执行失败重试信号 */
  retryExecutionRequested?: boolean;
  /** P4.4A.4: 重试信号已消费回调 */
  onRetryExecutionConsumed?: () => void;
  /** P4.4A.4: Boss阶段变更回调 */
  onBossPhaseChange?: (phase: BossPhaseState | null) => void;
  /** P0: Boss流程选择（双入口） */
  bossFlow?: "legacy" | "reactive" | "strategySlice";
  /** V0723016复审: runIndex 用于 key + effect deps（key 变化才允许新 Game） */
  runIndex?: number;
};

export function GameCanvas({ level, onFinish, onReviveOffer, reviveSignal = 0, declineReviveSignal = 0, paused = false, runMode, retryExecutionRequested = false, onRetryExecutionConsumed, onBossPhaseChange, bossFlow = "legacy", runIndex = 0 }: GameCanvasProps) {
  // 从currentLevel获取当前模式
  const effectiveMode = runMode === "challenge" ? "challenge" : "normal";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const pausedRef = useRef(paused);
  const lastBossPhaseRef = useRef<BossPhaseState | null>(null);
  const [overlayPhase, setOverlayPhase] = useState<BossPhaseState | null>(null);

  // V0723016复审: 回调用 useRef 读取最新函数，避免回调身份变化触发 Game 重建
  const onFinishRef = useRef(onFinish);
  const onReviveOfferRef = useRef(onReviveOffer);
  const onBossPhaseChangeRef = useRef(onBossPhaseChange);
  const onRetryExecutionConsumedRef = useRef(onRetryExecutionConsumed);
  onFinishRef.current = onFinish;
  onReviveOfferRef.current = onReviveOffer;
  onBossPhaseChangeRef.current = onBossPhaseChange;
  onRetryExecutionConsumedRef.current = onRetryExecutionConsumed;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = DESIGN_WIDTH * dpr;
    canvas.height = DESIGN_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // V0723016复审: 传 stable wrapper（调 ref.current），Game 不因回调身份变化重建
    const stableOnFinish = (r: BattleResult) => onFinishRef.current?.(r);
    const stableOnReviveOffer = (o: ReviveOffer) => onReviveOfferRef.current?.(o);
    const game = new Game(level, stableOnFinish, stableOnReviveOffer, effectiveMode, bossFlow);
    gameRef.current = game;
    // V0723016复审: 记录本实例的 instanceId，cleanup 时只删自己的桥
    const gameInstanceId = game.e2eInstanceId;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current) {
        game.update(dt);
      }
      game.render(ctx);
      // P4.4A.4: Boss阶段变更检测（V0723016复审: 用 ref 读最新回调）
      if (gameRef.current) {
        const currentPhase = gameRef.current.bossPhase ?? null;
        if (currentPhase !== lastBossPhaseRef.current) {
          lastBossPhaseRef.current = currentPhase;
          onBossPhaseChangeRef.current?.(currentPhase);
          setOverlayPhase(currentPhase);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      gameRef.current = null;
      // V0723016复审: cleanup 只删自己的 E2E 桥（instanceId 守卫，旧实例不删新实例桥）
      if (__E2E_BRIDGE__) {
        if (typeof window !== "undefined" && (window as any).__ONE_BLADE_E2E__) {
          const bridge = (window as any).__ONE_BLADE_E2E__;
          if (!bridge.instanceId || bridge.instanceId === gameInstanceId) {
            delete (window as any).__ONE_BLADE_E2E__;
          }
        }
      }
    };
  }, [level, runIndex, bossFlow]);  // V0723016复审: deps 精简，不含回调

  useEffect(() => {
    if (reviveSignal > 0) gameRef.current?.reviveFromRewardedAd();
  }, [reviveSignal]);

  useEffect(() => {
    if (declineReviveSignal > 0) gameRef.current?.declineReviveOffer();
  }, [declineReviveSignal]);

  useEffect(() => {
    if (retryExecutionRequested && gameRef.current) {
      gameRef.current.retryExecution();
      onRetryExecutionConsumed?.();
    }
  }, [retryExecutionRequested]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "d") {
        gameRef.current?.toggleDebugPanel();
      } else if (event.key.toLowerCase() === "w") {
        // 调试用：强制给所有敌人加破绽标记
        gameRef.current?.debugForceWeakpoint();
      } else if (event.key.toLowerCase() === "i") {
        // P4.4A: 调试用跳过Boss开场
        gameRef.current?.debugSkipBossIntro();
      } else if (event.key.toLowerCase() === "v") {
        // P4.4A.1-R3: 调试用强制触发Boss胜利
        gameRef.current?.debugForceBossVictory();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function toGamePoint(event: React.PointerEvent<HTMLCanvasElement>): Vec2 {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * DESIGN_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * DESIGN_HEIGHT
    };
  }

  return (
    <div style={{ position: "relative", width: DESIGN_WIDTH, height: DESIGN_HEIGHT }}>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        width={DESIGN_WIDTH}
        height={DESIGN_HEIGHT}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          gameRef.current?.handlePointerDown(toGamePoint(event));
        }}
        onPointerMove={(event) => {
          event.preventDefault();
          gameRef.current?.handlePointerMove(toGamePoint(event));
        }}
        onPointerUp={(event) => {
          event.preventDefault();
          gameRef.current?.handlePointerUp();
        }}
        onPointerCancel={(event) => {
          event.preventDefault();
          gameRef.current?.handlePointerUp();
        }}
      />
      <TribulationOverlay bossPhase={overlayPhase} />
    </div>
  );
}
