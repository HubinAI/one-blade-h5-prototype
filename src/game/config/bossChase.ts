// ========================================================================
// Boss V1 追影连斩 — 配置
// ========================================================================
export interface Vec2 { x: number; y: number; }

// ---- 顶层状态 ----
export type BossChaseState =
  | "intro_drop"
  | "intro_breathe"
  | "intro_skill_demo"
  | "intro_stamp_title"
  | "battle_ui_enter"
  | "battle_phase_1"
  | "phase_transition_30"
  | "battle_phase_2"
  | "battle_victory"
  | "battle_failure";

// ---- 战斗行为状态 ----
export type BossAction =
  | "idle_gap"
  | "teleport_windup"
  | "teleport_hidden"
  | "teleport_expose"
  | "teleport_close"
  | "barrage_windup"
  | "barrage_move"
  | "barrage_end"
  | "berserk_cycle"
  | "hit_react"
  | "dead";

// ---- 刀势档位 ----
export type MomentumTier = "low" | "mid" | "high";

// ---- Boss 运行时状态 ----
export interface BossRuntimeState {
  /** 顶层状态 */
  state: BossChaseState;
  /** 战斗行为 */
  action: BossAction;
  /** 世界坐标 */
  x: number; y: number;
  /** Boss HP (0-100) */
  hp: number;
  maxHp: number;
  /** 核心是否暴露 */
  coreExposed: boolean;
  /** 是否无敌 */
  invincible: boolean;
  /** 当前闪现序列索引 */
  teleportSeq: number;
  /** 当前弹幕波索引 */
  barrageWave: number;
  /** 行为计时器 */
  actionTimer: number;
  /** 第一帧标志 */
  firstTick: boolean;
  /** 阶段2已触发 */
  phase2Triggered: boolean;
  /** 是否完成 */
  done: boolean;
}

// ---- 弹幕 ----
export interface BarrageProjectile {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  active: boolean;
}

// ---- 位置池 ----
export const TELEPORT_POSITIONS: Vec2[] = [
  { x: 80, y: 300 },   // 左中
  { x: 310, y: 300 },  // 右中
  { x: 195, y: 260 },  // 中央
  { x: 70, y: 420 },   // 左下
  { x: 320, y: 420 },  // 右下
  { x: 70, y: 220 },   // 左上
  { x: 320, y: 220 },  // 右上
];

// ---- 弹幕轨迹模板 ----
export const BARRAGE_TRAJECTORIES = [
  // S形 — spawnAt 根据 waveInterval 动态生成（运行时处理）
  {
    waypoints: [
      { x: 80, y: 200 }, { x: 310, y: 280 },
      { x: 120, y: 360 }, { x: 270, y: 440 },
    ],
    spawnAt: [],
  },
  // 对角穿梭
  {
    waypoints: [
      { x: 40, y: 350 }, { x: 350, y: 280 },
      { x: 195, y: 400 },
    ],
    spawnAt: [],
  },
  // 弧线
  {
    waypoints: [
      { x: 350, y: 250 }, { x: 195, y: 350 },
      { x: 40, y: 300 },
    ],
    spawnAt: [],
  },
];

