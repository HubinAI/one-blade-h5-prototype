import { describe, it, expect } from "vitest";
import { Game } from "../Game";
import { LEVELS } from "../../data/levels";
import { segmentHitCircle } from "./collisionSystem";

function makeGame() {
  const game = new Game(LEVELS[0], (() => {}) as any);
  (game as any).debugEnabled = true;
  (game as any)._numericalTestMode = true;
  (game as any)._spawnNumericalTestTarget();
  return game;
}

describe("碰撞链路 - Game集成", () => {
  it("checkSegmentHits 被调用后 hitCount > 0", () => {
    const game = makeGame();
    const trail = {
      id: "t1", tier: "normal", active: true, lockedEnergy: 50,
      points: [{x:50,y:600,t:0,energyRatio:1},{x:350,y:600,t:0.1,energyRatio:1}],
      hitEnemyIds: new Set(), hitPickupIds: new Set(), pendingExplosionIds: new Set(),
      pendingCoreIds: new Set(), widthMultiplier: 1.0,
      maxDuration: 1, remainingDuration: 1, maxPathLength: 300, remainingPathLength: 300,
      pathUsed: 0, remainingPower: 300, maxPower: 300, energyBank: 0,
      explosionCount: 0, coreCollapseCount: 0, kills: 0, chain: 0,
      oilTriggeredIds: new Set(), hasOil: false, directMainKills: 0,
    };
    (game as any).energy = 50;
    (game as any).bladeMomentumMax = 100;
    const a = { x: 50, y: 600 };
    const b = { x: 350, y: 600 };

    // 直接调用，传入 (game as any).checkSegmentHits
    const checkHits = (game as any).checkSegmentHits.bind(game);
    checkHits(a, b, trail);

    const hits = (game as any)._debugTestTargetHits;
    expect(hits).toBeGreaterThanOrEqual(1);
  });

  it("segmentHitCircle 直接测试 — 确认数学成立", () => {
    const game = makeGame();
    const tgt = (game as any)._numericalTestTarget;
    // 水平线从 (50,600) 到 (350,600)，目标在 (195,600)
    // 半径 = 30 + ~18 + 12 = ~60
    const a = { x: 50, y: 600 };
    const b = { x: 350, y: 600 };
    const hit = segmentHitCircle(a, b, tgt, 60);
    expect(hit).toBe(true);
  });
});
