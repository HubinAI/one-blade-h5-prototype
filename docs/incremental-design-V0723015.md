# 《我只要一刀》V0723015 — 增量设计记录

> 日期：2026-07-24
> 版本：V0723015
> 基线：V0723014-Final.1 (46350cb)

## 1. 变更概述

建立刀势主动循环：主动处理弹幕与护甲 → 获得刀势 → 进入强化/爆发档 → 继续主动操作。同时增加小额错误成本（空挥/危险误砍/身体误砍），但不打断连续操作。

## 2. 数值变更

| 参数 | V0723014 | V0723015 | 说明 |
|------|----------|----------|------|
| passiveRegenPerSecond | 1.5 | 1.0 | 主动收益必须高于被动等待 |
| emptySwingPenalty | 0 | 1 | 小额机会成本，不打断操作 |
| dangerousWrongCutPenalty | (共用10) | 9 | 新增独立值 |
| bodyWrongHitPenalty | (共用10) | 7 | 新增独立值，低于危险误砍 |
| wrongHitPenalty | 10 | @deprecated | 保留一轮迁移，生产不再读取 |

保持不变：baseCost=4, costPer100Px=1, maxCost=8, normalBulletReward=8, reflectReward=16, armorCrackReward=5, armorBreakReward=22

## 3. 核心新机制

### 3.1 armor_closed 事件
- threat 阶段命中关闭护甲 → 返回 armor_closed（非空挥、非身体误击）
- 浮字"破绽未开"，中性灰蓝色，轻微金属火星
- 不造成护甲伤害，不触发身体误砍，不加空挥惩罚
- 仍扣本刀基础消耗

### 3.2 空挥判定模型
- Session 新增：startedPhase / hadActionableTarget / hitClosedArmor
- 空挥惩罚条件：isFullMiss && hadActionableTarget
- 无可交互目标时不加额外惩罚

### 3.3 Modifier 正式语义
- floorBonus → floorRatioBonus（比例下限，默认0）
- gainMultiplier：只作用正向收益（弹幕/反射/护甲奖励），不作用惩罚/被动恢复
- costMultiplier：只作用基础挥刀消耗，不作用空挥/误击惩罚
- floorEnergy = momentumBefore.max * clamp(floorRatioBonus, 0, 0.5)

## 4. 结果优先级

```
armor_broken > armor_hit > dangerous_wrong_cut > body_wrong_hit
> projectile_reflect > projectile_cut > armor_closed > empty_swing
```

## 5. 遥测

单刀结果新增字段：rawBaseCost / costMultiplier / baseCost / rawActiveGain / gainMultiplier / modifiedActiveGain / floorEnergy / hadActionableTarget / hitClosedArmor / emptyPenaltyEligible

Boss 局内累计 ReactiveMomentumTelemetry：passiveGain / activeGain / baseCost / emptyPenalty / dangerousPenalty / bodyPenalty / slashCount / effectiveSlashCount / eligibleEmptySwingCount / noTargetSwingCount / armorClosedCount / bandTime

## 6. 测试覆盖

- **Vitest**: 270/270（含 V0723015 新增 14 个：9.1 基础场景 / 9.2 有效操作 / 9.3 错误成本 / 9.4 关闭护甲 / 9.5 混合事件 / 9.6 Modifier / 9.7 遥测字段）
- **E2E**: 5/5

## 7. 技术债收口

- 删除 REACTIVE_BOSS_CONFIG.armor.damageFormula
- "Game级模拟"测试改名为"Controller起刀快照结算集成测试"
- package.json 新增 verify:all 脚本

## 8. 兼容性保证

- 默认 max=100/initial=35 下，基础战斗流程与 V0723014 一致
- 三档阈值 30%/70%、节点阈值 30%/60%/90%、护甲伤害 25/55/直接破甲 均不变
- burst 反射门槛和直接破甲不变
- 普通关卡不接入新机制
- precision_reflect 90% 节点不正式接管反射
