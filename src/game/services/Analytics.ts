export type AnalyticsEvent =
  | "game_start"
  | "slash_start"
  | "slash_end"
  | "buff_choice"
  | "pickup_collected"
  | "game_end"
  | "ad_offer"
  | "ad_start"
  | "ad_complete"
  | "ad_skip"
  | "replay_click"
  | "next_level_click"
  | "upgrade_buy"
  | "chest_open"
  | "daily_reward_claim"
  | "stamina_spend"
  | "stamina_ad_restore";

export function logEvent(event: AnalyticsEvent, params: Record<string, unknown> = {}) {
  console.log(`[analytics] ${event}`, {
    timestamp: Date.now(),
    ...params
  });
}
