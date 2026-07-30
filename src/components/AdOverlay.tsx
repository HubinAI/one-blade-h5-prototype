import { useEffect, useState } from "react";
import { AdService, type AdRequest } from "../game/services/AdService";

function reasonText(reason: AdRequest["reason"]) {
  if (reason === "revive") return "看广告复活，立即释放强锋反击";
  if (reason === "double_reward") return "看广告奖励翻倍";
  if (reason === "bonus_chest") return "看广告额外开启宝箱";
  if (reason === "stamina_restore") return "看广告恢复 10 点体力";
  return "插屏广告，仅在结算后出现";
}

export function AdOverlay() {
  const [request, setRequest] = useState<AdRequest | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const next = (event as CustomEvent<AdRequest>).detail;
      setRequest(next);
      setLeft(next.seconds);
    };
    window.addEventListener(AdService.eventName, handleRequest);
    return () => window.removeEventListener(AdService.eventName, handleRequest);
  }, []);

  useEffect(() => {
    if (!request) return;
    if (left <= 0) {
      request.resolve(true);
      setRequest(null);
      return;
    }
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left, request]);

  if (!request) return null;

  return (
    <div className="ad-overlay" role="dialog" aria-modal="true">
      <div className="ad-panel">
        <span>{request.adType === "rewarded" ? "激励视频" : "插屏广告"}</span>
        <strong>模拟广告播放中</strong>
        <p>{reasonText(request.reason)}</p>
        <b>{left}</b>
      </div>
    </div>
  );
}
