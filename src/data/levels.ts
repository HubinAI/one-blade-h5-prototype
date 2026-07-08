import type { EnemyKind, EnemySpawn, LevelConfig, PickupKind, PickupSpawn } from "../game/types";

const lanes = [44, 92, 140, 188, 236, 284, 336];
const rowGap = 42;

function enemy(kind: EnemyKind, lane: number, row = 0, xOffset = 0): EnemySpawn {
  return { kind, x: lanes[lane] + xOffset, yOffset: row * rowGap };
}

function pickup(kind: PickupKind, lane: number, row = 0): PickupSpawn {
  return { kind, x: lanes[lane], yOffset: row * 18 };
}

function row(kind: EnemyKind, laneIds: number[], rowIndex = 0): EnemySpawn[] {
  return laneIds.map((lane) => enemy(kind, lane, rowIndex));
}

function diag(kind: EnemyKind, laneIds: number[], startRow = 0): EnemySpawn[] {
  return laneIds.map((lane, index) => enemy(kind, lane, startRow + index));
}

function mix(items: EnemySpawn[][]): EnemySpawn[] {
  return items.flat();
}

function wave(name: string, spawnAt: number, enemies: EnemySpawn[], pickups?: PickupSpawn[], speedMultiplier = 1) {
  return { name, spawnAt, delay: 0, enemies, pickups, speedMultiplier };
}

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    title: "第一刀",
    subtitle: "90秒新手体验，随时拖动挥刀",
    initialEnergy: 78,
    hp: 3,
    enemySpeed: 0.78,
    pickupChance: 0,
    durationSeconds: 90,
    buffTimes: [30],
    waves: [
      wave("爽感启动", 1, row("infantry", [0, 1, 2, 4, 5, 6])),
      wave("斜排练刀", 13, diag("infantry", [0, 1, 2, 3, 4, 5, 6, 3])),
      wave("第一军令", 30, mix([row("infantry", [1, 2, 3, 4, 5], 0), row("infantry", [2, 3, 4], 1), row("shield", [0, 6], 2)]), undefined, 0.95),
      wave("少量盾兵", 48, mix([row("shield", [2, 4], 0), row("infantry", [0, 1, 3, 5, 6], 1), row("infantry", [2, 3, 4], 2)]), undefined, 1),
      wave("一刀收束", 72, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("shield", [3], 2)]), undefined, 1.08)
    ]
  },
  {
    id: 2,
    title: "蓄势再斩",
    subtitle: "100秒刀势教学，等高刀势更爽",
    initialEnergy: 34,
    hp: 3,
    enemySpeed: 0.86,
    pickupChance: 0.03,
    durationSeconds: 100,
    buffTimes: [30],
    waves: [
      wave("残锋救急", 1, mix([row("infantry", [0, 1, 3, 5, 6], 0), row("infantry", [2, 4, 3], 1)])),
      wave("常锋横切", 16, mix([row("infantry", [0, 1, 2, 3, 4], 0), row("infantry", [2, 3, 4, 5, 6], 1)])),
      wave("刀魂入刃", 32, mix([row("infantry", [0, 2, 3, 4, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("shield", [2, 4], 2)]), [pickup("soul", 3)]),
      wave("等势多斩", 55, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 5], 1), row("infantry", [0, 2, 3, 4, 6], 2)]), undefined, 1.08),
      wave("高刀收场", 82, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("shield", [2, 4], 2)]), undefined, 1.12)
    ]
  },
  {
    id: 3,
    title: "盾兵压力",
    subtitle: "110秒强锋破盾，失败可复活",
    initialEnergy: 58,
    hp: 3,
    enemySpeed: 0.95,
    pickupChance: 0.04,
    durationSeconds: 110,
    buffTimes: [30, 75],
    waves: [
      wave("盾兵初现", 1, mix([row("shield", [2, 4], 0), row("infantry", [0, 1, 3, 5, 6], 1)])),
      wave("盾后藏兵", 18, mix([row("shield", [0, 3, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("infantry", [0, 2, 4, 6], 2)])),
      wave("军令破盾", 32, mix([row("shield", [1, 2, 4, 5], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1)]), [pickup("drum", 3)], 1.04),
      wave("盾墙压近", 58, mix([row("shield", [0, 1, 2, 4, 5, 6], 0), row("shield", [2, 4], 1), row("infantry", [0, 1, 3, 5, 6], 2)]), undefined, 1.12),
      wave("强锋检验", 86, mix([row("shield", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("shield", [1, 3, 5], 2)]), undefined, 1.18)
    ]
  },
  {
    id: 4,
    title: "火药连爆",
    subtitle: "120秒火药爽点，收刀引爆",
    initialEnergy: 64,
    hp: 3,
    enemySpeed: 1.02,
    pickupChance: 0.05,
    durationSeconds: 120,
    buffTimes: [30, 75],
    waves: [
      wave("开场人群", 1, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 3, 5], 1)])),
      wave("第一桶火", 20, mix([row("infantry", [0, 1, 2, 4, 5, 6], 0), row("powder", [3], 1), row("infantry", [1, 3, 5], 2)])),
      wave("双火在人群", 38, mix([row("infantry", [0, 1, 3, 5, 6], 0), row("powder", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("oil", 1)], 1.08),
      wave("盾前火后", 62, mix([row("shield", [1, 3, 5], 0), row("powder", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.16),
      wave("三火连爆", 90, mix([row("powder", [1, 3, 5], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("shield", [2, 4], 2)]), [pickup("drum", 3)], 1.22),
      wave("火线收束", 108, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("powder", [1, 2, 4, 5], 1), row("infantry", [0, 2, 3, 4, 6], 2)]), undefined, 1.28)
    ]
  },
  {
    id: 5,
    title: "阵眼破阵",
    subtitle: "120秒阵眼加入，收刀崩阵",
    initialEnergy: 62,
    hp: 3,
    enemySpeed: 1.08,
    pickupChance: 0.06,
    durationSeconds: 120,
    buffTimes: [30, 75],
    waves: [
      wave("步兵压近", 1, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [2, 4], 1)])),
      wave("阵眼初现", 24, mix([row("infantry", [0, 1, 2, 4, 5, 6], 0), [enemy("core", 3, 1)], row("infantry", [1, 3, 5], 2)])),
      wave("军令破阵", 40, mix([row("shield", [1, 5], 0), [enemy("core", 3, 1)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("soul", 0)], 1.1),
      wave("火靠阵眼", 65, mix([row("powder", [2, 4], 0), [enemy("core", 3, 1)], row("shield", [1, 5], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), undefined, 1.18),
      wave("双阵眼", 92, mix([row("shield", [0, 2, 4, 6], 0), row("core", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("drum", 3)], 1.25),
      wave("破阵收束", 110, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), [enemy("core", 3, 1)], row("powder", [1, 5], 2), row("shield", [2, 4], 3)]), undefined, 1.32)
    ]
  },
  {
    id: 6,
    title: "军令试炼",
    subtitle: "120秒两次强化，形成局内变化",
    initialEnergy: 56,
    hp: 3,
    enemySpeed: 1.12,
    pickupChance: 0.08,
    durationSeconds: 120,
    buffTimes: [30, 75],
    waves: [
      wave("启动清场", 1, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 3, 5], 1)])),
      wave("盾火试探", 20, mix([row("shield", [1, 5], 0), row("powder", [3], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)])),
      wave("第一次变化", 36, mix([row("powder", [2, 4], 0), row("shield", [1, 3, 5], 1), row("infantry", [0, 2, 4, 6], 2)]), [pickup("soul", 3)], 1.08),
      wave("混合压近", 62, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 4, 5, 6], 3)]), undefined, 1.18),
      wave("第二军令", 84, mix([row("shield", [1, 3, 5], 0), row("core", [2, 4], 1), row("powder", [0, 6], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 3)], 1.26),
      wave("Build收束", 108, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 4, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), undefined, 1.34)
    ]
  },
  {
    id: 7,
    title: "盾火混合",
    subtitle: "120秒不利用火药会压力很大",
    initialEnergy: 58,
    hp: 3,
    enemySpeed: 1.22,
    pickupChance: 0.08,
    durationSeconds: 120,
    buffTimes: [30, 75],
    waves: [
      wave("盾火开局", 1, mix([row("shield", [1, 5], 0), row("powder", [3], 1), row("infantry", [0, 1, 2, 4, 5, 6], 2)])),
      wave("火药后排", 18, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 3, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)])),
      wave("军令反击", 36, mix([row("shield", [1, 3, 5], 0), row("powder", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("oil", 3)], 1.12),
      wave("盾火密阵", 62, mix([row("shield", [0, 1, 2, 4, 5, 6], 0), row("powder", [2, 3, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.22),
      wave("阵眼插入", 85, mix([row("shield", [1, 5], 0), row("powder", [2, 4], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 3)], 1.32),
      wave("火墙压城", 108, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 3, 4, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.42)
    ]
  },
  {
    id: 8,
    title: "阵眼保护",
    subtitle: "130秒盾兵护眼，需要斜切核心",
    initialEnergy: 54,
    hp: 3,
    enemySpeed: 1.25,
    pickupChance: 0.09,
    durationSeconds: 130,
    buffTimes: [30, 75, 105],
    waves: [
      wave("左阵有盾", 1, mix([[enemy("core", 1, 0)], row("shield", [0, 2, 3], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)])),
      wave("右阵藏火", 20, mix([[enemy("core", 5, 0)], row("powder", [4, 6], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("shield", [1, 3], 3)])),
      wave("第一次军令", 38, mix([row("shield", [2, 4], 0), [enemy("core", 3, 1)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("soul", 0)], 1.12),
      wave("双盾护眼", 65, mix([row("shield", [1, 2, 4, 5], 0), row("core", [2, 4], 1), row("powder", [3], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), undefined, 1.24),
      wave("火阵牵引", 92, mix([row("powder", [1, 5], 0), [enemy("core", 3, 1)], row("shield", [0, 2, 4, 6], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 3)], 1.34),
      wave("斜切收束", 116, mix([row("shield", [0, 1, 5, 6], 0), row("core", [2, 4], 1), row("powder", [1, 3, 5], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), undefined, 1.45)
    ]
  },
  {
    id: 9,
    title: "补给爆发",
    subtitle: "130秒补给更频繁，压力更高",
    initialEnergy: 50,
    hp: 3,
    enemySpeed: 1.32,
    pickupChance: 0.12,
    durationSeconds: 130,
    buffTimes: [30, 75, 105],
    waves: [
      wave("战鼓催势", 1, mix([row("shield", [1, 3, 5], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1)]), [pickup("drum", 3)]),
      wave("刀魂续锋", 20, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [2, 4], 1), row("infantry", [1, 3, 5], 2)]), [pickup("soul", 4)]),
      wave("火油附刃", 42, mix([row("powder", [2, 4, 5], 0), row("shield", [1, 3, 6], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("oil", 1)], 1.16),
      wave("补给破围", 68, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 3)], 1.28),
      wave("高压混阵", 96, mix([row("powder", [1, 2, 4, 5], 0), row("shield", [0, 3, 6], 1), row("core", [2, 4], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("soul", 0)], 1.42),
      wave("补给爆发", 118, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 3, 4, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("oil", 6)], 1.55)
    ]
  },
  {
    id: 10,
    title: "黄巾大阵",
    subtitle: "150秒综合测试，最后一刀破阵",
    initialEnergy: 68,
    hp: 3,
    enemySpeed: 1.38,
    pickupChance: 0.08,
    durationSeconds: 150,
    buffTimes: [30, 75, 105],
    waves: [
      wave("步兵密集阵", 1, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("infantry", [1, 2, 3, 4, 5], 2)]), [pickup("soul", 3)]),
      wave("盾兵前排", 22, mix([row("shield", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 3, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.1),
      wave("第一次军令", 40, mix([row("shield", [1, 3, 5], 0), row("powder", [0, 2, 4, 6], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("oil", 3)], 1.18),
      wave("火药后排", 62, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 2, 4, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.28),
      wave("阵眼居中", 88, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 0)], 1.38),
      wave("第三军令", 112, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 4, 5], 1), row("core", [2, 4], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("soul", 6)], 1.5),
      wave("一刀破阵", 136, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 3, 4, 5], 1), row("core", [2, 4], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3), row("infantry", [0, 1, 2, 3, 4, 5, 6], 4), row("powder", [2, 4], 5)]), [pickup("drum", 3)], 1.65)
    ]
  }
];
