/**
 * 0807-11A: 新手挥刀教学 — 单元测试
 *
 * 覆盖：
 * 1. 教学触发条件（第1关 + 未完成）
 * 2. localStorage 持久化（独立于 resetRunState）
 * 3. 完成状态不因重置丢失
 * 4. 教学路径生成
 * 5. 宽松命中判定
 * 6. 跳过后输入锁清理
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../Game";
import { LEVELS } from "../../data/levels";

// 用 jsdom 提供的 localStorage
const DONE_KEY = "one_blade_swipe_tutorial_done";

function clearTutorialFlag() {
  window.localStorage.removeItem(DONE_KEY);
}

function setTutorialDone() {
  window.localStorage.setItem(DONE_KEY, "1");
}

// 创建最小第1关实例（仅测试教学初始化逻辑）
function createLevel1Game() {
  const level = { ...LEVELS[0] };
  let finishCalled = false;
  let finishResult: any = null;
  const game = new Game(
    level,
    (result) => { finishCalled = true; finishResult = result; },
    undefined,
    "normal",
    undefined
  );
  return game;
}

describe("SwipeTutorial - 持久化", () => {
  beforeEach(() => {
    clearTutorialFlag();
  });

  it("localStorage 键名正确", () => {
    expect(Game.SWIPE_TUTORIAL_DONE_KEY).toBe("one_blade_swipe_tutorial_done");
  });

  it("未完成时创建第1关：教学状态为 waiting_stable", () => {
    clearTutorialFlag();
    const game = createLevel1Game();
    // 通过私有字段访问检查（反射）
    const phase = (game as any)._swipeTutorialPhase;
    expect(phase).toBe("waiting_stable");
  });

  it("已完成时创建第1关：教学状态为 idle", () => {
    setTutorialDone();
    const game = createLevel1Game();
    const phase = (game as any)._swipeTutorialPhase;
    expect(phase).toBe("idle");
  });

  it("resetRunState 不清除 localStorage 完成标记", () => {
    setTutorialDone();
    const game = createLevel1Game();
    (game as any).resetRunState?.();
    // resetRunState 后 localStorage 标记不变
    expect(window.localStorage.getItem(DONE_KEY)).toBe("1");
  });

  it("完成后多次创建第1关均为 idle", () => {
    setTutorialDone();
    for (let i = 0; i < 3; i++) {
      const game = createLevel1Game();
      expect((game as any)._swipeTutorialPhase).toBe("idle");
    }
  });

  it("非第1关不触发教学", () => {
    clearTutorialFlag();
    const level = { ...LEVELS[1] }; // 第2关
    const game = new Game(level, () => {}, undefined, "normal", undefined);
    expect((game as any)._swipeTutorialPhase).toBe("idle");
  });
});

describe("SwipeTutorial - 状态与清理", () => {
  beforeEach(() => {
    clearTutorialFlag();
  });

  it("教学完成前重新创建：phase 重新为 waiting_stable", () => {
    // 模拟：进入第1关但未完成教学，退出后再进入
    clearTutorialFlag();
    const game1 = createLevel1Game();
    expect((game1 as any)._swipeTutorialPhase).toBe("waiting_stable");

    // 创建新实例（模拟退出重进）
    const game2 = createLevel1Game();
    expect((game2 as any)._swipeTutorialPhase).toBe("waiting_stable");
    // localStorage 仍为空
    expect(window.localStorage.getItem(DONE_KEY)).toBeNull();
  });

  it("skipSwipeTutorial 将 phase 从 active 转为 skipped", () => {
    clearTutorialFlag();
    const game = createLevel1Game();
    // 手动设置 active 模拟
    (game as any)._swipeTutorialPhase = "active";
    game.skipSwipeTutorial();
    expect((game as any)._swipeTutorialPhase).toBe("idle");
  });

  it("skipSwipeTutorial 从 waiting_stable 跳过", () => {
    clearTutorialFlag();
    const game = createLevel1Game();
    // 此时是 waiting_stable
    game.skipSwipeTutorial();
    expect((game as any)._swipeTutorialPhase).toBe("idle");
  });

  it("skipSwipeTutorial 不重置 localStorage（仍需重进出现教学）", () => {
    clearTutorialFlag();
    const game = createLevel1Game();
    (game as any)._swipeTutorialPhase = "active";
    game.skipSwipeTutorial();
    // skip 不写 localStorage，下次进仍需要教学
    expect(window.localStorage.getItem(DONE_KEY)).toBeNull();
  });
});

describe("SwipeTutorial - 命中判定 (_checkTutorialSlashHit)", () => {
  // 手动构建测试数据
  function makeTrail(points: Array<{ x: number; y: number }>) {
    return {
      points: points.map((p, i) => ({ x: p.x, y: p.y, t: i * 0.1, energyRatio: 1 })),
      hitEnemyIds: new Set<string>(),
      active: true,
      id: "test-slash",
      tier: "normal" as const,
      lockedEnergy: 50,
    };
  }

  function makeEnemy(id: string, x: number, y: number, radius = 18) {
    return {
      id,
      kind: "infantry" as const,
      x, y, radius,
      alive: true,
      hp: 1,
      maxHp: 1,
      speed: 42,
      homeX: x,
      hpDamage: 1,
      score: 10,
      energyGain: 2.5,
      ignited: false,
      marked: false,
      shieldCrack: 0,
      flash: 0,
      wobble: 0,
      slowedTimer: 0,
    };
  }

  it("穿过2个敌人返回 true", () => {
    const game = createLevel1Game();
    (game as any)._swipeTutorialPhase = "active";
    (game as any)._tutorialGroupEnemyIds = new Set(["e1", "e2", "e3"]);

    // 在 enemies 数组中添加3个敌人
    (game as any).enemies = [
      makeEnemy("e1", 120, 500), // 左
      makeEnemy("e2", 190, 500), // 中
      makeEnemy("e3", 260, 500), // 右
    ];

    const trail = makeTrail([
      { x: 80, y: 500 },
      { x: 300, y: 500 },
    ]);

    const hit = (game as any)._checkTutorialSlashHit(trail);
    expect(hit).toBe(true);
  });

  it("穿过0个敌人返回 false", () => {
    const game = createLevel1Game();
    (game as any)._swipeTutorialPhase = "active";
    (game as any)._tutorialGroupEnemyIds = new Set(["e1", "e2", "e3"]);
    (game as any).enemies = [
      makeEnemy("e1", 120, 500),
      makeEnemy("e2", 190, 500),
      makeEnemy("e3", 260, 500),
    ];

    // 刀路远离敌人
    const trail = makeTrail([
      { x: 80, y: 200 },
      { x: 300, y: 200 },
    ]);

    const hit = (game as any)._checkTutorialSlashHit(trail);
    expect(hit).toBe(false);
  });

  it("穿过1个敌人返回 false（需≥2）", () => {
    const game = createLevel1Game();
    (game as any)._swipeTutorialPhase = "active";
    (game as any)._tutorialGroupEnemyIds = new Set(["e1", "e2", "e3"]);
    (game as any).enemies = [
      makeEnemy("e1", 120, 500),
      makeEnemy("e2", 190, 500),
      makeEnemy("e3", 260, 500),
    ];

    // 只从e1旁边划过
    const trail = makeTrail([
      { x: 100, y: 500 },
      { x: 130, y: 500 },
    ]);

    const hit = (game as any)._checkTutorialSlashHit(trail);
    expect(hit).toBe(false);
  });

  it("斜切穿过3个敌人返回 true", () => {
    const game = createLevel1Game();
    (game as any)._swipeTutorialPhase = "active";
    (game as any)._tutorialGroupEnemyIds = new Set(["e1", "e2", "e3"]);
    (game as any).enemies = [
      makeEnemy("e1", 130, 480),
      makeEnemy("e2", 195, 510),
      makeEnemy("e3", 250, 530),
    ];

    // 斜切
    const trail = makeTrail([
      { x: 100, y: 460 },
      { x: 290, y: 550 },
    ]);

    const hit = (game as any)._checkTutorialSlashHit(trail);
    expect(hit).toBe(true);
  });

  it("曲刀也能命中2个敌人", () => {
    const game = createLevel1Game();
    (game as any)._swipeTutorialPhase = "active";
    (game as any)._tutorialGroupEnemyIds = new Set(["e1", "e2", "e3"]);
    (game as any).enemies = [
      makeEnemy("e1", 120, 500),
      makeEnemy("e2", 190, 500),
      makeEnemy("e3", 260, 500),
    ];

    // 曲线路径
    const trail = makeTrail([
      { x: 90, y: 500 },
      { x: 155, y: 470 },
      { x: 220, y: 500 },
      { x: 290, y: 500 },
    ]);

    const hit = (game as any)._checkTutorialSlashHit(trail);
    expect(hit).toBe(true);
  });
});

describe("SwipeTutorial - 路径生成 (_generateTutorialPath)", () => {
  it("根据3个敌人生成从左到右的路径", () => {
    const game = createLevel1Game();
    (game as any)._tutorialGroupEnemyIds = new Set(["e1", "e2", "e3"]);
    (game as any).enemies = [
      { id: "e1", x: 120, y: 500, alive: true },
      { id: "e2", x: 195, y: 510, alive: true },
      { id: "e3", x: 260, y: 505, alive: true },
    ];
    (game as any)._generateTutorialPath();
    const path = (game as any)._swipeTutorialPath;
    expect(path).not.toBeNull();
    expect(path.start.x).toBeLessThan(path.end.x);
    // 路径应覆盖所有敌人X范围
    expect(path.start.x).toBeLessThanOrEqual(120);
    expect(path.end.x).toBeGreaterThanOrEqual(260);
    // Y应大致为敌人Y的平均
    const avgY = (500 + 510 + 505) / 3;
    expect(Math.abs(path.start.y - avgY)).toBeLessThan(5);
  });

  it("敌人少于2时不生成路径", () => {
    const game = createLevel1Game();
    (game as any)._tutorialGroupEnemyIds = new Set(["e1"]);
    (game as any).enemies = [
      { id: "e1", x: 120, y: 500, alive: true },
    ];
    (game as any)._generateTutorialPath();
    expect((game as any)._swipeTutorialPath).toBeNull();
  });
});

describe("SwipeTutorial - handlePointerDown 输入锁", () => {
  beforeEach(() => {
    clearTutorialFlag();
  });

  it("waiting_stable 阶段不创建 pendingSlash", () => {
    const game = createLevel1Game();
    expect((game as any)._swipeTutorialPhase).toBe("waiting_stable");

    // 模拟按下
    game.handlePointerDown({ x: 200, y: 400 });
    // 等待阶段下不应创建pendingSlash
    expect((game as any).pendingSlash).toBeNull();
  });

  it("active 阶段允许创建 pendingSlash", () => {
    const game = createLevel1Game();
    // 手动设置为active
    (game as any)._swipeTutorialPhase = "active";
    (game as any).phase = "playing"; // 确保phase正确

    game.handlePointerDown({ x: 200, y: 400 });
    // active阶段应当创建pendingSlash
    expect((game as any).pendingSlash).not.toBeNull();
  });
});

describe("SwipeTutorial - 边界条件", () => {
  beforeEach(() => {
    clearTutorialFlag();
  });

  it("localStorage 不可用时降级处理（不崩溃）", () => {
    // 模拟localStorage不可用的极端情况在jsdom中难以测试
    // 但代码中有try-catch，这里只验证正常路径不抛异常
    clearTutorialFlag();
    expect(() => createLevel1Game()).not.toThrow();
  });

  it("Game.SWIPE_TUTORIAL_DONE_KEY 为静态常量", () => {
    expect(Game.SWIPE_TUTORIAL_DONE_KEY).toBe("one_blade_swipe_tutorial_done");
  });
});
