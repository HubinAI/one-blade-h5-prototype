import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MainMenu } from "./MainMenu";

function createMockHome(): any {
  return {
    coins: 100,
    stamina: 50,
    staminaMax: 100,
    highestFloor: 6,
    blades: [],
    equipment: [],
    offlineCoins: 0,
    dailyChallengeDone: false,
    runIndex: 0,
    staminaNextText: "2小时恢复",
    chestProgress: 0,
    chestTarget: 100,
    currentFloor: 6,
    currentGate: null,
    loginDayCount: 1,
    dailyShareDone: false,
    sawBossPreview: false,
    actReached: 0,
  };
}

describe("MainMenu - 首页突破入口", () => {
  it("pendingGate时显示Boss预览，不显示砍树动画", () => {
    const { container } = render(
      <MainMenu
        unlockedLevel={6}
        home={createMockHome()}
        onStart={() => {}}
        onContinue={() => {}}
        onRestoreStamina={() => {}}
        onRanking={() => {}}
        onBag={() => {}}
        onIdle={() => {}}
        onDebug={() => {}}
        appVersion="test"
        pendingGate={{
          breakthroughName: "练气突破",
          unlockText: "解锁主线第6-15关",
          breakthroughId: "thunderGeneral",
        }}
        onBreakthrough={() => {}}
      />
    );

    const preview = container.querySelector('[data-testid="thunder-general-preview"]');
    expect(preview).toBeTruthy();

    const tree = container.querySelector('[data-testid="idle-tree-animation"]');
    expect(tree).toBeFalsy();
  });

  it("无pendingGate时正常显示砍树动画", () => {
    const { container } = render(
      <MainMenu
        unlockedLevel={3}
        home={createMockHome()}
        onStart={() => {}}
        onContinue={() => {}}
        onRestoreStamina={() => {}}
        onRanking={() => {}}
        onBag={() => {}}
        onIdle={() => {}}
        onDebug={() => {}}
        appVersion="test"
        pendingGate={null}
        onBreakthrough={() => {}}
      />
    );

    const tree = container.querySelector('[data-testid="idle-tree-animation"]');
    expect(tree).toBeTruthy();

    const preview = container.querySelector('[data-testid="thunder-general-preview"]');
    expect(preview).toBeFalsy();
  });
});
