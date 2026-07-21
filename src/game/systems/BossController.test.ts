import { describe, it, expect, beforeEach } from "vitest";
import { BossController } from "./BossController";

/** 创建一个快速测试用的BossController */
function createBoss(): BossController {
  const bc = new BossController("thunderGeneral");
  bc.enterLoading();
  // 直接跳到armor阶段
  bc.skipIntro();
  return bc;
}

/** 测试用辅助：创建Vec2 */
function v(x: number, y: number) { return { x, y }; }

describe("BossController - 护甲解析", () => {
  let bc: BossController;

  beforeEach(() => {
    bc = createBoss();
  });

  it("初始状态为armor", () => {
    expect(bc.phase).toBe("armor");
  });

  it("护甲进度初始0/3", () => {
    expect(bc.debugSnapshot["Armor Progress"]).toBe("0/3");
  });

  it("一刀穿过左肩甲 → armor_hit, 进度1/3", () => {
    const result = bc.resolveArmorSegment(v(141, 145), v(181, 185), "slash_1");
    expect(result).not.toBeNull();
    if (result!.kind === "armor_hit") {
      expect(result!.progress).toBe(1);
    }
    expect(bc.debugSnapshot["Armor Progress"]).toBe("1/3");
  });

  it("同一刀只能破一甲（第二个segments返回null）", () => {
    bc.resolveArmorSegment(v(141, 145), v(181, 185), "slash_1");
    bc.update(0.5);
    const result = bc.resolveArmorSegment(v(161, 155), v(200, 180), "slash_1");
    expect(result).toBeNull();
    expect(bc.debugSnapshot["Armor Progress"]).toBe("1/3");
  });

  it("三次独立挥刀完成3/3", () => {
    // 第1刀: 左肩 (center: 211-50=161, 195-30=165, rx=34, ry=26)
    const r1 = bc.resolveArmorSegment(v(141, 145), v(181, 185), "s1");
    expect(r1?.kind).toBe("armor_hit");
    expect(bc.debugSnapshot["Armor Progress"]).toBe("1/3");
    bc.update(0.5);
    // 第2刀: 右肩 (center: 211+50=261, 165)
    const r2 = bc.resolveArmorSegment(v(221, 135), v(301, 195), "s2");
    expect(r2?.kind).toBe("armor_hit");
    expect(bc.debugSnapshot["Armor Progress"]).toBe("2/3");
    bc.update(0.5);
    // 第3刀: 胸甲 (center: 211, 201, rx=28, ry=30)
    const r3 = bc.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    expect(r3?.kind).toBe("armor_hit");
    expect(bc.debugSnapshot["Armor Progress"]).toBe("3/3");
  });

  it("第三刀完成后进入armor_break_show", () => {
    bc.resolveArmorSegment(v(141, 145), v(181, 185), "s1");
    bc.update(0.5);
    bc.resolveArmorSegment(v(221, 135), v(301, 195), "s2");
    bc.update(0.5);
    bc.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    expect(bc.phase).toBe("armor_break_show");
  });

  it("armor_break_show 1.2秒后进入armor_complete_hold", () => {
    bc.resolveArmorSegment(v(141, 145), v(181, 185), "s1");
    bc.update(0.5);
    bc.resolveArmorSegment(v(221, 135), v(301, 195), "s2");
    bc.update(0.5);
    bc.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    expect(bc.phase).toBe("armor_break_show");
    bc.update(0.5); bc.update(0.5); bc.update(0.5);
    expect(bc.phase).toBe("armor_complete_hold");
  });

  it("armor_complete_hold 时 freezeCombatResources=true", () => {
    bc.resolveArmorSegment(v(141, 145), v(181, 185), "s1");
    bc.update(0.5);
    bc.resolveArmorSegment(v(221, 135), v(301, 195), "s2");
    bc.update(0.5);
    bc.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    expect(bc.phase).toBe("armor_break_show");
    bc.update(0.5); bc.update(0.5); bc.update(0.5);
    expect(bc.phase).toBe("armor_complete_hold");
    expect(bc.freezeCombatResources).toBe(true);
    expect(bc.inputLocked).toBe(true);
  });

  it("完全挥空 → miss", () => {
    // 刀路在屏幕下方，离Boss很远
    const result = bc.resolveArmorSegment(v(50, 700), v(100, 750), "slash_miss");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("miss");
  });

  it("命中Boss身体非护甲 → 收刀后wrong_hit", () => {
    // 切中Boss躯干（center: 211, 190 附近）
    const r1 = bc.resolveArmorSegment(v(180, 180), v(200, 200), "s1");
    expect(r1!.kind).toBe("miss"); // body_contact返回miss
    const finish = bc.finishSlash("s1");
    expect(finish).not.toBeNull();
    expect(finish!.kind).toBe("wrong_hit");
  });

  it("护甲切换期间 armorSwitching=true, inputLocked=true", () => {
    bc.resolveArmorSegment(v(141, 145), v(181, 185), "s1");
    expect(bc.armorSwitching).toBe(true);
    expect(bc.inputLocked).toBe(true);
    // 推进0.5秒后切换完成
    bc.update(0.5);
    expect(bc.armorSwitching).toBe(false);
  });

  it("Boss HP保持满值且不变", () => {
    expect(bc.bossHP).toBe(bc.bossMaxHP);
    bc.resolveArmorSegment(v(130, 140), v(180, 180), "s1");
    expect(bc.bossHP).toBe(bc.bossMaxHP);
    bc.resolveArmorSegment(v(230, 140), v(280, 180), "s2");
    expect(bc.bossHP).toBe(bc.bossMaxHP);
  });

  it("Boss模式不产生普通段位文字", () => {
    // 验证resolveArmorSegment在armor阶段不返回普通blade-tier类结果
    const result = bc.resolveArmorSegment(v(50, 50), v(100, 100), "s1");
    expect(result).not.toBeNull();
    // 只能返回armor_hit/wrong_hit/miss，不能返回blade-tier类
    expect(["armor_hit", "wrong_hit", "miss"]).toContain(result!.kind);
  });

  it("renderWorld与renderOverlay可分别调用不报错", () => {
    // 模拟Canvas context（包含BossController所需全部方法）
    const ctx = {
      save: () => {}, restore: () => {},
      fillStyle: "", strokeStyle: "", lineWidth: 0, globalAlpha: 1,
      font: "", textAlign: "left" as CanvasTextAlign, textBaseline: "top" as CanvasTextBaseline,
      shadowColor: "", shadowBlur: 0,
      fillRect: () => {}, fillText: () => {},
      beginPath: () => {}, closePath: () => {},
      moveTo: () => {}, lineTo: () => {},
      arc: () => {}, ellipse: () => {},
      fill: () => {}, stroke: () => {},
      roundRect: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      setTransform: () => {}, translate: () => {}, scale: () => {},
      clip: () => {},
      measureText: () => ({ width: 10 }),
      getLineDash: () => [], setLineDash: () => {},
    } as any;
    bc.renderWorld(ctx);
    bc.renderOverlay(ctx);
    // 不报错即通过
  });

  it("完整update推进入armor（不依赖skipIntro）", () => {
    const bc2 = new BossController("thunderGeneral");
    bc2.enterLoading();
    expect(bc2.phase).toBe("loading");
    bc2.update(0.01);
    expect(bc2.phase).toBe("intro");
    bc2.update(1.5);
    bc2.update(1.5);
    expect(bc2.phase).toBe("armor");
    expect(bc2.debugSnapshot["Armor Progress"]).toBe("0/3");
  });

  it("bossImpact只触发一次（_impactTriggered防护）", () => {
    const bc2 = new BossController("thunderGeneral");
    bc2.enterLoading();
    bc2.update(0.01);
    bc2.update(1.25);
    expect(bc2["_impactTriggered"]).toBe(true);
    bc2.update(0.1);
    expect(bc2["_impactTriggered"]).toBe(true);
  });

  // ===== P4.4A.3: 追击状态测试 =====

  it("armor_complete_hold 0.34秒仍为hold，0.35秒进入pursuit_intro", () => {
    bc3s();
    const bc3 = new BossController("thunderGeneral");
    bc3.enterLoading();
    bc3.skipIntro();
    // 快速完成破甲
    bc3.resolveArmorSegment(v(141, 145), v(181, 185), "s1");
    bc3.update(0.5);
    bc3.resolveArmorSegment(v(221, 135), v(301, 195), "s2");
    bc3.update(0.5);
    bc3.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    bc3.update(0.5); bc3.update(0.5); bc3.update(0.5); // → armor_complete_hold
    expect(bc3.phase).toBe("armor_complete_hold");
    bc3.update(0.34); // 0.34s仍为hold
    expect(bc3.phase).toBe("armor_complete_hold");
    bc3.update(0.02); // 跨过0.35门槛
    expect(bc3.phase).toBe("pursuit_intro");
    expect(bc3["objectiveText"]).toBe("趁弱点显现时追击");
    expect(bc3["objectiveAlpha"]).toBeGreaterThan(0);
  });

  function bc3s() {} // 辅助让测试范围正确

  it("pursuit_intro期间inputLocked=true", () => {
    const bc3 = new BossController("thunderGeneral");
    bc3.enterLoading(); bc3.skipIntro();
    bc3.resolveArmorSegment(v(141, 145), v(181, 185), "s1");
    bc3.update(0.5);
    bc3.resolveArmorSegment(v(221, 135), v(301, 195), "s2");
    bc3.update(0.5);
    bc3.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    bc3.update(0.5); bc3.update(0.5); bc3.update(0.5);
    bc3.update(0.5);
    expect(bc3.phase).toBe("pursuit_intro");
    expect(bc3.inputLocked).toBe(true);
    expect(bc3.freezeCombatResources).toBe(true);
  });

  it("pursuit_intro 0.89秒仍为intro，0.90秒进入pursuit", () => {
    const bc3 = new BossController("thunderGeneral");
    bc3.enterLoading(); bc3.skipIntro();
    bc3.resolveArmorSegment(v(141, 145), v(181, 185), "s1");
    bc3.update(0.5);
    bc3.resolveArmorSegment(v(221, 135), v(301, 195), "s2");
    bc3.update(0.5);
    bc3.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    bc3.update(0.5); bc3.update(0.5); bc3.update(0.5);
    bc3.update(0.5); // → pursuit_intro
    expect(bc3.phase).toBe("pursuit_intro");
    bc3.update(0.89); // 仍为intro
    expect(bc3.phase).toBe("pursuit_intro");
    bc3.update(0.02); // 跨过0.9门槛
    expect(bc3.phase).toBe("pursuit");
  });

  it("pursuit阶段inputLocked=false，coreExposed=true", () => {
    const bc3 = new BossController("thunderGeneral");
    bc3.enterLoading(); bc3.skipIntro();
    bc3.resolveArmorSegment(v(141, 145), v(181, 185), "s1");
    bc3.update(0.5);
    bc3.resolveArmorSegment(v(221, 135), v(301, 195), "s2");
    bc3.update(0.5);
    bc3.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    bc3.update(0.5); bc3.update(0.5); bc3.update(0.5);
    bc3.update(0.5); bc3.update(1.0);
    expect(bc3.phase).toBe("pursuit");
    expect(bc3.inputLocked).toBe(false);
    expect(bc3.coreExposed).toBe(true);
  });

  // ===== P4.4A.3: 追击判定测试 =====

  /** 推进到pursuit阶段的辅助函数 */
  function toPursuit(bc3: BossController): void {
    bc3.enterLoading(); bc3.skipIntro();
    bc3.resolveArmorSegment(v(141, 145), v(181, 185), "s1"); bc3.update(0.5);
    bc3.resolveArmorSegment(v(221, 135), v(301, 195), "s2"); bc3.update(0.5);
    bc3.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    bc3.update(0.5); bc3.update(0.5); bc3.update(0.5);
    bc3.update(0.5); bc3.update(1.0);
    expect(bc3.phase).toBe("pursuit");
  }

  it("resolvePursuitSegment使用独立结果类型而非armor_hit", () => {
    const bc3 = new BossController("thunderGeneral");
    toPursuit(bc3);
    const r = bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p1");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("pursuit_hit");
  });

  it("三个不同slashId推进追击0/3→3/3", () => {
    const bc3 = new BossController("thunderGeneral");
    toPursuit(bc3);
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p1");
    expect(bc3.debugSnapshot["Pursuit"]).toBe("1/3");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p2");
    expect(bc3.debugSnapshot["Pursuit"]).toBe("2/3");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p3");
    expect(bc3.debugSnapshot["Pursuit"]).toBe("3/3");
  });

  it("同一slashId只推进一次", () => {
    const bc3 = new BossController("thunderGeneral");
    toPursuit(bc3);
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p1");
    expect(bc3.debugSnapshot["Pursuit"]).toBe("1/3");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p1"); // same slash
    expect(bc3.debugSnapshot["Pursuit"]).toBe("1/3");
  });

  it("pursuit_body_hit不推进进度", () => {
    const bc3 = new BossController("thunderGeneral");
    toPursuit(bc3);
    // 切中身体左侧
    const r = bc3.resolvePursuitSegment(v(160, 180), v(190, 230), "pb1");
    expect(r!.kind).toBe("pursuit_body_hit");
    expect(bc3.debugSnapshot["Pursuit"]).toBe("0/3");
  });

  it("pursuit_miss不推进进度", () => {
    const bc3 = new BossController("thunderGeneral");
    toPursuit(bc3);
    const r = bc3.resolvePursuitSegment(v(50, 700), v(100, 750), "pm1");
    expect(r!.kind).toBe("pursuit_miss");
    expect(bc3.debugSnapshot["Pursuit"]).toBe("0/3");
  });

  it("第三击进入core_break", () => {
    const bc3 = new BossController("thunderGeneral");
    bc3.enterLoading(); bc3.skipIntro();
    // 快速完成破甲
    bc3.resolveArmorSegment(v(141, 145), v(181, 185), "s1"); bc3.update(0.5);
    bc3.resolveArmorSegment(v(221, 135), v(301, 195), "s2"); bc3.update(0.5);
    bc3.resolveArmorSegment(v(181, 171), v(241, 231), "s3");
    bc3.update(0.5); bc3.update(0.5); bc3.update(0.5);
    bc3.update(0.5); bc3.update(1.0);
    expect(bc3.phase).toBe("pursuit");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p1");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p2");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p3");
    expect(bc3.phase).toBe("core_break");
  });

  it("core_break锁定输入并冻结资源", () => {
    const bc3 = new BossController("thunderGeneral");
    toPursuit(bc3);
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p1");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p2");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p3");
    expect(bc3.phase).toBe("core_break");
    expect(bc3.inputLocked).toBe(true);
    expect(bc3.freezeCombatResources).toBe(true);
  });

  it("core_break 1.2秒后进入execution_intro", () => {
    const bc3 = new BossController("thunderGeneral");
    toPursuit(bc3);
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p1");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p2");
    bc3.resolvePursuitSegment(v(181, 171), v(241, 231), "p3");
    expect(bc3.phase).toBe("core_break");
    bc3.update(1.2);
    expect(bc3.phase).toBe("execution_intro");
    expect(bc3.inputLocked).toBe(true);
    expect(bc3.freezeCombatResources).toBe(true);
  });

  it("重新enterLoading重置所有状态", () => {
    const bc3 = new BossController("thunderGeneral");
    bc3["pursuitEnergyBoosted"] = true;
    // 通过debugSnapshot间接验证
    bc3.enterLoading();
    expect(bc3["pursuitEnergyBoosted"]).toBe(false);
    expect(bc3.debugSnapshot["Pursuit"]).toBe("0/3");
  });
});
