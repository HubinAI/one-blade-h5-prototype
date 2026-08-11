import { describe, it, expect } from "vitest";
import { getIdleRatePerHour, getIdleQuality, IDLE_STAGE_CONFIG, IDLE_CONFIG_COMMON } from "./idleProduction";

describe("挂机产出配置", () => {
  // Key floors
  it("F2: white 2.0/h", () => { expect(getIdleQuality(2)).toBe("white"); expect(getIdleRatePerHour(2)).toBe(2.0); });
  it("F5: white 2.4/h", () => expect(getIdleRatePerHour(5)).toBe(2.4));
  it("F15: white 3.0/h", () => { expect(getIdleQuality(15)).toBe("white"); expect(getIdleRatePerHour(15)).toBe(3.0); });
  it("F30: white 4.0/h", () => expect(getIdleRatePerHour(30)).toBe(4.0));
  it("F31: green 2.0/h", () => { expect(getIdleQuality(31)).toBe("green"); expect(getIdleRatePerHour(31)).toBe(2.0); });
  it("F50: green 3.0/h", () => expect(getIdleRatePerHour(50)).toBe(3.0));
  it("F51: blue 1.8/h", () => { expect(getIdleQuality(51)).toBe("blue"); expect(getIdleRatePerHour(51)).toBe(1.8); });
  it("F75: blue 2.8/h", () => expect(getIdleRatePerHour(75)).toBe(2.8));
  it("F76: purple 1.6/h", () => { expect(getIdleQuality(76)).toBe("purple"); expect(getIdleRatePerHour(76)).toBe(1.6); });
  it("F105: purple 2.6/h", () => expect(getIdleRatePerHour(105)).toBe(2.6));
  it("F106: orange 1.4/h", () => { expect(getIdleQuality(106)).toBe("orange"); expect(getIdleRatePerHour(106)).toBe(1.4); });
  it("F140: orange 2.4/h", () => expect(getIdleRatePerHour(140)).toBe(2.4));
  it("F141: red 1.2/h", () => { expect(getIdleQuality(141)).toBe("red"); expect(getIdleRatePerHour(141)).toBe(1.2); });
  it("F180: red 2.2/h", () => expect(getIdleRatePerHour(180)).toBe(2.2));

  // 8h/24h at key points
  it("F5 8h=19.2刀 (white)", () => expect(Math.floor(getIdleRatePerHour(5)*8)).toBe(19));
  it("F5 24h=57.6刀 (white)", () => expect(Math.floor(getIdleRatePerHour(5)*24)).toBe(57));
  it("F30 8h=32刀 (white)", () => expect(getIdleRatePerHour(30)*8).toBe(32));
  it("F50 8h=24刀 (green)", () => expect(getIdleRatePerHour(50)*8).toBe(24));
  it("F75 8h=22.4刀 (blue)", () => expect(Math.floor(getIdleRatePerHour(75)*8)).toBe(22));
  it("F105 8h=20.8刀 (purple)", () => expect(Math.floor(getIdleRatePerHour(105)*8)).toBe(20));
  it("F180 8h=17.6刀 (red)", () => expect(Math.floor(getIdleRatePerHour(180)*8)).toBe(17));

  // Config integrity
  it("8 stages", () => expect(IDLE_STAGE_CONFIG.length).toBe(8));
  it("capHours=24", () => expect(IDLE_CONFIG_COMMON.capHours).toBe(24));
  it("fastIdleEnabled=false", () => expect(IDLE_CONFIG_COMMON.fastIdleEnabled).toBe(false));
  it("F1 rate=0 (未解锁)", () => expect(getIdleRatePerHour(1)).toBe(0));
  it("1~180 all defined", () => {
    for (let f=2; f<=180; f++) {
      expect(getIdleQuality(f)).toBeDefined();
      expect(getIdleRatePerHour(f)).toBeGreaterThan(0);
    }
  });
});
