import { getHomeSnapshot } from "../game/services/ProgressionService";

type RankingScreenProps = {
  onBack: () => void;
};

// 修仙风格bot（30人）
const FAKE_USERS = [
  { name: "剑仙·云霄", floor: 9982, rank: "大帝" },
  { name: "刀皇·无极", floor: 8821, rank: "大帝" },
  { name: "散仙·清风", floor: 7756, rank: "大帝" },
  { name: "魔尊·赤炎", floor: 6749, rank: "大帝" },
  { name: "天剑·浩然", floor: 5998, rank: "大帝" },
  { name: "碧落仙子", floor: 5237, rank: "大帝" },
  { name: "九霄真人", floor: 4912, rank: "大帝" },
  { name: "幽冥尊者", floor: 4580, rank: "霸主" },
  { name: "太虚道人", floor: 4321, rank: "霸主" },
  { name: "玄天宗·烈", floor: 4128, rank: "霸主" },
  { name: "紫霄宫·清", floor: 3987, rank: "霸主" },
  { name: "昆仑·凌云", floor: 3754, rank: "霸主" },
  { name: "蜀山·白眉", floor: 3521, rank: "霸主" },
  { name: "蓬莱·海月", floor: 3289, rank: "渡劫" },
  { name: "天机阁·玄", floor: 3056, rank: "渡劫" },
  { name: "青云门·逸", floor: 2823, rank: "渡劫" },
  { name: "散修·李淳", floor: 2590, rank: "大乘" },
  { name: "游侠·风凌", floor: 2357, rank: "大乘" },
  { name: "炼器·火云", floor: 2124, rank: "大乘" },
  { name: "丹道·青木", floor: 1891, rank: "化神" },
  { name: "符箓·紫微", floor: 1658, rank: "化神" },
  { name: "阵道·天衍", floor: 1425, rank: "化神" },
  { name: "灵兽·白虎", floor: 1192, rank: "元婴" },
  { name: "药王·孙真人", floor: 959, rank: "元婴" },
  { name: "铁剑·周武", floor: 726, rank: "结丹" },
  { name: "寒刀·柳生", floor: 593, rank: "结丹" },
  { name: "木剑·张楚", floor: 460, rank: "筑基" },
  { name: "短刀·赵七", floor: 327, rank: "筑基" },
  { name: "竹剑·王小", floor: 194, rank: "练气" },
  { name: "凡刃·陈铁", floor: 61, rank: "练气" },
];

const RANK_STAR: Record<string, number> = {
  "练气": 1, "筑基": 1, "结丹": 2, "元婴": 2,
  "化神": 3, "大乘": 3, "渡劫": 4, "霸主": 4, "大帝": 5
};

function getRankFromFloor(floor: number): string {
  if (floor >= 4000) return "大帝";
  if (floor >= 3000) return "霸主";
  if (floor >= 2000) return "渡劫";
  if (floor >= 1500) return "大乘";
  if (floor >= 1000) return "化神";
  if (floor >= 500) return "元婴";
  if (floor >= 200) return "结丹";
  if (floor >= 50) return "筑基";
  return "练气";
}

export function RankingScreen({ onBack }: RankingScreenProps) {
  const home = getHomeSnapshot();
  const myScore = home.highestFloor;

  // 把玩家插入正确位置
  const all = [...FAKE_USERS].sort((a, b) => b.floor - a.floor);
  const playerIdx = all.findIndex(u => myScore > u.floor);
  const insertAt = playerIdx >= 0 ? playerIdx : all.length;
  all.splice(insertAt, 0, {
    name: "你",
    floor: myScore,
    rank: getRankFromFloor(myScore),
  });

  // 显示前40名（30bot+10真实 或 玩家在前）
  const display = all.slice(0, 40);

  return (
    <div className="ranking-overlay" onClick={onBack}>
      <div className="ranking-popup" onClick={(e) => e.stopPropagation()}>
        <div className="ranking-popup-header">
          <button className="ranking-popup-close" onClick={onBack}>×</button>
          <h1>全服排行</h1>
          <span className="ranking-popup-spacer" />
        </div>

        <div className="ranking-list">
          {display.map((user, i) => {
            const isMe = user.name === "你";
            const isTop3 = i < 3;
            const rowClass = `ranking-row ${isMe ? "me" : ""} ${isTop3 ? "top3" : ""}`;
            return (
              <div key={i} className={rowClass.trim()}>
                <span className="ranking-pos">
                  {i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </span>
                <span className="ranking-avatar">{isMe ? "⚔" : "👤"}</span>
                <span className="ranking-name">
                  <span className="ranking-name-tag">{user.name}</span>
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

        <div className="ranking-footer">
          你的排名: #{all.findIndex(u => u.name === "你") + 1} · 第{myScore}关
        </div>
      </div>
    </div>
  );
}
