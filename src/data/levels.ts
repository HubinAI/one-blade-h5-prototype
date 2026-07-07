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

function mix(items: EnemySpawn[][]): EnemySpawn[] {
  return items.flat();
}

const waveDelay = 2;

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    title: "第一刀",
    subtitle: "随时能砍，满势更爽",
    initialEnergy: 82,
    hp: 3,
    enemySpeed: 0.82,
    pickupChance: 0,
    waves: [
      { name: "横排试锋", delay: waveDelay, enemies: row("infantry", [0, 1, 2, 4, 5, 6]) },
      { name: "斜排压近", delay: waveDelay, enemies: [enemy("infantry", 0, 0), enemy("infantry", 1, 1), enemy("infantry", 2, 2), enemy("infantry", 3, 3), enemy("infantry", 4, 2), enemy("infantry", 5, 1), enemy("infantry", 6, 0), enemy("infantry", 3, 4)] },
      { name: "密集小阵", delay: waveDelay, enemies: mix([row("infantry", [1, 2, 3, 4, 5], 0), row("infantry", [2, 3, 4], 1), row("infantry", [3, 4], 2)]) },
      { name: "一刀收场", delay: waveDelay, enemies: mix([row("infantry", [0, 2, 3, 4, 6], 0), row("infantry", [1, 2, 4, 5], 1), row("infantry", [0, 3, 6], 2)]) }
    ]
  },
  {
    id: 2,
    title: "蓄势再斩",
    subtitle: "等一息，刀芒更长",
    initialEnergy: 20,
    hp: 3,
    enemySpeed: 0.88,
    pickupChance: 0,
    waves: [
      { name: "残锋保命", delay: waveDelay, enemies: mix([row("infantry", [1, 2, 4, 5], 0), row("infantry", [0, 3, 6], 1), [enemy("infantry", 3, 2)]]) },
      { name: "常锋横切", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4], 0), row("infantry", [2, 3, 4, 5, 6], 1)]) },
      { name: "刀魂入刃", delay: waveDelay, enemies: mix([row("infantry", [0, 2, 3, 4, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("infantry", [2, 4], 2)]), pickups: [pickup("soul", 3)] },
      { name: "蓄满多杀", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("infantry", [0, 3, 6], 2)]) }
    ]
  },
  {
    id: 3,
    title: "盾影在前",
    subtitle: "强锋以上可破盾",
    initialEnergy: 68,
    hp: 3,
    enemySpeed: 0.94,
    pickupChance: 0.08,
    waves: [
      { name: "盾兵初现", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 3, 5, 6], 1), row("shield", [2, 4], 0)]) },
      { name: "盾后藏兵", delay: waveDelay, enemies: mix([row("shield", [0, 2, 4, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1), row("infantry", [2, 4], 2)]) },
      { name: "破盾一线", delay: waveDelay, enemies: mix([row("shield", [1, 2, 3, 4, 5], 0), row("infantry", [0, 1, 3, 5, 6], 1), row("infantry", [2, 4], 2)]) },
      { name: "盾墙横排", delay: waveDelay, enemies: mix([row("shield", [0, 1, 2, 4, 5, 6], 0), row("infantry", [1, 2, 3, 4, 5], 1)]) }
    ]
  },
  {
    id: 4,
    title: "强锋破盾",
    subtitle: "弱刀保命，强刀清场",
    initialEnergy: 42,
    hp: 3,
    enemySpeed: 0.98,
    pickupChance: 0.1,
    waves: [
      { name: "盾前步后", delay: waveDelay, enemies: mix([row("shield", [1, 3, 5], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1)]) },
      { name: "斜盾阵", delay: waveDelay, enemies: [enemy("shield", 0, 0), enemy("shield", 1, 1), enemy("shield", 2, 2), enemy("shield", 4, 2), enemy("shield", 5, 1), enemy("shield", 6, 0), ...row("infantry", [2, 3, 4], 3)] },
      { name: "护阵步兵", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 3, 5], 1), row("infantry", [2, 3, 4], 2)]) },
      { name: "盾墙压城", delay: waveDelay, enemies: mix([row("shield", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 3, 5], 1), row("infantry", [0, 2, 4, 6], 2)]) }
    ]
  },
  {
    id: 5,
    title: "火药引爆",
    subtitle: "点燃火药，收刀爆开",
    initialEnergy: 72,
    hp: 3,
    enemySpeed: 1,
    pickupChance: 0.12,
    waves: [
      { name: "第一桶火", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 4, 5, 6], 0), [enemy("powder", 3, 1)]]) },
      { name: "双火夹阵", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 3, 5, 6], 0), row("powder", [2, 4], 1), row("infantry", [1, 3, 5], 2)]) },
      { name: "盾前火后", delay: waveDelay, enemies: mix([row("shield", [1, 3, 5], 0), row("powder", [2, 4], 1), row("infantry", [0, 2, 3, 4, 6], 2)]) },
      { name: "藏火密阵", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("powder", [1, 3, 5], 1), row("infantry", [0, 2, 4, 6], 2)]) }
    ]
  },
  {
    id: 6,
    title: "火线连环",
    subtitle: "让火药替你清场",
    initialEnergy: 58,
    hp: 3,
    enemySpeed: 1.04,
    pickupChance: 0.14,
    waves: [
      { name: "分散火桶", delay: waveDelay, enemies: mix([row("powder", [1, 5], 0), row("infantry", [0, 2, 3, 4, 6], 1)]) },
      { name: "三火相邻", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 5, 6], 0), row("powder", [2, 3, 4], 1), row("infantry", [1, 3, 5], 2)]) },
      { name: "火盾混阵", delay: waveDelay, enemies: mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 3, 5], 1), row("infantry", [2, 3, 4], 2)]), pickups: [pickup("drum", 3)] },
      { name: "连爆爽点", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("powder", [1, 2, 4, 5], 1), row("infantry", [0, 3, 6], 2)]) }
    ]
  },
  {
    id: 7,
    title: "阵眼初现",
    subtitle: "切阵眼，收刀崩散",
    initialEnergy: 66,
    hp: 3,
    enemySpeed: 1.08,
    pickupChance: 0.14,
    waves: [
      { name: "阵心微光", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 4, 5, 6], 0), [enemy("core", 3, 1)]]) },
      { name: "盾护阵眼", delay: waveDelay, enemies: mix([row("shield", [1, 5], 0), row("infantry", [0, 2, 4, 6], 1), [enemy("core", 3, 2)]]) },
      { name: "火靠阵眼", delay: waveDelay, enemies: mix([row("powder", [2, 4], 0), [enemy("core", 3, 1)], row("infantry", [0, 1, 5, 6], 2), row("shield", [1, 5], 3)]) },
      { name: "密阵找眼", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("shield", [1, 5], 1), row("infantry", [0, 2, 4, 6], 2), [enemy("core", 3, 3)]]) }
    ]
  },
  {
    id: 8,
    title: "阵眼崩散",
    subtitle: "等破阵锋，一刀断线",
    initialEnergy: 50,
    hp: 3,
    enemySpeed: 1.12,
    pickupChance: 0.16,
    waves: [
      { name: "左阵眼", delay: waveDelay, enemies: mix([[enemy("core", 1, 0)], row("infantry", [0, 2, 3, 4, 5, 6], 1), row("shield", [3, 5], 2)]) },
      { name: "右阵眼", delay: waveDelay, enemies: mix([[enemy("core", 5, 0)], row("infantry", [0, 1, 2, 3, 4, 6], 1), row("shield", [1, 3], 2)]) },
      { name: "双盾护眼", delay: waveDelay, enemies: mix([row("shield", [2, 4], 0), [enemy("core", 3, 1)], row("infantry", [0, 1, 2, 4, 5, 6], 2), row("shield", [1, 5], 3)]), pickups: [pickup("soul", 0)] },
      { name: "火阵牵引", delay: waveDelay, enemies: mix([row("powder", [1, 5], 0), [enemy("core", 3, 1)], row("shield", [0, 2, 4, 6], 2), row("infantry", [1, 2, 3, 4, 5], 3)]) }
    ]
  },
  {
    id: 9,
    title: "补给连环",
    subtitle: "切补给，强化下一刀",
    initialEnergy: 46,
    hp: 3,
    enemySpeed: 1.16,
    pickupChance: 0.1,
    waves: [
      { name: "战鼓催势", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 4, 5, 6], 0), row("shield", [2, 4], 1)]), pickups: [pickup("drum", 3)] },
      { name: "刀魂续长", delay: waveDelay, enemies: mix([row("shield", [1, 5], 0), row("infantry", [0, 2, 3, 4, 6], 1), [enemy("core", 3, 2)]]), pickups: [pickup("soul", 4)] },
      { name: "火油附刃", delay: waveDelay, enemies: mix([row("powder", [2, 4], 0), row("infantry", [0, 1, 3, 5, 6], 1), row("shield", [1, 5], 2)]), pickups: [pickup("oil", 1)] },
      { name: "补给破围", delay: waveDelay, enemies: mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 4, 5, 6], 3)]), pickups: [pickup("drum", 3)] },
      { name: "连环收束", delay: waveDelay, enemies: mix([row("powder", [1, 2, 4, 5], 0), row("shield", [0, 3, 6], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 4, 5, 6], 3)]) }
    ]
  },
  {
    id: 10,
    title: "黄巾大阵",
    subtitle: "综合破阵体验",
    initialEnergy: 72,
    hp: 3,
    enemySpeed: 1.2,
    pickupChance: 0.08,
    waves: [
      { name: "步兵密集", delay: waveDelay, enemies: mix([row("infantry", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [0, 1, 2, 3, 4, 5, 6], 1), row("infantry", [1, 2, 3, 4, 5], 2)]), pickups: [pickup("soul", 3)] },
      { name: "盾兵前排", delay: waveDelay, enemies: mix([row("shield", [0, 1, 2, 3, 4, 5, 6], 0), row("infantry", [0, 2, 3, 4, 6], 1), row("shield", [1, 5], 2)]) },
      { name: "火药后排", delay: waveDelay, enemies: mix([row("shield", [1, 3, 5], 0), row("powder", [0, 2, 4, 6], 1), row("infantry", [1, 2, 3, 4, 5], 2)]), pickups: [pickup("oil", 3)] },
      { name: "阵眼居中", delay: waveDelay, enemies: mix([row("shield", [0, 2, 4, 6], 0), row("powder", [1, 5], 1), [enemy("core", 3, 2)], row("infantry", [0, 1, 2, 4, 5, 6], 3)]), pickups: [pickup("drum", 0)] },
      { name: "综合破阵", delay: waveDelay, enemies: mix([row("shield", [0, 1, 5, 6], 0), row("powder", [1, 2, 4, 5], 1), row("core", [2, 4], 2), row("infantry", [0, 1, 2, 3, 4, 5, 6], 3), row("shield", [1, 3, 5], 4)]) }
    ]
  }
];
