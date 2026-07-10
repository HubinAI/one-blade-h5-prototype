import { useState, useMemo } from "react";
import {
  getTodayBuffState,
  buyBuffFromShop,
  drawBuffFromDrawPool,
  replaceBuff,
  type DailyBuffState,
} from "../game/services/ProgressionService";
import {
  BUFF_QUALITY_META,
  TODAY_BUFF_POOL,
  type TodayBuff,
  type BuffQuality,
} from "../game/config/synthesis";

type MerchantScreenProps = {
  onClose: () => void;
  coins: number;
  onCoinChange: () => void;
};

const BUFF_POOL_MAP: Record<string, TodayBuff> = TODAY_BUFF_POOL.reduce((acc, b) => ({ ...acc, [b.id]: b }), {});
const BUFF_ICONS: Record<BuffQuality, string> = {
  white: "🌱",
  blue: "💧",
  purple: "⚡",
  gold: "✨"
};
const QUALITY_LABEL: Record<BuffQuality, string> = {
  white: "传说",
  blue: "稀有",
  purple: "史诗",
  gold: "金色"
};

export function MerchantScreen({ onClose, coins, onCoinChange }: MerchantScreenProps) {
  const [tab, setTab] = useState<"shop" | "draw">("shop");
  const [state, setState] = useState<DailyBuffState>(getTodayBuffState());
  const [toast, setToast] = useState<string>("");
  const [replacing, setReplacing] = useState<string | null>(null);
  const [adPlaying, setAdPlaying] = useState(false);

  const shopBuffs = useMemo(() => state.shopPoolIds.map(id => BUFF_POOL_MAP[id]).filter((b): b is TodayBuff => !!b), [state]);
  const drawBuffs = useMemo(() => state.drawPoolIds.map(id => BUFF_POOL_MAP[id]).filter((b): b is TodayBuff => !!b), [state]);
  const ownedBuffs = useMemo(() => state.owned.map(o => BUFF_POOL_MAP[o.buffId]).filter((b): b is TodayBuff => !!b), [state]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1800);
  }

  function handleBuy(buffId: string) {
    if (replacing) {
      const result = replaceBuff(replacing, buffId);
      if (result.ok && result.state) {
        setState(result.state);
        setReplacing(null);
        onCoinChange();
        showToast("替换成功");
      } else {
        showToast(result.reason || "失败");
      }
      return;
    }
    const result = buyBuffFromShop(buffId);
    if (result.ok && result.state) {
      setState(result.state);
      onCoinChange();
      showToast("购买成功");
    } else {
      showToast(result.reason || "失败");
    }
  }

  function handleDraw(buffId: string) {
    if (replacing) { showToast("替换只能从商店购买"); return; }
    setAdPlaying(true);
    window.setTimeout(() => {
      setAdPlaying(false);
      const result = drawBuffFromDrawPool(buffId);
      if (result.ok && result.state) {
        setState(result.state);
        showToast(`获得 ${result.buff?.name ?? ""}`);
      } else {
        showToast(result.reason || "失败");
      }
    }, 800);
  }

  function handleOwnedClick(buffId: string) {
    setReplacing(replacing === buffId ? null : buffId);
    showToast(replacing ? "已取消替换" : "点击商店Buff替换");
  }

  // 抽取单个Buff卡（赵云与阿斗风格：大icon+品质徽章+描述+价格）
  function BuffCard({ buff, mode }: { buff: TodayBuff; mode: "shop" | "draw" }) {
    const meta = BUFF_QUALITY_META[buff.quality];
    const ql = QUALITY_LABEL[buff.quality];
    const owned = state.owned.some(o => o.buffId === buff.id);
    const isActive = replacing === buff.id;
    return (
      <div className={`merchant-buff-card ${isActive ? "active" : ""}`} style={{ borderColor: meta.color }}>
        <div className="merchant-buff-quality-tag" style={{ background: meta.color }}>
          {ql}
        </div>
        <div className="merchant-buff-icon-wrap">
          <div className="merchant-buff-icon" style={{ background: meta.color }}>
            <span>{BUFF_ICONS[buff.quality]}</span>
          </div>
        </div>
        <div className="merchant-buff-info">
          <h3 className="merchant-buff-name">{buff.name}</h3>
          <p className="merchant-buff-type">
            {buff.effectType.includes("sword") ? "被动" :
             buff.effectType.includes("syn") ? "被动" :
             buff.effectType.includes("sub") ? "被动" :
             buff.effectType.includes("coin") ? "被动" :
             buff.effectType.includes("stamina") ? "被动" :
             "主动"}
          </p>
          <p className="merchant-buff-desc">{buff.desc}</p>
        </div>
        {mode === "shop" ? (
          <button
            className={`merchant-buy-btn ${owned && !replacing ? "owned" : ""}`}
            onClick={() => handleBuy(buff.id)}
            disabled={owned && !replacing}
          >
            {owned ? (replacing === buff.id ? "替换到此" : "已购") : (
              <>
                <span className="merchant-buy-icon">💰</span>
                <span>{buff.price}</span>
              </>
            )}
          </button>
        ) : (
          <button
            className="merchant-draw-btn"
            onClick={() => handleDraw(buff.id)}
            disabled={owned || state.drawCount >= 3 || adPlaying}
          >
            {owned ? "已购" : (
              <span className="merchant-draw-pill">▶ 免费领取</span>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="merchant-overlay" onClick={onClose}>
      <div className="merchant-panel" onClick={(e) => e.stopPropagation()}>
        <div className="merchant-header">
          <button className="merchant-close" onClick={onClose}>×</button>
          <h1>神秘商人</h1>
        </div>

        <div className="merchant-tabs">
          <button
            className={`merchant-tab ${tab === "shop" ? "active" : ""}`}
            onClick={() => { setTab("shop"); setReplacing(null); }}
          >购买</button>
          <button
            className={`merchant-tab ${tab === "draw" ? "active" : ""}`}
            onClick={() => { setTab("draw"); setReplacing(null); }}
          >白嫖</button>
        </div>

        <div className="merchant-list">
          {tab === "shop" && shopBuffs.map(buff => (
            <BuffCard key={buff.id} buff={buff} mode="shop" />
          ))}
          {tab === "draw" && (
            <>
              <div className="merchant-draw-info">
                今日剩余 {Math.max(0, 3 - state.drawCount)} / 3 次
              </div>
              {drawBuffs.map(buff => (
                <BuffCard key={buff.id} buff={buff} mode="draw" />
              ))}
            </>
          )}
        </div>

        <div className="merchant-owned">
          <h3>我的Buff ({state.owned.length}/5)</h3>
          <div className="merchant-owned-grid">
            {ownedBuffs.map(buff => {
              const meta = BUFF_QUALITY_META[buff.quality];
              return (
                <div
                  key={buff.id}
                  className={`merchant-owned-item ${replacing === buff.id ? "selecting" : ""}`}
                  onClick={() => handleOwnedClick(buff.id)}
                >
                  <span className="merchant-owned-quality" style={{ background: meta.color }}>
                    {QUALITY_LABEL[buff.quality]}
                  </span>
                  <span className="merchant-owned-name">{buff.name}</span>
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, 5 - state.owned.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="merchant-owned-empty">空</div>
            ))}
          </div>
        </div>

        <div className="merchant-tip">tip: 道具仅当天有效</div>

        {toast && <div className="merchant-toast">{toast}</div>}
      </div>
    </div>
  );
}
