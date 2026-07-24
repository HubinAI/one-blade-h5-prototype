# 《我只要一刀》V0723014 — 增量设计记录

> 日期：2025-07-23
> 版本：V0723014

## 1. 变更概述

将硬编码的刀势能量绝对值判定（`energy >= 30/70`、`energy / 100`）迁移为 **三档刀势比例模型**（`ratio = current / max → band`）。

核心动机：为后续肉鸽成长（刀势上限 max 从 100 可成长到 140/180）提供架构基础。

## 2. 关键设计决策

| 决策 | 说明 |
|------|------|
| 纯函数层 `bladeMomentum.ts` | 无状态、可独立测试，避免引入服务类 |
| `Game.energy` 单源原则 | 禁止创建 `reactiveBladeCurrent` 副本 |
| `lockedMomentum` 快照 | 替代 `lockedEnergy`，一刀内判定不变 |
| `precision_reflect` 90% 节点 | 只建数据不应用行为（V0723014 仅铺路） |
| 默认 max=100/initial=35 | 所有战斗结果与 V0723013 完全一致 |

## 3. 文件变更清单

### 新增文件
- `src/game/config/bladeMomentum.ts` — BLADE_MOMENTUM_CONFIG + DEFAULT_BLADE_RUN_MODIFIERS
- `src/game/systems/bladeMomentum.ts` — 7 个纯函数
- `src/game/systems/bladeMomentum.test.ts` — ~50 个单元测试
- `docs/incremental-design-V0723014.md` — 本文档

### 修改文件
- `src/version.ts` — APP_VERSION → V0723014
- `package.json` — version → 0723.014
- `index.html` — title 版本号
- `README.md` — 版本号
- `src/game/config/bossReactiveFlow.ts` — 删除 `bladeEnergy.max` / `bladeEnergy.initial`
- `src/game/Game.ts` — 新增 reactiveBladeMax/reactiveBladeRunModifiers/getReactiveBladeMomentum/applyReactiveBladeMaxBonus；getState() 新增 bladeMomentum；drawReactiveDebugOverlay 新增 momentum 面板
- `src/game/systems/BossReactiveController.ts` — resolveGeometry 改用 band；calculateArmorDamage 改用 band switch；getBladeEffect 改用 ratio+band；finishSlash 新增 momentumBefore/momentumAfter
- `src/game/systems/BossReactiveController.test.ts` — 适配 BLADE_MOMENTUM_CONFIG
- `src/game/systems/reactiveSlashGeometry.ts` — 新增 lockedMomentum，lockedEnergy 标记 @deprecated
- `src/game/systems/bossReactiveHUD.ts` — drawEnergyBar 接受 band 参数，文字显示 current/max
- `src/game/systems/bladeEnergySystem.ts` — recoverEnergy 新增可选 maxEnergy 参数
- `e2e/boss-reactive-real-input.spec.ts` — 新增 bladeMomentum 只读断言
- `e2e/boss-reactive-full-pointer.spec.ts` — 新增 bladeMomentum 只读断言

## 4. 兼容性保证

- 默认 max=100、initial=35 下，所有战斗结果（伤害值、反射行为、破甲次数、颜色）与 V0723013 完全一致
- 普通关卡完全不接入新模型
- precision_reflect 90% 节点只建数据不应用行为
