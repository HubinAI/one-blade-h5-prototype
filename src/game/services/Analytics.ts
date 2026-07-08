export type AnalyticsEvent =
  | "game_start"
  | "slash_start"
  | "slash_end"
  | "buff_choice"
  | "game_end"
  | "ad_offer"
  | "ad_start"
  | "ad_complete"
  | "replay_click"
  | "next_level_click";

export function logEvent(event: AnalyticsEvent, params: Record<string, unknown>) {
  console.log(`[analytics] ${event}`, params);
}
