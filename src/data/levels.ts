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
    initialEnergy: 45,
    hp: 3,
    enemySpeed: 0.85,
    pickupChance: 0,
    durationSeconds: 90,
    buffTimes: [22],
    waves: [
      wave("爽感启动", 1, row("infantry", [0, 1, 2, 4, 5, 6])),
      wave("斜排练刀", 8, diag("infantry", [0, 1, 2, 3, 4, 5, 6, 3])),
      wave("第一军令", 22, mix([row("infantry", [1, 2, 3, 4, 5], 0), row("infantry", [2, 3, 4], 1), row("shield", [0, 6], 2)]), undefined, 0.95),
      wave("少量盾兵", 38, mix([row("shield", [2, 4], 0), row("infantry", [0, 1, 3, 5, 6], 1), row("infantry", [2, 3, 4], 2)]), undefined, 1),
      wave("一刀收束", 58, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("shield", [3], 2)]), undefined, 1.06)
    ],
    briefing: {
      highlightEnemies: [{ kind: "infantry", label: "步兵纸兵", icon: "↑" }],
      tacticalHint: "随手一刀，纸兵即碎",
      initialBladeTier: "残锋/常锋"
    }
  },
  {
    id: 2,
    title: "蓄势再斩",
    subtitle: "100秒刀势教学，等高刀势更爽",
    initialEnergy: 25,
    hp: 3,
    enemySpeed: 0.92,
    pickupChance: 0.03,
    durationSeconds: 100,
    buffTimes: [24],
    waves: [
      wave("残锋救急", 1, mix([row("infantry", [0, 1, 3, 5, 6], 0), row("infantry", [2, 4, 3], 1)])),
      wave("常锋横切", 11, mix([row("infantry", [0, 1, 2, 3, 4], 0), row("infantry", [2, 3, 4, 5, 6], 1)])),
      wave("刀魂入刃", 24, mix([row("infantry", [0, 2, 3, 4, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("shield", [2, 4], 2)]), [pickup("soul", 3)]),
      wave("等势多斩", 42, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 5], 1), row("infantry", [0, 2, 3, 4, 6], 2)]), undefined, 1.06),
      wave("高刀收场", 64, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("shield", [2, 4], 2)]), undefined, 1.10)
    ],
    briefing: {
      highlightEnemies: [{ kind: "infantry", label: "步兵纸兵", icon: "↑" }],
      tacticalHint: "等满刀势再挥，一刀连斩更爽",
      initialBladeTier: "残锋起手"
    }
  },
  {
    id: 3,
    title: "盾兵压力",
    subtitle: "110秒强锋破盾，失败可复活",
    initialEnergy: 58,
    hp: 3,
    enemySpeed: 1.02,
    pickupChance: 0.04,
    durationSeconds: 110,
    buffTimes: [26, 65],
    waves: [
      wave("盾兵初现", 1, mix([row("shield", [2, 4], 0), row("infantry", [0, 1, 3, 5, 6], 1)])),
      wave("盾后藏兵", 13, mix([row("shield", [0, 3, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("infantry", [0, 2, 4, 6], 2)])),
      wave("军令破盾", 26, mix([row("shield", [1, 2, 4, 5], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1)]), [pickup("drum", 3)], 1.04),
      wave("盾墙压近", 48, mix([row("shield", [0, 1, 2, 4, 5, 6], 0), row("shield", [2, 4], 1), row("infantry", [0, 1, 3, 5, 6], 2)]), undefined, 1.10),
      wave("强锋检验", 72, mix([row("shield", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("shield", [1, 3, 5], 2)]), undefined, 1.16)
    ],
    briefing: {
      highlightEnemies: [{ kind: "shield", label: "盾兵防线", icon: "🛡" }],
      tacticalHint: "强锋可破盾，常锋选穿盾亦可行",
      initialBladeTier: "常锋/强锋"
    }
  },
  {
    id: 4,
    title: "火药连爆",
    subtitle: "120秒火药爽点，收刀引爆",
    initialEnergy: 64,
    hp: 3,
    enemySpeed: 1.10,
    pickupChance: 0.05,
    durationSeconds: 120,
    buffTimes: [26, 62],
    waves: [
      wave("开场人群", 1, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 3, 5], 1)])),
      wave("第一桶火", 14, mix([row("infantry", [0, 1, 2, 4, 5, 6], 0), row("powder", [3], 1), row("infantry", [1, 3, 5], 2)])),
      wave("双火在人群", 28, mix([row("infantry", [0, 1, 3, 5, 6], 0), row("powder", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("oil", 1)], 1.06),
      wave("盾前火后", 48, mix([row("shield", [1, 3, 5], 0), row("powder", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.14),
      wave("三火连爆", 72, mix([row("powder", [1, 3, 5], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("shield", [2, 4], 2)]), [pickup("drum", 3)], 1.20),
      wave("火线收束", 94, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("powder", [1, 2, 4, 5], 1), row("infantry", [0, 2, 3, 4, 6], 2)]), undefined, 1.26)
    ],
    briefing: {
      highlightEnemies: [{ kind: "powder", label: "火药兵集群", icon: "🔥" }],
      tacticalHint: "击中火药兵后收刀引爆，燎原路线可连锁",
      initialBladeTier: "常锋/强锋"
    }
  },
  {
    id: 5,
    title: "阵眼破阵",
    subtitle: "120秒阵眼加入，收刀崩阵",
    initialEnergy: 62,
    hp: 3,
    enemySpeed: 1.16,
    pickupChance: 0.06,
    durationSeconds: 120,
    buffTimes: [26, 62],
    waves: [
      wave("步兵压近", 1, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [2, 4], 1)])),
      wave("阵眼初现", 17, mix([row("infantry", [0, 1, 2, 4, 5, 6], 0), [enemy("core", 3, 1)], row("infantry", [1, 3, 5], 2)])),
      wave("军令破阵", 32, mix([row("shield", [1, 5], 0), [enemy("core", 3, 1)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("soul", 0)], 1.08),
      wave("火靠阵眼", 52, mix([row("powder", [2, 4], 0), [enemy("core", 3, 1)], row("shield", [1, 5], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), undefined, 1.16),
      wave("双阵眼", 76, mix([row("shield", [0, 2, 4, 6], 0), row("core", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("drum", 3)], 1.22),
      wave("破阵收束", 96, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), [enemy("core", 3, 1)], row("powder", [1, 5], 2), row("shield", [2, 4], 3)]), undefined, 1.28)
    ],
    briefing: {
      highlightEnemies: [
        { kind: "core", label: "阵眼核心", icon: "◎" },
        { kind: "shield", label: "盾兵护阵", icon: "🛡" }
      ],
      tacticalHint: "阵眼藏于军中，收刀可崩阵",
      initialBladeTier: "强锋/破阵锋"
    }
  },
  {
    id: 6,
    title: "军令试炼",
    subtitle: "120秒两次强化，形成局内变化",
    initialEnergy: 56,
    hp: 3,
    enemySpeed: 1.20,
    pickupChance: 0.08,
    durationSeconds: 120,
    buffTimes: [26, 62],
    waves: [
      wave("启动清场", 1, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 3, 5], 1)])),
      wave("盾火试探", 14, mix([row("shield", [1, 5], 0), row("powder", [3], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)])),
      wave("第一次变化", 28, mix([row("powder", [2, 4], 0), row("shield", [1, 3, 5], 1), row("infantry", [0, 2, 4, 6], 2)]), [pickup("soul", 3)], 1.06),
      wave("混合压近", 50, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 4, 5, 6], 3)]), undefined, 1.16),
      wave("第二军令", 70, mix([row("shield", [1, 3, 5], 0), row("core", [2, 4], 1), row("powder", [0, 6], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 3)], 1.24),
      wave("Build收束", 92, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 4, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), undefined, 1.32)
    ],
    briefing: {
      highlightEnemies: [
        { kind: "shield", label: "盾兵", icon: "🛡" },
        { kind: "powder", label: "火药兵", icon: "🔥" }
      ],
      tacticalHint: "两次军令，选一条路线深耕",
      initialBladeTier: "常锋/强锋"
    }
  },
  {
    id: 7,
    title: "盾火混合",
    subtitle: "120秒不利用火药会压力很大",
    initialEnergy: 58,
    hp: 3,
    enemySpeed: 1.28,
    pickupChance: 0.08,
    durationSeconds: 120,
    buffTimes: [26, 62],
    waves: [
      wave("盾火开局", 1, mix([row("shield", [1, 5], 0), row("powder", [3], 1), row("infantry", [0, 1, 2, 4, 5, 6], 2)])),
      wave("火药后排", 14, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 3, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)])),
      wave("军令反击", 28, mix([row("shield", [1, 3, 5], 0), row("powder", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("oil", 3)], 1.10),
      wave("盾火密阵", 50, mix([row("shield", [0, 1, 2, 4, 5, 6], 0), row("powder", [2, 3, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.20),
      wave("阵眼插入", 72, mix([row("shield", [1, 5], 0), row("powder", [2, 4], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 3)], 1.30),
      wave("火墙压城", 94, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 3, 4, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.38)
    ],
    briefing: {
      highlightEnemies: [
        { kind: "shield", label: "盾兵", icon: "🛡" },
        { kind: "powder", label: "火药兵", icon: "🔥" }
      ],
      tacticalHint: "不利用火药，压力会很大",
      initialBladeTier: "强锋"
    }
  },
  {
    id: 8,
    title: "阵眼保护",
    subtitle: "130秒盾兵护眼，需要斜切核心",
    initialEnergy: 54,
    hp: 3,
    enemySpeed: 1.32,
    pickupChance: 0.09,
    durationSeconds: 130,
    buffTimes: [26, 62, 95],
    waves: [
      wave("左阵有盾", 1, mix([[enemy("core", 1, 0)], row("shield", [0, 2, 3], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)])),
      wave("右阵藏火", 16, mix([[enemy("core", 5, 0)], row("powder", [4, 6], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("shield", [1, 3], 3)])),
      wave("第一次军令", 30, mix([row("shield", [2, 4], 0), [enemy("core", 3, 1)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("soul", 0)], 1.10),
      wave("双盾护眼", 54, mix([row("shield", [1, 2, 4, 5], 0), row("core", [2, 4], 1), row("powder", [3], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), undefined, 1.22),
      wave("火阵牵引", 78, mix([row("powder", [1, 5], 0), [enemy("core", 3, 1)], row("shield", [0, 2, 4, 6], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 3)], 1.32),
      wave("斜切收束", 102, mix([row("shield", [0, 1, 5, 6], 0), row("core", [2, 4], 1), row("powder", [1, 3, 5], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), undefined, 1.42)
    ],
    briefing: {
      highlightEnemies: [
        { kind: "core", label: "阵眼核心", icon: "◎" },
        { kind: "shield", label: "护阵盾兵", icon: "🛡" }
      ],
      tacticalHint: "盾兵护阵，斜切核心方可破",
      initialBladeTier: "强锋/破阵锋"
    }
  },
  {
    id: 9,
    title: "补给爆发",
    subtitle: "130秒补给更频繁，压力更高",
    initialEnergy: 50,
    hp: 3,
    enemySpeed: 1.38,
    pickupChance: 0.12,
    durationSeconds: 130,
    buffTimes: [26, 62, 95],
    waves: [
      wave("战鼓催势", 1, mix([row("shield", [1, 3, 5], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1)]), [pickup("drum", 3)]),
      wave("刀魂续锋", 15, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [2, 4], 1), row("infantry", [1, 3, 5], 2)]), [pickup("soul", 4)]),
      wave("火油附刃", 32, mix([row("powder", [2, 4, 5], 0), row("shield", [1, 3, 6], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("oil", 1)], 1.14),
      wave("补给破围", 54, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 3)], 1.26),
      wave("高压混阵", 78, mix([row("powder", [1, 2, 4, 5], 0), row("shield", [0, 3, 6], 1), row("core", [2, 4], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("soul", 0)], 1.40),
      wave("补给爆发", 100, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 3, 4, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("oil", 6)], 1.52)
    ],
    briefing: {
      highlightEnemies: [
        { kind: "powder", label: "火药兵", icon: "🔥" },
        { kind: "shield", label: "盾兵", icon: "🛡" },
        { kind: "core", label: "阵眼", icon: "◎" }
      ],
      tacticalHint: "补给密集，三军令可选完整路线",
      initialBladeTier: "常锋/强锋"
    }
  },
  {
    id: 10,
    title: "黄巾大阵",
    subtitle: "150秒综合测试，最后一刀破阵",
    initialEnergy: 68,
    hp: 3,
    enemySpeed: 1.44,
    pickupChance: 0.08,
    durationSeconds: 150,
    buffTimes: [26, 62, 95],
    waves: [
      wave("步兵密集阵", 1, mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("infantry", [1, 2, 3, 4, 5], 2)]), [pickup("soul", 3)]),
      wave("盾兵前排", 16, mix([row("shield", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 3, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.08),
      wave("第一次军令", 30, mix([row("shield", [1, 3, 5], 0), row("powder", [0, 2, 4, 6], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), [pickup("oil", 3)], 1.16),
      wave("火药后排", 50, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 2, 4, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]), undefined, 1.26),
      wave("阵眼居中", 72, mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("drum", 0)], 1.36),
      wave("第三军令", 94, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 4, 5], 1), row("core", [2, 4], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3)]), [pickup("soul", 6)], 1.48),
      wave("一刀破阵",118, mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 3, 4, 5], 1), row("core", [2, 4], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3), row("infantry", [0, 1, 2, 3, 4, 5, 6], 4), row("powder", [2, 4], 5)]), [pickup("drum", 3)], 1.62)
    ],
    briefing: {
      highlightEnemies: [
        { kind: "shield", label: "盾兵大阵", icon: "🛡" },
        { kind: "powder", label: "火药兵集群", icon: "🔥" },
        { kind: "core", label: "阵眼核心", icon: "◎" }
      ],
      tacticalHint: "最后一刀破阵，全路线成型之战",
      initialBladeTier: "破阵锋"
    }
  }
];
