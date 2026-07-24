# 《我只要一刀》V0723014 — 增量设计记录

> 日期：2026-07-24
> 版本：V0723014-Final.1

## 1. 变更概述

将硬编码的刀势能量绝对值判定（`energy >= 30/70`、`energy / 100`）迁移为 **三档刀势比例模型**（`ratio = current / max → band`）。

核心动机：为后续肉鸽成长（刀势上限 max 从 100 可成长到 140/180）提供架构基础。

### V0723014-Final.1 收口变更

- **P0-1**: Reactive PointerDown 时锁定完整 Momentum 快照，startSlash 继承而非重新读取
- **P0-2**: 删除 Reactive lockedEnergy fallback 链，归一化 tier（`ratio * max` 而非绝对值）
- **P0-3**: BladeRunModifiers 标记 @reserved（floorBonus/gainMultiplier/costMultiplier）
- **P1-2**: sanitize NaN/Infinity oldMax/newMax/maxBonus
- **P0-4**: 补 98/140 真实反射测试
- **P0-5**: 补中途 max 变化时起刀快照不变测试
- **P1-1**: 补 max=180 恢复测试

## 2. 关键设计决策

| 决策 | 说明 |
|------|------|
| 纯函数层 `bladeMomentum.ts` | 无状态、可独立测试，避免引入服务类 |
| `Game.energy` 单源原则 | 禁止创建 `reactiveBladeCurrent` 副本 |
| `lockedMomentum` 快照 | 只保留 lockedMomentum（删除 lockedEnergy @deprecated 说明），一刀内判定不变 |
| `precision_reflect` 90% 节点 | 只建数据不应用行为（V0723014 仅铺路） |
| 默认 max=100/initial=35 | 所有战斗结果与 V0723013 完全一致 |
| 归一化 tier | Reactive 模式用 `getBladeTier(lockedMomentum.ratio * BALANCE.swordEnergy.max)`，禁止 `getBladeTier(lockedMomentum.current)` |

## 3. 生产链说明

- **起刀快照**: `handlePointerDown` 时调用 `getReactiveBladeMomentum()` 生成完整快照写入 `pendingSlash.lockedMomentum`，`startSlash` 继承此快照，禁止重新调用 `getReactiveBladeMomentum()`
- **结算链**: `finishSlash` 使用 `momentumBefore.max`（起刀快照的 max）进行 clamp 和 momentumAfter 构建，不受中途 max 成长影响
- **Tier 归一化**: Reactive 模式下 `getBladeTier` 使用归一化等效能量 `lockedMomentum.ratio * BALANCE.swordEnergy.max`，避免 max=140 时 42 被误判为旧 strong 段位（42/140=30% 应为 enhanced → 归一化 30 → normal）
- **Debug 面板**: 显示 `slashMomentum: current/max | ratio: X% | band: X`，不再显示 `slashEnergy: lockedEnergy`
- **统计**: `totalSlashEnergy` 在 Reactive 模式用 `lockedMomentum.current`

## 4. Modifier 状态

### Active（已接入运行时）

| 字段 | 说明 |
|------|------|
| `maxBonus` | 刀势上限加成，通过 `applyBladeRunMaxModifier` 影响刀势 max |
| `nodeThresholdShift` | 节点阈值偏移，通过 `resolveEffectiveNodeThresholds` 影响能力节点解锁时机 |

### @reserved（未接入运行时）

| 字段 | 说明 |
|------|------|
| `floorBonus` | @reserved V0723014未接入运行时，具体语义在下一轮肉鸽专项确认。当前不生效，不应在配置中投放 |
| `gainMultiplier` | @reserved V0723014未接入运行时，具体语义在下一轮肉鸽专项确认。当前不生效，不应在配置中投放 |
| `costMultiplier` | @reserved V0723014未接入运行时，具体语义在下一轮肉鸽专项确认。当前不生效，不应在配置中投放 |

## 5. 文件变更清单

### 新增文件
- `src/game/config/bladeMomentum.ts` — BLADE_MOMENTUM_CONFIG + DEFAULT_BLADE_RUN_MODIFIERS + BladeRunModifiers（含 @reserved 标记）
- `src/game/systems/bladeMomentum.ts` — 纯函数层（含 P1-2 NaN/Infinity sanitize）
- `src/game/systems/bladeMomentum.test.ts` — 单元测试（含 P1-2 NaN/Infinity + P1-1 max=180 恢复测试）
- `docs/incremental-design-V0723014.md` — 本文档

### 修改文件
- `src/game/Game.ts` — P0-1 pendingSlash.lockedMomentum 快照锁定 + P0-2 删除 fallback 链/归一化 tier/Debug 面板
- `src/game/types.ts` — SlashTrail.lockedMomentum 类型（已有）
- `src/game/systems/BossReactiveController.ts` — resolveGeometry/finishSlash 使用 band 判定
- `src/game/systems/BossReactiveController.test.ts` — P0-4 反射测试 + P0-5 快照锁定测试 + tipSweep 注释修正
- `src/game/systems/reactiveSlashGeometry.ts` — 只保留 lockedMomentum
- `src/game/systems/bossReactiveHUD.ts` — drawEnergyBar 接受 band 参数
- `src/game/systems/bladeEnergySystem.ts` — recoverEnergy 新增可选 maxEnergy 参数
- `e2e/boss-reactive-real-input.spec.ts` — bladeMomentum 只读断言
- `e2e/boss-reactive-full-pointer.spec.ts` — bladeMomentum 只读断言

## 6. 测试覆盖

- **Vitest**: 250+（Final.1 后实际数字，含 P0-4/P0-5/P1-1/P1-2 新增测试）
- **E2E**: 5+（Playwright 真实 Pointer 输入测试）

## 7. 兼容性保证

- 默认 max=100、initial=35 下，所有战斗结果（伤害值、反射行为、破甲次数、颜色）与 V0723013 完全一致
- 普通关卡完全不接入新模型
- precision_reflect 90% 节点只建数据不应用行为
- 三档阈值 30%/70%、节点阈值 30%/60%/90%、护甲伤害 25/55/直接破甲 均保持不变
