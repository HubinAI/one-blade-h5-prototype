import { useEffect, useRef } from "react";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "./config/constants";
import { Game, type ReviveOffer } from "./Game";
import type { BattleResult, BuffId, LevelConfig, Vec2 } from "./types";

type GameCanvasProps = {
  level: LevelConfig;
  onFinish: (result: BattleResult) => void;
  onReviveOffer?: (offer: ReviveOffer) => void;
  onBuffReveal?: (buffId: BuffId) => void;
  reviveSignal?: number;
  declineReviveSignal?: number;
  confirmBuffSignal?: number;
  paused?: boolean;
};

export function GameCanvas({ level, onFinish, onReviveOffer, onBuffReveal, reviveSignal = 0, declineReviveSignal = 0, confirmBuffSignal = 0, paused = false }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const pausedRef = useRef(paused);

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

    const game = new Game(level, onFinish, onReviveOffer, onBuffReveal);
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
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      gameRef.current = null;
    };
  }, [level, onFinish, onReviveOffer]);

  useEffect(() => {
    if (reviveSignal > 0) gameRef.current?.reviveFromRewardedAd();
  }, [reviveSignal]);

  useEffect(() => {
    if (declineReviveSignal > 0) gameRef.current?.declineReviveOffer();
  }, [declineReviveSignal]);

  useEffect(() => {
    if (confirmBuffSignal > 0) gameRef.current?.confirmChestBuff();
  }, [confirmBuffSignal]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "d") {
        gameRef.current?.toggleDebugPanel();
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
  );
}
