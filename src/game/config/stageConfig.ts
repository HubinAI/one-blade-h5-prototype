/**
 * 0807-11B-3: 关卡与节点配置底层
 */
import { BattlePhase } from '../types';
import { getBaseHp, getBaseAttack, ENEMY_TYPE_HP_MULTIPLIER, getEnemyFinalHp } from './mainlineNumeric';

// ═══════════════════════════════════════
// 关卡基础属性（公式化，V0811039）
// ═══════════════════════════════════════

export interface LevelBaseStats {
  baseHp: number;
  baseAttack: number;
}

export function getLevelBaseStats(levelId: number): LevelBaseStats {
  return { baseHp: getBaseHp(levelId), baseAttack: getBaseAttack(levelId) };
}

// ═══════════════════════════════════════
// 怪物类型倍率
// ═══════════════════════════════════════

export type EnemyType = 'infantry' | 'shield' | 'powder' | 'core' | 'splitter' | 'tractor' | 'elite' | 'boss';

export function getEnemyTypeHpMultiplier(type: EnemyType): number {
  return ENEMY_TYPE_HP_MULTIPLIER[type] ?? 1.0;
}

// ═══════════════════════════════════════
// 节点配置
// ═══════════════════════════════════════

export type StageNode = 'tutorial' | 'pre_edict_early' | 'pre_edict_late' | 'post_edict_release' | 'post_edict_understand' | 'post_edict_adapt' | 'post_edict_director_p1' | 'post_edict_director_p2' | 'post_edict_director_p3' | 'elite';

export interface NodeConfig {
  hpMultiplier: number;
  attackMultiplier: number;
  speedMultiplier: number;
  densityMultiplier: number;
}

const NODE_CONFIGS: Record<StageNode, NodeConfig> = {
  tutorial:             { hpMultiplier: 1.00, attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 },
  pre_edict_early:      { hpMultiplier: 1.00, attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 },
  pre_edict_late:       { hpMultiplier: 1.05, attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 },
  post_edict_release:   { hpMultiplier: 1.00, attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 },
  post_edict_understand:{ hpMultiplier: 1.10, attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 },
  post_edict_adapt:     { hpMultiplier: 1.15, attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 },
  post_edict_director_p1: { hpMultiplier: 1.00, attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 }, // HP 75
  post_edict_director_p2: { hpMultiplier: 1.20, attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 }, // HP 90
  post_edict_director_p3: { hpMultiplier: 1.33, attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 }, // HP 100 (Math.round(75*1.33)=100)
  elite:                { hpMultiplier: 1.0,  attackMultiplier: 1.0, speedMultiplier: 1.0, densityMultiplier: 1.0 }, // 精英独立HP
};

export function getNodeConfig(node: StageNode): NodeConfig {
  return NODE_CONFIGS[node];
}

// ═══════════════════════════════════════
// HP 统一计算
// ═══════════════════════════════════════

export function calcFinalHp(levelId: number, enemyType: EnemyType, node: StageNode): number {
  return getEnemyFinalHp(levelId, enemyType, getNodeConfig(node).hpMultiplier);
}

// ═══════════════════════════════════════
// 节点解析
// ═══════════════════════════════════════

export function resolveLevel1Node(battlePhase: BattlePhase, wavesSpawned: number, postChestWaveIndex: number): StageNode {
  if (battlePhase === 'elite') return 'elite';
  if (battlePhase === 'edict_modal' || battlePhase === 'edict_burst') return 'post_edict_release';

  // 军令后波次：postChestWaveIndex 已激活
  if (postChestWaveIndex > 0) {
    // postChestWaveIndex 起始值为 1（spawnPostChestWave 后 +1）
    // 实际波次映射：第1波→release, 第2波→understand, 第3波→adapt
    if (postChestWaveIndex <= 1) return 'post_edict_release';
    if (postChestWaveIndex === 2) return 'post_edict_understand';
    return 'post_edict_adapt';
  }

  // 普通主波阶段
  if (wavesSpawned <= 3) return 'tutorial';
  if (wavesSpawned <= 6) return 'pre_edict_early';
  return 'pre_edict_late'; // 7-8
}
