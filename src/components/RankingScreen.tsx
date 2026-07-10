import { getHomeSnapshot } from "../game/services/ProgressionService";

type RankingScreenProps = {
  onBack: () => void;
};

const FAKE_USERS = [
  { name: "DY↑吉林", floor: 9756, rank: "大帝", prov: "吉林" },
  { name: "夕微Quuem43", floor: 2749, rank: "大帝", prov: "广东" },
  { name: "小诗儿哇", floor: 2742, rank: "大帝", prov: "山东" },
  { name: "4991457", floor: 1998, rank: "大帝", prov: "江苏" },
  { name: "戍子", floor: 1937, rank: "大帝", prov: "福建" },
  { name: "马拉巴栗", floor: 1912, rank: "大帝", prov: "浙江" },
  { name: "胡斌", floor: 1850, rank: "霸主", prov: "广东" },
  { name: "剑仙·云", floor: 428, rank: "渡劫" },
  { name: "刀皇·天", floor: 391, rank: "大乘" },
  { name: "散修·李", floor: 356, rank: "化神" },
  { name: "魔修·赤", floor: 312, rank: "元婴" },
  { name: "无名", floor: 287, rank: "结丹" },
  { name: "青云子", floor: 253, rank: "结丹" },
  { name: "铁剑", floor: 221, rank: "筑基" },
];

const RANK_STAR: Record<string, number> = {
  "练气": 1, "筑基": 1, "结丹": 2, "元婴": 2, "化神": 3, "大乘": 3, "渡劫": 4, "大帝": 5, "霸主": 4
};

export function RankingScreen({ onBack }: RankingScreenProps) {
  const home = getHomeSnapshot();
  const myScore = home.highestFloor;

  const all = [...FAKE_USERS].sort((a, b) => b.floor - a.floor);
  const playerIdx = all.findIndex(u => myScore > u.floor);
  const insertAt = playerIdx >= 0 ? playerIdx : all.length;
  all.splice(insertAt, 0, { name: "你", floor: myScore, rank: "练气", prov: "广东" });

  return (
    <div className="ranking-overlay" onClick={onBack}>
      <div className="ranking-popup" onClick={(e) => e.stopPropagation()}>
        <div className="ranking-popup-header">
          <button className="ranking-popup-close" onClick={onBack}>×</button>
          <h1>排行榜</h1>
          <span className="ranking-popup-spacer" />
        </div>

        <div className="ranking-list">
          {all.slice(0, 10).map((user, i) => {
            const isMe = user.name === "你";
            const isTop3 = i < 3;
            const rowClass = `ranking-row ${isMe ? "me" : ""} ${isTop3 ? "top3" : ""}`;
            return (
              <div key={i} className={rowClass.trim()}>
                <span className="ranking-pos">
                  {i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </span>
                <span className="ranking-avatar">👤</span>
                <span className="ranking-name">
                  <span className="ranking-name-tag">{user.name}</span>
                  {"prov" in user && (user as any).prov && (
                    <span className="ranking-prov">{(user as any).prov}</span>
                  )}
                </span>
                <span className="ranking-rank-tag">{user.rank}</span>
                <span className="ranking-score">
                  <span className="ranking-score-num">{user.floor}</span>
                  <span className="ranking-stars">
                    {Array.from({ length: RANK_STAR[user.rank] ?? 0 }).map((_, k) => "★").join("")}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
