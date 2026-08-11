import { describe, it, expect } from "vitest";
import { getFloorRewardConfig, FIRST_CLEAR_REWARD_CONFIG } from "./firstClearReward";

describe("首通奖励配置", () => {
  // F1~5: 2/2/4/2/4 white
  it("F1=2白", () => { const r=getFloorRewardConfig(1); expect(r.quality).toBe("white"); expect(r.count).toBe(2); });
  it("F2=2白", () => { const r=getFloorRewardConfig(2); expect(r.quality).toBe("white"); expect(r.count).toBe(2); });
  it("F3=4白", () => { const r=getFloorRewardConfig(3); expect(r.quality).toBe("white"); expect(r.count).toBe(4); });
  it("F4=2白", () => { const r=getFloorRewardConfig(4); expect(r.quality).toBe("white"); expect(r.count).toBe(2); });
  it("F5=4白", () => { const r=getFloorRewardConfig(5); expect(r.quality).toBe("white"); expect(r.count).toBe(4); });

  // quality boundaries
  it("F15=白", () => expect(getFloorRewardConfig(15).quality).toBe("white"));
  it("F16=白", () => expect(getFloorRewardConfig(16).quality).toBe("white"));
  it("F30=白", () => expect(getFloorRewardConfig(30).quality).toBe("white"));
  it("F31=绿", () => expect(getFloorRewardConfig(31).quality).toBe("green"));
  it("F50=绿", () => expect(getFloorRewardConfig(50).quality).toBe("green"));
  it("F51=蓝", () => expect(getFloorRewardConfig(51).quality).toBe("blue"));
  it("F75=蓝", () => expect(getFloorRewardConfig(75).quality).toBe("blue"));
  it("F76=紫", () => expect(getFloorRewardConfig(76).quality).toBe("purple"));
  it("F105=紫", () => expect(getFloorRewardConfig(105).quality).toBe("purple"));
  it("F106=橙", () => expect(getFloorRewardConfig(106).quality).toBe("orange"));
  it("F140=橙", () => expect(getFloorRewardConfig(140).quality).toBe("orange"));
  it("F141=红", () => expect(getFloorRewardConfig(141).quality).toBe("red"));
  it("F180=红", () => expect(getFloorRewardConfig(180).quality).toBe("red"));

  // count cycle
  it("F6 count=2 (cycle)", () => expect(getFloorRewardConfig(6).count).toBe(2));
  it("F10 count=4 (cycle)", () => expect(getFloorRewardConfig(10).count).toBe(4));

  // coverage
  it("1~180 all defined", () => {
    for (let f=1; f<=180; f++) {
      const r = getFloorRewardConfig(f);
      expect(r.quality).toBeDefined();
      expect(r.count).toBeGreaterThan(0);
    }
  });

  // config structure
  it("7 stages", () => expect(FIRST_CLEAR_REWARD_CONFIG.stages.length).toBe(7));
  it("countPattern [2,2,4,2,4]", () => expect(FIRST_CLEAR_REWARD_CONFIG.countPattern).toEqual([2,2,4,2,4]));
});