// ================================================================
// 配置常量
// ================================================================
export const CHASE_CONFIG = {
  designWidth: 390,
  designHeight: 844,

  // 开场
  intro: {
    dropDuration: 1.5,       // 降落时长
    dropStartY: -80,
    dropEndY: 330,
    breatheDuration: 0.75,
    demoFlashCount: 3,
    demoFlashInterval: 0.28,
  },

  // 四字播报
  stampTitle: {
    text: "雷影无踪",
    charInterval: 0.14,       // 每字间隔
    finalHold: 0.4,
  },

  // 闪现追逐 — 空场约束: 消失→残影≤120ms, 空场≤350ms
  teleport: {
    countMin: 7,
    countMax: 10,
    earlyInterval: 1.1,
    midInterval: 0.85,
    lastInterval: 1.1,
    coreDuration: 0.6,        // 核心暴露（给玩家反应时间）
    previewDuration: 0.16,    // 目的地预告(残影出现→实体出现)
    windupDuration: 0.1,      // 前摇(收紧)
    closeDuration: 0.08,      // 消失(收紧)
    constraint: {
      noSameSequence: true,   // 不连续同点
      maxSameSide: 2,         // 不连续3次同侧
      midBottomRatio: 0.4,    // 至少40%在中下部
    },
  },

  // 弹幕 — 移动中持续发射（不重叠，可读，保留多斩路线）
  barrage: {
    duration: 5.0,
    shotInterval: 0.36,       // 间隔 0.36s，160×0.36=57.6px > 36px直径
    perShotMin: 1,
    perShotMax: 1,            // 普通1枚，每3发1次允许2枚
    perShotBurstEvery: 3,     // 每第3次发射允许2枚
    perShotBurstCount: 2,
    minSpawnSpacing: 48,      // 相邻弹幕最小间距
    maxActiveBarrages: 14,    // 同屏活跃上限
    projectileSpeed: 160,
    projectileRadius: 18,
    invincibleBoss: true,
  },

  // 最终阶段 — 压迫→失衡→反击→重装 四子状态循环
  phase2: {
    assault: {
      flashes: 3,               // 每轮 3 次闪现
      durationPer: 0.65,        // 单次闪现时长
      barragePerFlash: 2,       // 每次闪现弹幕数
      barrageInterval: 0.32,    // 弹幕发射间隔
      barrageMaxRound: 7,       // 一轮总弹幕上限
    },
    recovery: {
      duration: 0.16,           // 失衡前摇最短时间
      maxDuration: 0.45,        // 最大等待（超时强制进入COUNTER）
    },
    counter: {
      firstDuration: 0.8,
      duration: 0.65,
      minDuration: 0.35,
      maxBarrages: 3,
      barrageSlowdown: 0.4,
      // 反击窗口锚点（不再固定在中央）
      anchors: [
        { id: "center",    x: 195, y: 310 },
        { id: "leftHigh",  x: 120, y: 270 },
        { id: "rightHigh", x: 270, y: 270 },
        { id: "leftLow",   x: 135, y: 360 },
        { id: "rightLow",  x: 255, y: 360 },
      ],
      firstAnchorId: "center",
      centerCooldown: 3,          // center 每 3 窗最多用一次
      minTravelDistance: 80,
      maxTravelDistance: 180,
      forbiddenBarrageDistance: 45,
      minBarrageDistance: 70,
      recentExclude: 2,           // 排除最近 2 个锚点
      previewDuration: 0.12,      // 目标预告雷环显示时长
      moveSpeedBase: 700,         // px/s，用于计算时长
      moveDurationMin: 0.16,
      moveDurationMax: 0.28,
    },
    rearm: {
      duration: 0.2,            // 重装时间
    },
    maxActiveBarrages: 9,       // PHASE2 同屏弹幕上限
  },

  // 阶段转场 — 30%锁血+0.9s狂暴表演
  transition: {
    hpThreshold: 0.3,
    duration: 0.9,
    lockHpAt: 300,            // HP 锁在此值等待转场
  },

  // ---- Boss HP 预算 ----
  bossMaxHp: 1000,
  hpTransitionThreshold: 300, // 30% 阶段阈值

  // ---- 伤害预算（配置化，禁止魔法数字） ----
  damage: {
    shell: { min: 8, max: 12 },                   // 外壳命中
    core: { low: 48, mid: 58, high: 68 },          // 核心命中（按刀势档位）
    barrageHit: 5,                                   // 弹幕命中玩家
    berserkHit: 5,                                  // 最终阶段弹幕
  },

  // ---- 刀势经济 ----
  shellEnergyGain: 3,        // 外壳命中刀势
  coreEnergyGain: 14,        // 核心命中刀势（基础）
  projectileEnergyGain: 6,   // 弹幕命中刀势

  // 玩家 HP
  playerMaxHp: 100,
  /** 防线Y坐标 — 上移至战斗区与玩家保护区之间 */
  playerDefenseLineY: 710,   // 与普通关统一

  // 刀势
  bladeEconomy: {
    initial: 50,
    slashCost: 8,
    missPenalty: 5,
  },

  // 刀势档位阈值
  momentumTiers: {
    lowMax: 40,
    midMax: 70,
  },

};
