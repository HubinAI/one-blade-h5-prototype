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
  bossFlow?: "legacy" | "reactive" | "chaseFlash";
};

export function GameCanvas({ level, onFinish, onReviveOffer, reviveSignal = 0, declineReviveSignal = 0, paused = false, runMode, retryExecutionRequested = false, onRetryExecutionConsumed, onBossPhaseChange, bossFlow = "legacy" }: GameCanvasProps) {
  // 从currentLevel获取当前模式
  const effectiveMode = runMode === "challenge" ? "challenge" : "normal";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const pausedRef = useRef(paused);
  const lastBossPhaseRef = useRef<BossPhaseState | null>(null);
  const [overlayPhase, setOverlayPhase] = useState<BossPhaseState | null>(null);

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

    const game = new Game(level, onFinish, onReviveOffer, effectiveMode, bossFlow);
    gameRef.current = game;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current) {
        game.update(dt);
      }
      game.render(ctx);
      // P4.4A.4: Boss阶段变更检测
      if (gameRef.current) {
        const currentPhase = gameRef.current.bossPhase ?? null;
        if (currentPhase !== lastBossPhaseRef.current) {
          lastBossPhaseRef.current = currentPhase;
          onBossPhaseChange?.(currentPhase);
          setOverlayPhase(currentPhase);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      gameRef.current = null;
      // P4.4A.3: 清理E2E桥，避免旧Game引用（仅 e2e 构建期；生产构建整段被 DCE 消除）
      if (__E2E_BRIDGE__) {
        if (typeof window !== "undefined" && (window as any).__ONE_BLADE_E2E__) {
          delete (window as any).__ONE_BLADE_E2E__;
        }
      }
    };
  }, [level, onFinish, onReviveOffer, effectiveMode]);

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
        gameRef.current?.toggleDebugDetail();
      } else if (event.key.toLowerCase() === "h") {
        gameRef.current?.toggleHpOverlay();
      } else if (event.key.toLowerCase() === "w") {
        // 调试用：强制给所有敌人加破绽标记
        gameRef.current?.debugForceWeakpoint();
      } else if (event.key.toLowerCase() === "i") {
        // P4.4A: 调试用跳过Boss开场
        gameRef.current?.debugSkipBossIntro();
      } else if (event.key.toLowerCase() === "v") {
        // P4.4A.1-R3: 调试用强制触发Boss胜利
        gameRef.current?.debugForceBossVictory();
      } else if (event.key.toLowerCase() === "c") {
        // V0731008: 调试用触发宝箱开奖流程
        (window as any).__triggerChestFlow?.();
      } else if (event.key.toLowerCase() === "t") {
        // V0731010: 调试用授予三刀流
        (window as any).__grantTripleSlash?.();
      } else if (event.key.toLowerCase() === "y") {
        // V0731011: 调试用授予燎原令
        (window as any).__grantScorch?.();
      } else if (event.key.toLowerCase() === "u") {
        // V0731012: 调试用授予凝霜令
        (window as any).__grantFrost?.();
      } else if (event.key.toLowerCase() === "k") {
        // 0807-11C-1: 暂停/恢复宝箱计数（不让系统的军令随机宝箱干扰 T/Y/U）
        (window as any).__toggleChestProgress?.();
      } else if (event.key.toLowerCase() === "s") {
        // 0807-11A: 调试跳过新手教学
        gameRef.current?.skipSwipeTutorial();
      } else if (event.key.toLowerCase() === "n") {
        // 0807-11B-1: 调试数值测试模式
        gameRef.current?.toggleNumericalTestMode();
      } else if (event.key === "1") {
        gameRef.current?.setDebugBladeBand("low");
      } else if (event.key === "2") {
        gameRef.current?.setDebugBladeBand("mid");
      } else if (event.key === "3") {
        gameRef.current?.setDebugBladeBand("high");
      } else if (event.key.toLowerCase() === "r") {
        gameRef.current?.resetNumericalTestTarget();
      } else if (event.key === "7") {
        gameRef.current?.setDebugMainLevel(1);
      } else if (event.key === "8") {
        gameRef.current?.setDebugMainLevel(10);
      } else if (event.key === "9") {
        gameRef.current?.setDebugMainLevel(40);
      } else if (event.key === "8" && event.ctrlKey) {
        gameRef.current?.setDebugSub1Level(10);
      } else if (event.key === "9" && event.ctrlKey) {
        gameRef.current?.setDebugSub1Level(40);
      } else if (event.key.toLowerCase() === "j") {
        gameRef.current?.setDebugSub1ForceEnable();
      } else if (event.key === "0") {
        gameRef.current?.restartLevel1();
      } else if (event.key === "`") {
        import("../game/services/ProgressionService").then(m => { m.debugResetToNewPlayer(); window.location.reload(); });
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
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
          gameRef.current?.handlePointerUp("cancel");
        }}
      />
      <TribulationOverlay bossPhase={overlayPhase} />
    </div>
  );
}
