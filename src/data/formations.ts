export type FormationConfig = {
  id: string;
  name: string;
  chars: string[];
  /** 亮字切换间隔（秒） */
  litInterval: number;
  /** 最大容错次数 */
  maxWrongHits: number;
};

export const FORMATIONS: Record<string, FormationConfig> = {
  // 关卡5：入门
  snake: {
    id: "snake",
    name: "一字长蛇阵",
    chars: ["一", "字", "长", "蛇", "阵"],
    litInterval: 0.6,
    maxWrongHits: 3
  },
  // 关卡6
  three: {
    id: "three",
    name: "天地三才阵",
    chars: ["天", "地", "三", "才", "阵"],
    litInterval: 0.6,
    maxWrongHits: 3
  },
  // 关卡7
  four: {
    id: "four",
    name: "四门兜底阵",
    chars: ["四", "门", "兜", "底", "阵"],
    litInterval: 0.55,
    maxWrongHits: 3
  },
  // 关卡8：短但要连切
  fiveEl: {
    id: "fiveEl",
    name: "五行阵",
    chars: ["金", "木", "水", "火", "土"],
    litInterval: 0.5,
    maxWrongHits: 3
  },
  // 关卡9
  six: {
    id: "six",
    name: "六花阵",
    chars: ["桃", "李", "梅", "兰"],
    litInterval: 0.55,
    maxWrongHits: 3
  },
  // 关卡10：史诗
  eight: {
    id: "eight",
    name: "八门金锁阵",
    chars: ["休", "生", "伤", "杜", "景", "死", "惊", "开"],
    litInterval: 0.5,
    maxWrongHits: 4
  }
};

/** 按关卡ID获取阵法 */
export function getFormationForLevel(levelId: number): FormationConfig {
  const map: Record<number, string> = {
    5: "snake",
    6: "three",
    7: "four",
    8: "fiveEl",
    9: "six",
    10: "eight"
  };
  const id = map[levelId];
  return id ? FORMATIONS[id] : FORMATIONS.snake;
}
