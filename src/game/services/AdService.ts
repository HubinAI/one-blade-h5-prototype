import { AD_CONFIG } from "../config/ads";
import { logEvent } from "./Analytics";

/** 广告类型枚举（微信小游戏 IAA） */
export type RewardAdReason =
  | "double_coins"       // 胜利页金币×2
  | "revive_extra_slash" // 失败页补一刀
  | "restore_energy"     // 体力不足时恢复10点
  | "quick_idle_reward"  // 离线收益翻倍
  | "daily_buff_refresh"; // 商店刷新

export type AdType = "rewarded" | "interstitial";
export type AdReason = "revive" | "double_reward" | "bonus_chest" | "stamina_restore" | "next_level" | "between_runs";

export type AdRequest = {
  adType: AdType;
  reason: AdReason;
  seconds: number;
  resolve: (success: boolean) => void;
};

const AD_EVENT = "one-blade-ad-request";

/** 模拟广告（不接真实微信广告 SDK） */
export function showRewardedAdMock(reason: RewardAdReason): Promise<boolean> {
  return new Promise(resolve => {
    console.log(`[AdMock] 模拟广告: ${reason}`);
    setTimeout(() => {
      console.log(`[AdMock] 广告完成: ${reason}`);
      resolve(true);
    }, 800);
  });
}

/** 已废弃的广告计数器（用 localStorage 替代） */
export const DAILY_AD_LIMITS: Record<string, number> = {
  restore_energy: 5,
  quick_idle_reward: 4,
};

export function getDailyAdCount(reason: RewardAdReason): number {
  const key = `ad_count_${reason}_${new Date().toISOString().slice(0, 10)}`;
  return parseInt(window.localStorage.getItem(key) ?? "0", 10);
}

export function incrementDailyAdCount(reason: RewardAdReason): void {
  const key = `ad_count_${reason}_${new Date().toISOString().slice(0, 10)}`;
  const count = getDailyAdCount(reason) + 1;
  window.localStorage.setItem(key, String(count));
}

function requestSimulatedAd(adType: AdType, reason: AdReason) {
  logEvent("ad_start", { adType, reason });

  return new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(true);
      return;
    }

    const request: AdRequest = {
      adType,
      reason,
      seconds: 3,
      resolve: (success) => {
        logEvent("ad_complete", { adType, reason });
        resolve(success);
      }
    };

    window.dispatchEvent(new CustomEvent<AdRequest>(AD_EVENT, { detail: request }));
  });
}

export const AdService = {
  eventName: AD_EVENT,

  canShowRewardedAd(reason: AdReason) {
    if (reason === "revive") return AD_CONFIG.rewardedRevive.enabled;
    if (reason === "double_reward") return AD_CONFIG.rewardedDoubleReward.enabled;
    if (reason === "bonus_chest") return AD_CONFIG.rewardedExtraChest.enabled;
    if (reason === "stamina_restore") return true;
    return true;
  },

  canShowInterstitialAd(_reason: AdReason) {
    return AD_CONFIG.interstitial.enabled;
  },

  async showRewardedAd(reason: AdReason) {
    if (!this.canShowRewardedAd(reason)) return false;
    logEvent("ad_offer", { adType: "rewarded", reason });
    return requestSimulatedAd("rewarded", reason);
  },

  async showInterstitialAd(reason: AdReason) {
    if (!this.canShowInterstitialAd(reason)) return false;
    logEvent("ad_offer", { adType: "interstitial", reason });
    return requestSimulatedAd("interstitial", reason);
  }
};
