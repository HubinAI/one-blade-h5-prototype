# 《我只要一刀》增量 PRD — Boss 终结阶段封板修复

> 版本: V0722002 | 类型: 增量修复 | 基干: P4.4A.4 Boss 终结阶段首版

---

## 1. 产品目标（一句话）

在保持 Boss 终结阶段（execution）主链路走通的前提下，收口修复信号污染、测试缺失、视觉表现不一致三大类问题，达到可封板质量。

---

## 2. 用户故事

### P0 — 必须修复

| ID | User Story |
|----|-----------|
| US-P0-1 | As a **玩家**, I want **失败重试后从 execution_intro 重新开始** so that **不会因为信号残留跳过破甲/追击直接进入终结** |
| US-P0-2 | As a **开发者**, I want **execution 阶段有完整的单元测试覆盖** so that **状态机变更后能快速回归验证** |

### P1 — 应该修复

| ID | User Story |
|----|-----------|
| US-P1-1 | As a **玩家**, I want **在终结阶段普通斩/破按钮被隐藏** so that **不会在终结阶段误操作** |
| US-P1-2 | As a **玩家**, I want **命核的视觉范围与真实判定一致** so that **不会出现"看起来没中却判中"或反之的违和感** |
| US-P1-3 | As a **玩家**, I want **成功/失败大字显示足够长的时间** so that **能看清结果反馈（至少 1 秒）** |
| US-P1-4 | As a **玩家**, I want **成功时 Boss 视觉上"一刀两断"** so that **文字与画面不矛盾** |
| US-P1-5 | As a **开发者**, I want **有 E2E 覆盖 execution 成功/失败路径** so that **回归测试能自动验证终结流程** |

### P2 — 可优化

| ID | User Story |
|----|-----------|
| US-P2-1 | As a **开发者**, I want **BossController 的 public 方法通过正式接口调用** so that **不再依赖 `as any` 类型绕过** |
| US-P2-2 | As a **开发者**, I want **`dist_prod_check*` 构建产物不污染仓库** so that **仓库保持干净** |

---

## 3. 需求池

### P0 — 必须（Must Have）

#### P0-1: 修复失败重试信号跨局污染 Bug

| 字段 | 内容 |
|------|------|
| **现状** | `retryExecutionSignal` 使用 `useState(0)` 递增计数，GameCanvas 重新挂载时消费旧信号，导致终结失败重试后返回首页再进 Boss 直接跳到 execution_intro |
| **修复方案** | 改为 `boolean` 一次性事件 `retryExecutionRequested`，GameCanvas 消费后通过回调 `onRetryExecutionConsumed` 归零；所有开战入口（重新挑战/首页/重新进入/普通开战）必须 `setRetryExecutionRequested(false)` |
| **验收标准** | ① 终结失败 → 重试 → 回到首页 → 再次进入 Boss → 从 intro 开始（不跳阶段）② 终结失败 → 重试 → 重新挑战 → 从 intro 开始 ③ 普通开战不受影响 |
| **涉及文件** | `src/App.tsx`, `src/game/GameCanvas.tsx`, `src/game/Game.ts` |

#### P0-2: 补充 execution 阶段单元测试

| 字段 | 内容 |
|------|------|
| **现状** | 当前 38/38 测试仅覆盖到追击/execution_intro，execution 完整状态链无测试 |
| **修复方案** | 在 `BossController.test.ts` 中新增至少 12 项测试，覆盖以下场景 |
| **验收标准** | 所有新增测试通过，覆盖：execution_intro 2秒过渡 → execution；execution 期间 inputLocked/freeze 行为；命中/未命中判定；同一 slashId 不重复命中；success/fail 动画 → 下一状态；`resetToExecutionIntro` 完整重置；retry 信号消费后不残留 |
| **涉及文件** | `src/game/systems/BossController.test.ts` |

### P1 — 应该（Should Have）

#### P1-1: 终结阶段隐藏普通斩/破按钮

| 字段 | 内容 |
|------|------|
| **现状** | execution_intro/execution/execution_success/execution_fail 阶段，普通操作按钮仍然可见 |
| **修复方案** | 将 Boss 阶段透出给 App/战斗 UI 层；execution 相关阶段隐藏或置灰普通斩/破按钮；能量条切换为"终结机会"表现 |
| **验收标准** | execution_intro 开始后，底部操作按钮消失/置灰；execution 结束后（victory_show/fail）恢复 |
| **涉及文件** | `src/App.tsx`, `src/game/Game.ts`（需透出 phase 给 UI 层） |

#### P1-2: 命核视觉与真实判定统一

| 字段 | 内容 |
|------|------|
| **现状** | 判定用半径 55 的圆形，视觉是约 20-25px 发光核心 + 6-8px 竖向裂缝 |
| **修复方案** | 统一为竖向椭圆/胶囊判定，视觉与碰撞共用同一数据源 |
| **推荐几何** | `EXECUTION_GEOMETRY = { visualHalfWidth: 12, visualHalfHeight: 42, hitRadiusX: 20, hitRadiusY: 48, tolerance: 6 }` |
| **验收标准** | 视觉裂缝范围与碰撞判定椭圆基本一致；玩家在裂缝范围内挥刀可命中，范围外不命中 |
| **涉及文件** | `src/game/systems/BossController.ts` |

#### P1-3: 成功/失败大字显示时长修复

