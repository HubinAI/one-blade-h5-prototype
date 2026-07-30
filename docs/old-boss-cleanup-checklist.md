# 旧Boss策略代码清理清单（准备阶段）

> 本轮不删除，仅梳理清单。下轮正式执行清理。

## 一、待删除模块

### 旧Boss控制器（5个）
| 文件 | 大小 | 对应模式 | 说明 |
|------|------|----------|------|
| `systems/BossController.ts` | 71KB | legacy boss | 三甲破阵+天雷+终结全套状态机 |
| `systems/BossReactiveController.ts` | 76KB | reactive | 供能弹→core→反射 |
| `systems/BossStrategySliceController.ts` | 33KB | strategySlice | 策略切片实验模式 |
| `systems/BossFormationDirector.ts` | 11KB | bossFormation | S3 阵势压境散点模式 |
| `systems/BossFormationChainDirector.ts` | 15KB | formationChain | S4 断链破阵模式 |

### 旧配置文件（4个）
| 文件 | 说明 |
|------|------|
| `config/bossFormation.ts` | S3 阵列配置 |
| `config/bossFormationChain.ts` | S4 树结构配置 |
| `config/bossReactiveFlow.ts` | reactive boss 流程配置 |
| `config/bossStrategySlice.ts` | 策略切片配置 |

### 旧HUD/渲染文件（4个）
| 文件 | 说明 |
|------|------|
| `systems/bossFormationHUD.ts` | S3 HUD |
| `systems/bossReactiveHUD.ts` | 通用 drawEnergyBar/drawHpBar（**注意**：chaseFlash 仍引用这两个函数，需保留或内联） |
| `systems/bossStrategySliceHUD.ts` | 策略切片 HUD |
| `systems/formationChainRenderer.ts` | S4 渲染器 |

### 旧测试文件（至少3个）
| 文件 | 说明 |
|------|------|
| `systems/BossController.test.ts` | 58 项测试 |
| `systems/BossReactiveController.test.ts` | 138 项测试 |
| `systems/BossStrategySliceController.test.ts` | 10 项测试 |
| `systems/BossFormationDirector.test.ts` | 13 项测试 |

### 旧E2E文件
| 文件 | 说明 |
|------|------|
| `e2e/*boss*` | 旧Boss相关E2E |

## 二、需要保留的底层能力

| 文件 | 函数/能力 | 原因 |
|------|----------|------|
| `systems/bossReactiveHUD.ts` | `drawHpBar()` / `drawEnergyBar()` | BossV1 chaseFlash 渲染仍使用这两个函数 |
| `systems/BossChaseController.ts` | — | BossV1 当前模式 |
| `config/bossChase.ts` | — | BossV1 配置 |
| `systems/BossChaseHUD.ts` | — | BossV1 渲染 |

## 三、Game.ts 清理范围

需要删除/修改的引用位置（约88处引用）：
- `gameMode` 联合类型：移除 "boss", "bossReactive", "strategySlice", "bossFormation", "formationChain"
- 构造函数 `bossFlow` 参数：移除 "legacy", "reactive", "strategySlice", "bossFormation", "formationChain"
- 初始化分支：移除 `initializeThunderGeneralBoss`, `initializeFormationChainMode` 等
- 更新分支：移除 `updateBossMode`, `updateReactiveBossMode`, `updateFormationMode`, `updateFormationChainMode`, `updateStrategySliceMode`
- 渲染分支：移除对应 render 方法
- 挥刀分支：移除对应 resolve 方法
- 字段声明：移除 `bossController`, `reactiveController`, `strategySliceController`, `formationDirector`, `formationChainDirector`

## 四、App.tsx / GameCanvas.tsx 清理

- `bossFlow` 类型：移除 "legacy", "reactive", "strategySlice", "bossFormation", "formationChain"
- 旧 bossFlow URL 参数解析
- 旧 debug 跳关入口

## 五、建议操作顺序

1. **先归档**：`git tag v0-legacy-boss-archive` + `git branch archive/legacy-boss-modes`
2. **确认 chaseFlash 完全独立运行**（不依赖任何旧模块）
3. **删除旧文件**
4. **清理 Game.ts 中所有旧引用**
5. **清理 App.tsx / GameCanvas.tsx**
6. **删除旧测试文件**
7. **删除旧E2E文件**
8. **运行 tsc + vitest + build + check:prod-no-e2e + check:prod-no-legacy-boss**

## 六、风险评估

- ⚠️ `bossReactiveHUD.ts` 中的 `drawHpBar`/`drawEnergyBar` 被 chaseFlash 引用，不能删除
- ⚠️ Game.ts 约 88 处引用，逐行清理工作量大
- ⚠️ 删除后旧 URL 参数将不再可用（预期行为）
- ⚠️ 需要新增 `check:prod-no-legacy-boss` 脚本

## 七、仍被 chaseFlash 依赖的旧函数

| 来源 | 函数 | chaseFlash 调用位置 |
|------|------|----------------|
| `bossReactiveHUD.ts` | `drawHpBar()` | `renderChaseFlashMode` |
| `bossReactiveHUD.ts` | `drawEnergyBar()` | `renderChaseFlashMode` |
| `bossReactiveFlow.ts` | `REACTIVE_BOSS_CONFIG.reactiveSlash` | `handlePointerMove` (activationDistance) |

**建议**：将 `drawHpBar`/`drawEnergyBar` 提取到独立公共HUD文件，或内联到 BossChaseHUD。
