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
    // 左肩中心在 (DESIGN_WIDTH/2 - 50, renderY - 30) = (161, 165)
    // 从左上到右下穿过左肩甲区域
    const result = bc.resolveArmorSegment(v(130, 140), v(180, 180), "slash_1");
    expect(result).not.toBeNull();
    if (result!.kind === "armor_hit") {
      expect(result!.progress).toBe(1);
    }
    expect(bc.debugSnapshot["Armor Progress"]).toBe("1/3");
  });

  it("同一刀只能破一甲（第二个segments返回null）", () => {
    bc.resolveArmorSegment(v(130, 140), v(180, 180), "slash_1");
    // 等待切换延迟
    bc.update(0.5);
    // 再次使用同一slashId→应被整刀锁拦截
    const result = bc.resolveArmorSegment(v(130, 140), v(230, 180), "slash_1");
    expect(result).toBeNull();
    expect(bc.debugSnapshot["Armor Progress"]).toBe("1/3");
  });

  it("三次独立挥刀完成3/3", () => {
    // 第1刀: 左肩
    bc.resolveArmorSegment(v(130, 140), v(180, 180), "slash_1");
    expect(bc.debugSnapshot["Armor Progress"]).toBe("1/3");
    bc.update(0.5); // 等待切换延迟0.45s
    // 第2刀: 右肩 (center: 211+50=261, 165, rx=34, ry=26)
    const r2 = bc.resolveArmorSegment(v(220, 130), v(300, 190), "slash_2");
    if (r2?.kind !== "armor_hit") {
      bc.resolveArmorSegment(v(200, 140), v(320, 200), "slash_2b");
    }
    expect(bc.debugSnapshot["Armor Progress"]).toBe("2/3");
    bc.update(0.5); // 等待切换延迟
    // 第3刀: 胸甲 (center: 211, 201, rx=28, ry=30)
    const r3 = bc.resolveArmorSegment(v(180, 180), v(240, 220), "slash_3");
    if (r3?.kind !== "armor_hit") {
      bc.resolveArmorSegment(v(160, 170), v(260, 220), "slash_3b");
    }
    expect(bc.debugSnapshot["Armor Progress"]).toBe("3/3");
  });

  it("第三刀完成后进入armor_break_show", () => {
    bc.resolveArmorSegment(v(130, 140), v(180, 180), "s1");
    bc.update(0.5);
    bc.resolveArmorSegment(v(230, 140), v(280, 180), "s2");
    bc.update(0.5);
    bc.resolveArmorSegment(v(180, 180), v(240, 220), "s3");
    expect(bc.phase).toBe("armor_break_show");
  });

  it("armor_break_show 1.2秒后进入armor_complete_hold", () => {
    bc.resolveArmorSegment(v(130, 140), v(180, 180), "s1");
    bc.update(0.5);
    bc.resolveArmorSegment(v(230, 140), v(280, 180), "s2");
    bc.update(0.5);
    bc.resolveArmorSegment(v(180, 180), v(240, 220), "s3");
    expect(bc.phase).toBe("armor_break_show");
    bc.update(0.5); bc.update(0.5); bc.update(0.5); // 1.5s → armor_complete_hold
    expect(bc.phase).toBe("armor_complete_hold");
  });

  it("armor_complete_hold 时 freezeCombatResources=true", () => {
    bc.resolveArmorSegment(v(130, 140), v(180, 180), "s1");
    bc.update(0.5);
    bc.resolveArmorSegment(v(230, 140), v(280, 180), "s2");
    bc.update(0.5);
    bc.resolveArmorSegment(v(180, 180), v(240, 220), "s3");
    expect(bc.phase).toBe("armor_break_show");
    bc.update(0.5); bc.update(0.5); bc.update(0.5); // 1.5s → armor_complete_hold
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
    // 命左肩 → 触发切换延迟
    bc.resolveArmorSegment(v(130, 140), v(180, 180), "s1");
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
});