| 字段 | 内容 |
|------|------|
| **现状** | `const t = Math.min(executionResultTimer / 0.3, 1)` 导致大字仅显示约 0.3 秒 |
| **修复方案** | execution_success/fail 阶段持续 2 秒，文字应占至少 1 秒以上 |
| **建议时间线** | 0-0.15s 淡入 → 0.15-1.2s 保持 → 1.2-1.8s 淡出 |
| **验收标准** | 成功/失败文字在屏幕上可见至少 1 秒 |
| **涉及文件** | `src/game/systems/BossController.ts`（drawExecutionSuccess / drawExecutionFail） |

#### P1-4: "一刀两断"文字与 Boss 完整画面矛盾

| 字段 | 内容 |
|------|------|
| **现状** | 成功后文字显示"一刀两断"但 Boss 身体完整、HP 满条、命核变大变黄 |
| **修复方案** | 成功时 Boss 沿裂缝分成两片左右偏移淡出；HP 条清空/隐藏；命核碎裂 |
| **验收标准** | execution_success 阶段 Boss 视觉上分裂消逝，HP 条清空，不再显示完整 Boss |
| **涉及文件** | `src/game/systems/BossController.ts`（drawBoss / drawBossHud） |

#### P1-5: 新增 execution 路径 E2E 测试

| 字段 | 内容 |
|------|------|
| **现状** | 现有 E2E 桥只暴露 `armorTargets`/`coreTarget`，缺少 `executionTarget` |
| **修复方案** | 新增 E2E 暴露 `executionTarget` 方法；覆盖成功路径和失败+重试路径 |
| **验收标准** | ① 成功路径 E2E：推进到 execution → 命中命核 → 断言 success → 破境成功页 ② 失败与重试路径 E2E：推进 → 挥空 → 断言 fail → 失败页 → 再试一次 → 断言 execution_intro → 成功终结 → 返回首页再挑战 → 断言从 intro 开始 |
| **涉及文件** | `src/game/Game.ts`（E2E 桥）、`e2e/` 下新增 spec 文件 |

### P2 — 可以（Nice to Have）

#### P2-1: 消除 `as any` 对 BossController 的访问

| 字段 | 内容 |
|------|------|
| **现状** | `resolveExecutionSegment`、`triggerExecutionSuccess`、`resetToExecutionIntro` 等通过 `as any` 调用，类型不安全 |
| **修复方案** | 将需要的方法放入正式接口，导出到 types 或直接声明为 public |
| **验收标准** | 编译无 `as any` 相关警告；所有调用点类型安全 |
| **涉及文件** | `src/game/Game.ts`, `src/game/types.ts`, `src/game/systems/BossController.ts` |

#### P2-2: 清理 dist_prod_check 构建产物

| 字段 | 内容 |
|------|------|
| **现状** | `dist_prod_check*/` 目录进入 git 缓存 |
| **修复方案** | 从 git 缓存移除 + 在 `.gitignore` 中加入 `dist_prod_check*/` |
| **验收标准** | `git status` 不再显示该目录；未来构建不会重新被跟踪 |
| **涉及文件** | `.gitignore` |

---

## 4. 关注点与风险

| # | 关注点 | 风险等级 | 说明 |
|---|--------|---------|------|
| 1 | **P0-1 修复影响面** | 🟡 中 | 信号从 `useState(0)` 递增计数改为 `boolean` + 回调，需确认所有消费方（重试按钮、返回首页、重新挑战、普通开战）均正确设值，漏一处即引入新 bug |
| 2 | **P1-2 判定几何变更** | 🟡 中 | 判定半径从 55 圆形改为竖向椭圆（hitRadiusX:20, hitRadiusY:48），实际命中区域缩小，需确认玩家手感可接受 |
| 3 | **P1-4 Boss 分裂视觉** | 🟢 低 | 纯视觉改动，不影响判定逻辑，但需注意 Canvas 渲染顺序确保分裂效果在正确层级 |
| 4 | **P1-5 E2E 稳定性** | 🟢 低 | execution 段依赖 timing（execution_intro 2秒过渡），E2E 测试需合理 await 避免 flaky |
| 5 | **P0-2 测试覆盖完整性** | 🟢 低 | 12 项测试覆盖 execution 完整状态链即可，无需过度设计 |

### 待确认事项

- [ ] P1-1：Boss 阶段透出给 UI 层的接口形式？通过 Game 的 public getter 还是通过 React context？
- [ ] P1-2：新的竖向椭圆判定几何是否需要玩家侧调整（如放大 tolerance）？
- [ ] P1-4：Boss 分裂效果耗时——是否需要在 2 秒 execution_success 内完成分裂淡出，还是快速消散即可？

---

## 5. 优先级汇总

| 优先级 | 需求项 | 预估工作量 |
|--------|--------|-----------|
| **P0** | P0-1 重试信号污染修复 | 小型（1 文件修改） |
| **P0** | P0-2 execution 单元测试 | 中型（~12 项新测试） |
| **P1** | P1-1 隐藏普通按钮 | 小型（1-2 文件） |
| **P1** | P1-2 命核判定统一 | 小型（1 文件，常量调整） |
| **P1** | P1-3 大字显示时长 | 微型（1 文件，动画曲线调整） |
| **P1** | P1-4 Boss 分裂视觉 | 中型（渲染逻辑新增） |
| **P1** | P1-5 E2E 覆盖 | 中型（E2E 桥 + 新 spec） |
| **P2** | P2-1 消除 as any | 小型（类型导出） |
| **P2** | P2-2 清理 dist_prod_check | 微型（.gitignore） |