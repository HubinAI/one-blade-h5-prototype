import { useCallback, useEffect, useRef, useState } from "react";
import { ELITE_CONFIG } from "../game/config/elites";
import { BOSS_CONFIG } from "../game/config/bosses";
import { getCodexElites, getCodexBosses } from "../game/services/ProgressionService";

type CodexEntry = {
  id: string;
  name: string;
  description: string;
  status: "locked" | "unlocked";
  color: string;
};

const ELITE_ENTRIES: CodexEntry[] = (Object.values(ELITE_CONFIG) as Array<{ kind: string; name: string; skillDescription: string; color: string }>).map(
  (e) => ({
    id: e.kind,
    name: e.name,
    description: e.skillDescription,
    status: "locked" as const,
    color: e.color
  })
);

const BOSS_ENTRIES: CodexEntry[] = (Object.values(BOSS_CONFIG) as Array<{ id: string; name: string; introText: string; color: string }>).map(
  (b) => ({
    id: b.id,
    name: b.name,
    description: b.introText,
    status: "locked" as const,
    color: b.color
  })
);

type Props = {
  onClose: () => void;
};

export function Codex({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elites, setElites] = useState<CodexEntry[]>([]);
  const [bosses, setBosses] = useState<CodexEntry[]>([]);

  useEffect(() => {
    const unlockedElites = getCodexElites();
    const unlockedBosses = getCodexBosses();
    setElites(
      ELITE_ENTRIES.map((e) => ({
        ...e,
        status: unlockedElites.includes(e.id) ? "unlocked" : "locked"
      }))
    );
    setBosses(
      BOSS_ENTRIES.map((b) => ({
        ...b,
        status: unlockedBosses.includes(b.id) ? "unlocked" : "locked"
      }))
    );
  }, []);

  const unlockedCount = [...elites, ...bosses].filter((e) => e.status === "unlocked").length;
  const totalCount = ELITE_ENTRIES.length + BOSS_ENTRIES.length;

  const drawRadar = useCallback(
    (ctx: CanvasRenderingContext2D, entries: CodexEntry[], color: string, cx: number, cy: number, radius: number) => {
      const unlocked = entries.filter((e) => e.status === "unlocked").length;
      const total = entries.length;
      const ratio = total > 0 ? unlocked / total : 0;
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * ratio;

      ctx.save();
      ctx.translate(cx, cy);

      // 背景圆
      ctx.strokeStyle = "rgba(255, 214, 124, 0.2)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 进度弧
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 中心文字
      ctx.fillStyle = "#fff3c0";
      ctx.font = '800 18px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${unlocked}/${total}`, 0, 0);

      ctx.restore();
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 350 * dpr;
    canvas.height = 280 * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 350, 280);

    // 背景
    ctx.fillStyle = "rgba(10, 7, 5, 0.7)";
    ctx.beginPath();
    ctx.roundRect(0, 0, 350, 280, 12);
    ctx.fill();

    // 标题
    ctx.fillStyle = "#ffd35a";
    ctx.font = '800 18px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("图鉴", 175, 30);

    // 统计
    ctx.fillStyle = "rgba(246, 231, 189, 0.72)";
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText(`已解锁 ${unlockedCount}/${totalCount}`, 175, 54);

    // 精英区
    ctx.fillStyle = "#f5d78a";
    ctx.font = '700 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText("— 精英 —", 20, 82);
    let ey = 102;
    for (const e of elites) {
      const isUnlocked = e.status === "unlocked";
      ctx.fillStyle = isUnlocked ? e.color : "rgba(255,255,255,0.2)";
      ctx.font = isUnlocked ? '700 12px "Microsoft YaHei", sans-serif' : '12px "Microsoft YaHei", sans-serif';
      ctx.fillText(isUnlocked ? e.name : "???", 28, ey);
      if (isUnlocked) {
        ctx.fillStyle = "rgba(246, 231, 189, 0.6)";
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.fillText(e.description.substring(0, 22), 100, ey);
      }
      ey += 20;
    }

    // Boss区
    ctx.fillStyle = "#f0b0a0";
    ctx.font = '700 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText("— Boss —", 20, ey + 4);
    ey += 24;
    for (const b of bosses) {
      const isUnlocked = b.status === "unlocked";
      ctx.fillStyle = isUnlocked ? b.color : "rgba(255,255,255,0.2)";
      ctx.font = isUnlocked ? '700 12px "Microsoft YaHei", sans-serif' : '12px "Microsoft YaHei", sans-serif';
      ctx.fillText(isUnlocked ? b.name : "???", 28, ey);
      if (isUnlocked) {
        ctx.fillStyle = "rgba(246, 231, 189, 0.6)";
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.fillText(b.description.substring(0, 22), 100, ey);
      }
      ey += 20;
    }

    // 进度环
    drawRadar(ctx, elites, "#d48c2a", 300, 70, 28);
    drawRadar(ctx, bosses, "#c0392b", 300, 110, 28);
  }, [elites, bosses, drawRadar]);

  return (
    <div
      className="codex-overlay"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        className="codex-panel"
        style={{
          width: 370,
          maxHeight: "80vh",
          overflow: "auto",
          position: "relative"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: 350,
            height: 280,
            display: "block",
            margin: "0 auto",
            borderRadius: 12,
            border: "1px solid rgba(255, 214, 124, 0.3)"
          }}
        />
        <button
          onClick={onClose}
          style={{
            display: "block",
            margin: "12px auto 0",
            padding: "8px 32px",
            background: "rgba(255, 214, 124, 0.15)",
            border: "1px solid rgba(255, 214, 124, 0.4)",
            borderRadius: 8,
            color: "#ffd35a",
            fontSize: 14,
            cursor: "pointer"
          }}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
