import { AD_CONFIG } from "../config/ads";
import { logEvent } from "./Analytics";

export type AdType = "rewarded" | "interstitial";
export type AdReason = "revive" | "double_reward" | "bonus_chest" | "stamina_restore" | "next_level" | "between_runs";

export type AdRequest = {
  adType: AdType;
  reason: AdReason;
  seconds: number;
  resolve: (success: boolean) => void;
};

const AD_EVENT = "one-blade-ad-request";

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
