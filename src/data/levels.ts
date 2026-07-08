import type { EnemyKind, EnemySpawn, LevelConfig, PickupKind, PickupSpawn } from "../game/types";

const lanes = [44, 92, 140, 188, 236, 284, 336];
const rowGap = 42;
const waveDelay = 2;

function enemy(kind: EnemyKind, lane: number, row = 0, xOffset = 0): EnemySpawn {
  return { kind, x: lanes[lane] + xOffset, yOffset: row * rowGap };
}

function pickup(kind: PickupKind, lane: number, row = 0): PickupSpawn {
  return { kind, x: lanes[lane], yOffset: row * 18 };
}

function row(kind: EnemyKind, laneIds: number[], rowIndex = 0): EnemySpawn[] {
  return laneIds.map((lane) => enemy(kind, lane, rowIndex));
}

function diagonal(kind: EnemyKind, laneIds: number[], startRow = 0): EnemySpawn[] {
  return laneIds.map((lane, index) => enemy(kind, lane, startRow + index));
}

function mix(items: EnemySpawn[][]): EnemySpawn[] {
  return items.flat();
}

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    title: "第一刀",
    subtitle: "随时拖动挥刀，满势更强",
    initialEnergy: 78,
    hp: 3,
    enemySpeed: 0.85,
    pickupChance: 0,
    waves: [
      { name: "横排试锋", delay: waveDelay, enemies: row("infantry", [0, 1, 2, 4, 5, 6]) },
      {
        name: "斜排压近",
        delay: waveDelay,
        enemies: diagonal("infantry", [0, 1, 2, 3, 4, 5, 6, 3])
      },
      {
        name: "密集小阵",
        delay: waveDelay,
        enemies: mix([row("infantry", [1, 2, 3, 4, 5], 0), row("infantry", [2, 3, 4], 1), row("infantry", [2, 5], 2)])
      },
      {
        name: "一刀收场",
        delay: waveDelay,
        enemies: mix([row("infantry", [0, 2, 3, 4, 6], 0), row("infantry", [1, 2, 4, 5], 1), row("infantry", [0, 3, 6], 2)])
      }
    ]
  },
  {
    id: 2,
    title: "蓄势再斩",
    subtitle: "等一息，刀芒更长",
    initialEnergy: 34,
    hp: 3,
    enemySpeed: 0.85,
    pickupChance: 0,
    waves: [
      { name: "残锋救急", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 3, 5, 6], 0), row("infantry", [2, 4, 3], 1)]) },
      { name: "常锋横切", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4], 0), row("infantry", [2, 3, 4, 5, 6], 1)]) },
      {
        name: "刀魂入刃",
        delay: waveDelay,
        enemies: mix([row("infantry", [0, 2, 3, 4, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("infantry", [0, 3, 6], 2)]),
        pickups: [pickup("soul", 3)]
      },
      {
        name: "蓄满多斩",
        delay: waveDelay,
        enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("infantry", [0, 6], 2)])
      }
    ]
  },
  {
    id: 3,
    title: "盾兵出现",
    subtitle: "低势会被挡，强锋可破盾",
    initialEnergy: 58,
    hp: 3,
    enemySpeed: 1,
    pickupChance: 0.06,
    waves: [
      { name: "盾兵初现", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 3, 4, 5, 6], 1), row("infantry", [2, 5], 2), row("shield", [2, 4], 0)]) },
      { name: "盾后藏兵", delay: waveDelay, enemies: mix([row("shield", [0, 3, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("infantry", [0, 2, 4, 6, 3], 2)]) },
      { name: "破盾一线", delay: waveDelay, enemies: mix([row("shield", [1, 2, 3, 4, 5], 0), row("infantry", [0, 1, 3, 5, 6], 1), row("infantry", [2, 4, 6], 2)]) },
      { name: "盾前兵后", delay: waveDelay, enemies: mix([row("shield", [0, 1, 2, 4, 5, 6], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("infantry", [2, 3, 4], 2)]) }
    ]
  },
  {
    id: 4,
    title: "盾墙压力",
    subtitle: "强锋破盾，乱切会漏兵",
    initialEnergy: 48,
    hp: 3,
    enemySpeed: 1,
    pickupChance: 0.08,
    waves: [
      { name: "盾墙横排", delay: waveDelay, enemies: mix([row("shield", [0, 1, 2, 4, 5, 6], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), [enemy("infantry", 3, 2)]]) },
      { name: "斜盾压城", delay: waveDelay, enemies: mix([diagonal("shield", [0, 1, 2, 3, 4, 5, 6, 3], 0), row("infantry", [0, 1, 2, 4, 5, 6], 3), row("infantry", [2, 3, 4, 5], 4)]) },
      { name: "盾护密阵", delay: waveDelay, enemies: mix([row("shield", [1, 3, 5], 0), row("shield", [0, 2, 4, 6], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("infantry", [1, 2, 3, 4, 5], 3)]) },
      { name: "盾墙压城", delay: waveDelay, enemies: mix([row("shield", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 2, 4, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("infantry", [2, 3, 4, 6], 3)]) }
    ]
  },
  {
    id: 5,
    title: "火药引爆",
    subtitle: "切中点燃，收刀连爆",
    initialEnergy: 66,
    hp: 3,
    enemySpeed: 1.12,
    pickupChance: 0.1,
    waves: [
      { name: "第一桶火", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 4, 5, 6, 3], 0), row("infantry", [1, 5, 3], 1), [enemy("powder", 3, 2)]]) },
      { name: "双火在人群", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 3, 5, 6], 0), row("powder", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]) },
      { name: "盾前火后", delay: waveDelay, enemies: mix([row("shield", [1, 3, 5], 0), row("powder", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("infantry", [2, 4, 6], 3)]) },
      { name: "藏火密阵", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("powder", [1, 3, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("infantry", [0, 2, 4, 6], 3)]) }
    ]
  },
  {
    id: 6,
    title: "火线连环",
    subtitle: "找火药后排，一刀引爆",
    initialEnergy: 54,
    hp: 3,
    enemySpeed: 1.12,
    pickupChance: 0.12,
    waves: [
      { name: "分散火桶", delay: waveDelay, enemies: mix([row("powder", [1, 5], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("infantry", [2, 3, 4, 6, 0], 2)]) },
      { name: "三火相邻", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 5, 6], 0), row("powder", [2, 3, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2)]) },
      {
        name: "火盾混阵",
        delay: waveDelay,
        enemies: mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 3, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("shield", [2, 4], 3)]),
        pickups: [pickup("drum", 3)]
      },
      { name: "连爆爽点", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("powder", [1, 2, 4, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("infantry", [0, 3, 6, 2], 3)]) }
    ]
  },
  {
    id: 7,
    title: "阵眼初现",
    subtitle: "切阵眼，收刀崩阵",
    initialEnergy: 62,
    hp: 3,
    enemySpeed: 1.25,
    pickupChance: 0.12,
    waves: [
      { name: "阵心微光", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 4, 5, 6, 3], 0), row("infantry", [0, 1, 2, 4, 5], 1), [enemy("core", 3, 2)]]) },
      { name: "盾护阵眼", delay: waveDelay, enemies: mix([row("shield", [1, 5], 0), row("shield", [2, 4], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), [enemy("core", 3, 3)], row("infantry", [1, 3, 5, 6], 4)]) },
      { name: "火靠阵眼", delay: waveDelay, enemies: mix([row("powder", [2, 4], 0), [enemy("core", 3, 1)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("shield", [1, 5], 3), row("infantry", [0, 3, 6], 4)]) },
      { name: "密阵找眼", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), [enemy("core", 3, 3)], row("shield", [2, 4], 4), row("infantry", [0, 1, 2, 3, 4, 5, 6], 5)]) }
    ]
  },
  {
    id: 8,
    title: "阵眼保护",
    subtitle: "斜切穿盾，破阵清场",
    initialEnergy: 54,
    hp: 3,
    enemySpeed: 1.25,
    pickupChance: 0.14,
    waves: [
      { name: "左阵有盾", delay: waveDelay, enemies: mix([[enemy("core", 1, 0)], row("shield", [0, 2, 3], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("infantry", [2, 4, 6], 3), row("infantry", [1, 3, 5], 4)]) },
      { name: "右阵藏火", delay: waveDelay, enemies: mix([[enemy("core", 5, 0)], row("powder", [4, 6], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("shield", [1, 3], 3), row("infantry", [0, 2], 4), row("infantry", [1, 3, 5], 5)]) },
      {
        name: "双盾护眼",
        delay: waveDelay,
        enemies: mix([row("shield", [2, 4], 0), [enemy("core", 3, 1)], row("shield", [1, 5], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3), row("infantry", [0, 2, 4, 6], 4), row("powder", [2, 4], 5)]),
        pickups: [pickup("soul", 0)]
      },
      { name: "火阵牵引", delay: waveDelay, enemies: mix([row("powder", [1, 5], 0), [enemy("core", 3, 1)], row("shield", [0, 2, 4, 6], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3), row("powder", [2, 4], 4), row("infantry", [1, 3, 5], 5), row("infantry", [0, 3, 6], 6)]) }
    ]
  },
  {
    id: 9,
    title: "补给与压力",
    subtitle: "切补给，强化下一刀",
    initialEnergy: 48,
    hp: 3,
    enemySpeed: 1.38,
    pickupChance: 0.08,
    waves: [
      {
        name: "战鼓催势",
        delay: waveDelay,
        enemies: mix([row("shield", [1, 3, 5], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("infantry", [0, 2, 4, 6], 2)]),
        pickups: [pickup("drum", 3)]
      },
      {
        name: "刀魂续锋",
        delay: waveDelay,
        enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("shield", [2, 4], 2), row("infantry", [1, 3, 5], 3)]),
        pickups: [pickup("soul", 4)]
      },
      {
        name: "火油附刃",
        delay: waveDelay,
        enemies: mix([row("powder", [2, 4, 5], 0), row("shield", [1, 3, 6], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("infantry", [0, 2, 4, 6], 3)]),
        pickups: [pickup("oil", 1)]
      },
      {
        name: "补给破围",
        delay: waveDelay,
        enemies: mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3), row("shield", [1, 3, 5], 4), row("infantry", [0, 2, 4, 6], 5)]),
        pickups: [pickup("drum", 3)]
      }
    ]
  },
  {
    id: 10,
    title: "黄巾大阵",
    subtitle: "综合破阵，乱切有险",
    initialEnergy: 68,
    hp: 3,
    enemySpeed: 1.38,
    pickupChance: 0.06,
    waves: [
      {
        name: "步兵密集阵",
        delay: waveDelay,
        enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("infantry", [1, 2, 3, 4, 5], 2)]),
        pickups: [pickup("soul", 3)]
      },
      {
        name: "盾兵前排",
        delay: waveDelay,
        enemies: mix([row("shield", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 3, 5], 1), row("infantry", [0, 1, 2, 3, 4, 5, 6], 2), row("infantry", [2, 3, 4, 6], 3)])
      },
      {
        name: "火药后排",
        delay: waveDelay,
        enemies: mix([row("shield", [1, 3, 5], 0), row("powder", [0, 2, 4, 6], 1), row("powder", [2, 4], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3), row("infantry", [1, 3, 5], 4)]),
        pickups: [pickup("oil", 3)]
      },
      {
        name: "阵眼居中",
        delay: waveDelay,
        enemies: mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 3, 4, 5, 6], 3), row("shield", [1, 5], 4), row("infantry", [2, 3, 4, 6], 5)]),
        pickups: [pickup("drum", 0)]
      },
      {
        name: "综合破阵",
        delay: waveDelay,
        enemies: mix([
          row("shield", [0, 1, 5, 6], 0),
          row("powder", [1, 2, 4, 5], 1),
          row("core", [2, 4], 2),
          row("infantry", [0, 1, 2, 3, 4, 5, 6], 3),
          row("shield", [1, 3, 5], 4),
          row("infantry", [0, 1, 2, 3, 4, 5, 6], 5),
          row("powder", [2, 4], 6),
          row("infantry", [0, 3], 7)
        ])
      }
    ]
  }
];
