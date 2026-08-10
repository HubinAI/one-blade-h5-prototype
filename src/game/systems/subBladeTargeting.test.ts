import { describe, it, expect } from "vitest";
import { Game } from "../Game";
import { LEVELS } from "../../data/levels";

/**
 * 0814-01C-0.2: fireRing 精英副刀锁敌回归测试
 * 验证 01C-0.1 修复的根因：fireRing 精英在非无敌期间应可被副刀锁定/击杀
 */
function makeGame() {
  const game = new Game(LEVELS[0], (() => {}) as any);
  (game as any).debugEnabled = true;
  return game;
}

function pushEnemy(game: Game, overrides: Record<string, any>) {
  const id = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const enemy = {
    id,
    kind: "infantry",
    alive: true,
    hp: 100,
    maxHp: 100,
    x: 195,
    y: 450,
    speed: 1,
    radius: 16,
    flash: 0,
    score: 10,
    ...overrides,
  };
  (game as any).enemies.push(enemy);
  return enemy;
}

describe("副刀锁敌 — fireRing精英回归测试", () => {

  it("fireRing精英 + eliteInvuln=false → 可被统一target selector选中", () => {
    const game = makeGame();
    pushEnemy(game, { kind: "elite", eliteKind: "fireRing", y: 400, hp: 500, maxHp: 500 });
    (game as any)._eliteBattleActive = true;
    (game as any)._eliteInvuln = false;

    const targets = (game as any).getValidSubBladeTargets();
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect((targets[0] as any).eliteKind).toBe("fireRing");
  });

  it("fireRing精英 + eliteInvuln=true → 不可被副刀锁定", () => {
    const game = makeGame();
    pushEnemy(game, { kind: "elite", eliteKind: "fireRing", y: 400, hp: 500, maxHp: 500 });
    (game as any)._eliteBattleActive = true;
    (game as any)._eliteInvuln = true;

    const targets = (game as any).getValidSubBladeTargets();
    const fireRingTargets = targets.filter((t: any) => t.eliteKind === "fireRing");
    expect(fireRingTargets.length).toBe(0);
  });

  it("fireRing精英解除无敌后 → 再次可被锁定", () => {
    const game = makeGame();
    pushEnemy(game, { kind: "elite", eliteKind: "fireRing", y: 400, hp: 500, maxHp: 500 });

    // 无敌期间
    (game as any)._eliteBattleActive = true;
    (game as any)._eliteInvuln = true;
    expect((game as any).getValidSubBladeTargets().filter((t: any) => t.eliteKind === "fireRing").length).toBe(0);

    // 解除无敌
    (game as any)._eliteInvuln = false;
    const targets2 = (game as any).getValidSubBladeTargets().filter((t: any) => t.eliteKind === "fireRing");
    expect(targets2.length).toBeGreaterThanOrEqual(1);
  });

  it("fireRing精英剩余HP < 副刀伤害 → 正常死亡结算，alive=false", () => {
    const game = makeGame();
    const elite = pushEnemy(game, { kind: "elite", eliteKind: "fireRing", y: 400, hp: 5, maxHp: 500 });
    (game as any)._eliteBattleActive = true;
    (game as any)._eliteInvuln = false;

    // 副刀伤害 (6% × 500 = 30) > 剩余 HP(5)
    const blade = { quality: "green", name: "青锋刀", level: 1, affix: null };
    const stats = { damageMultiplier: 1.0 };

    (game as any).applySubBladeDamage(elite, blade, stats);

    expect(elite.hp).toBeLessThanOrEqual(0);
    expect(elite.alive).toBe(false);
  });

  it("已死亡精英 → 不出现在副刀有效目标列表", () => {
    const game = makeGame();
    const elite = pushEnemy(game, { kind: "elite", eliteKind: "fireRing", y: 400, hp: 0, maxHp: 500, alive: false });
    (game as any)._eliteBattleActive = true;
    (game as any)._eliteInvuln = false;

    const targets = (game as any).getValidSubBladeTargets();
    const deadInList = targets.filter((t: any) => t.id === elite.id);
    expect(deadInList.length).toBe(0);
  });

  it("副刀锁敌优先级 — 距离防线最近优先", () => {
    const game = makeGame();
    pushEnemy(game, { kind: "infantry", y: 350, id: "far" });
    pushEnemy(game, { kind: "infantry", y: 420, id: "mid" });
    pushEnemy(game, { kind: "infantry", y: 500, id: "near" });
    (game as any)._eliteInvuln = false;

    const targets = (game as any).getValidSubBladeTargets();
    expect(targets.length).toBeGreaterThanOrEqual(3);
    expect((targets[0] as any).id).toBe("near"); // Y最大=最近防线
    expect((targets[1] as any).id).toBe("mid");
    expect((targets[2] as any).id).toBe("far");
  });

  it("副刀排除黑名单 — boss/core/fuseState=arming/非战区", () => {
    const game = makeGame();
    pushEnemy(game, { kind: "boss", y: 400, id: "boss_enemy" });
    pushEnemy(game, { kind: "core", y: 400, id: "core_enemy" });
    pushEnemy(game, { kind: "powder", y: 400, id: "fusing_powder", _fuseState: "arming" });
    pushEnemy(game, { kind: "infantry", y: 100, id: "out_of_zone" });
    pushEnemy(game, { kind: "infantry", y: 400, id: "valid" });
    (game as any)._eliteInvuln = false;

    const targets = (game as any).getValidSubBladeTargets();
    const ids = targets.map((t: any) => t.id);
    expect(ids).not.toContain("boss_enemy");
    expect(ids).not.toContain("core_enemy");
    expect(ids).not.toContain("fusing_powder");
    expect(ids).not.toContain("out_of_zone");
    expect(ids).toContain("valid");
  });
});
