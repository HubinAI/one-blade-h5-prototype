# 《我只要一刀》增量 PRD — P4.4A.5 天雷劫与破境演出

> 版本: V0722006 | 类型: 增量演出 | 基干: P4.4A.4 Boss 终结阶段封板（V0722002）
> 当前状态: 51/51 测试全绿 | Boss 状态机 execution_success → victory_show → result（需改造）

---

## 1. 产品目标

在 Boss 终结成功（victory_show）与破境结果页之间，插入天雷劫与破境完整演出，让玩家在终结成功后看到 Boss 在天雷中湮灭、自身突破境界的视觉高潮，提升"我只要一刀"的终极爽感。

| # | 目标 | 描述 |
|---|------|------|
| G1 | **演出完整性** | 终结成功不再直接跳结果页，而是经历"天雷劈落 → Boss 湮灭 → 破境光柱"的完整演出链路 |
| G2 | **视觉冲击力** | 通过环境压暗、三段天雷、屏幕闪白、破境光柱等视觉手段，营造"一刀终结引发天象"的史诗感 |
| G3 | **工程健壮性** | 新增 terminal 状态单元测试、共享阶段判断函数、victory_show 粒子清理逻辑，确保插入新状态后不破坏现有测试 |

---

## 2. 状态机变更

### 当前状态机（P4.4A.4）

```
execution_success → victory_show → result
```

### 目标状态机（P4.4A.5）

```
execution_success → victory_show → tribulation_intro → tribulation → breakthrough_show → result
```

| 新增状态 | 作用 | 时长 |
|----------|------|------|
| `tribulation_intro` | 环境压暗、雷云聚集、Boss 裂缝转化为雷光 | ~1.5-2s |
| `tribulation` | 三段天雷逐次劈落，Boss 残躯湮灭 | ~2.5-3s（三段，间隔 0.6-0.8s） |
| `breakthrough_show` | 破境光柱展开，上升粒子流，灵气飘带 | ~2s |

---

## 3. 用户故事

### P0 — 必须（Must Have）

| ID | User Story |
|----|-----------|
| US-P0-1 | As a **玩家**, I want **终结成功后看到天雷劈落 Boss 湮灭** so that **感受到"一刀引天劫"的终极震撼，而不是直接跳结算页** |
| US-P0-2 | As a **玩家**, I want **看到破境光柱和突破成功大字** so that **明确知道境界突破成功，获得成就感** |
| US-P0-3 | As a **开发者**, I want **terminal 新增状态有完整单元测试** so that **状态机变更后能快速回归验证** |

### P1 — 应该（Should Have）

| ID | User Story |
|----|-----------|
| US-P1-1 | As a **开发者**, I want **Boss 阶段判断函数集中导出** so that **后续模块复用阶段逻辑时无需重复定义** |
| US-P1-2 | As a **玩家**, I want **victory_show 粒子和裂缝在演出阶段平滑过渡** so that **画面之间不出现突兀跳变** |
| US-P1-3 | As a **玩家**, I want **演出期间操作被锁定** so that **不会误操作打断演出流程** |

---

## 4. 需求池

### P0 — 必须（Must Have）

#### P0-1: 天雷劫演出主流程（tribulation_intro + tribulation）

| 字段 | 内容 |
|------|------|
| **现状** | victory_show 结束后直接调用 finish(true) 跳 result |
| **实现方案** | 在 victory_show 结束后，按顺序进入 tribulation_intro → tribulation → breakthrough_show → result |
| **验收标准** | ① victory_show 结束后，Canvas 环境自动压暗（全局暗色半透明叠加层）② 顶部渐入多层暗紫色雷云效果③ 执行裂缝（drawExecutionCrack 产物）转化为向上贯穿的雷光，不再以孤立白线停留④ 三段天雷逐次劈落，间隔 0.6-0.8s，每段包含：蓄能白光闪烁 → 竖直雷柱劈向 Boss 残躯 → Boss 碎片震动/湮灭⑤ 雷柱颜色：白→紫光，伴随屏幕闪白⑥ 每段雷击后 Boss 两半残躯缩小+淡出，三段后完全消失 |
| **涉及范围** | BossController 状态机、渲染层（Canvas 效果）、Boss 视觉状态管理 |

#### P0-2: 破境光柱与结果（breakthrough_show）

| 字段 | 内容 |
|------|------|
| **现状** | 无破境演出，直接跳结果页 |
| **实现方案** | 天雷三段结束后，从 Boss 位置向上展开一道金色/白色光柱，光柱内部有上升粒子流（灵气），屏幕边缘出现灵气飘带/彩带；光柱稳定后显示"突破成功"大字（金色，大号），然后衔接现有破境结果页 |
| **验收标准** | ① 天雷结束后自动进入破境光柱阶段② 光柱从 Boss 位置向上展开，持续 ~2s③ 光柱内部可见上升粒子流④ 屏幕边缘出现灵气飘带/彩带效果⑤ "突破成功"大字金色大号显示，持续 >=1s 后过渡到结果页 |
| **涉及范围** | BossController 渲染层、粒子系统、破境结果页衔接 |

#### P0-3: terminal 状态新增单元测试

| 字段 | 内容 |
|------|------|
| **现状** | 当前 51 项测试覆盖 execution 完整链路，但无 tribulation_intro/tribulation/breakthrough_show 相关测试 |
| **实现方案** | 在 BossController.test.ts 中新增至少 6 项测试 |
| **验收标准** | 以下测试全部通过：① tribulation_intro 期间 inputLocked=true② tribulation 期间 freezeCombatResources=true③ tribulation_intro 阶段 bossVisualState 正确（湮灭中）④ breakthrough_show 阶段 bossVisualState 正确（已湮灭）⑤ 三段天雷完整执行后 shards 清理完毕⑥ victory_show 结束后正确进入 tribulation_intro 而非直接 finish(true) |
| **涉及文件** | `src/game/systems/BossController.test.ts` |

### P1 — 应该（Should Have）

#### P1-1: 共享阶段判断函数导出（工程债修复）

| 字段 | 内容 |
|------|------|
| **现状** | 阶段判断逻辑（如 isBossCinematicPhase, isBossInputLockedPhase）可能分散在各模块中重复定义 |
| **实现方案** | 将阶段判断函数集中导出至共享类型/工具模块，供 Game、App、BossController 统一引用 |
| **验收标准** | ① `isBossCinematicPhase(phase)` 覆盖所有演出阶段（victory_show, tribulation_intro, tribulation, breakthrough_show）② `isBossInputLockedPhase(phase)` 覆盖所有输入锁定阶段③ 所有调用点统一使用导出的函数，无重复定义 |
| **涉及文件** | `src/game/types.ts` 或 `src/game/systems/BossController.ts`（导出） |

#### P1-2: victory_show 粒子持续更新或淡出（工程债修复）

| 字段 | 内容 |
|------|------|
| **现状** | victory_show 阶段的粒子效果可能在阶段切换时被截断，或没有正确的淡出过渡 |
| **实现方案** | 确保 victory_show 粒子在进入 tribulation_intro 时平滑过渡/淡出，而非突然消失 |
| **验收标准** | ① victory_show 结束时粒子效果自然淡出（而非突然消失）② 环境压暗与粒子淡出同时进行，视觉过渡自然 |
| **涉及范围** | BossController 渲染层、粒子系统 |

#### P1-3: 演出期间输入锁定与资源冻结

| 字段 | 内容 |
|------|------|
| **现状** | execution 阶段已有 inputLocked/freezeCombatResources 逻辑，但未覆盖新增的演出状态 |
| **实现方案** | 确保 tribulation_intro/tribulation/breakthrough_show 阶段均设置 inputLocked=true 和 freezeCombatResources=true |
| **验收标准** | ① 演出全程玩家不可操作② 战斗资源（刀势、波次、敌人逻辑）在演出期间冻结③ 演出结束后资源正常恢复 |
| **涉及范围** | BossController 状态机、Game 层状态管理 |

---

## 5. 视觉演出规范

### 5.1 环境与氛围（tribulation_intro）

| 元素 | 描述 |
|------|------|
| 环境压暗 | Canvas 全局暗色半透明叠加层，从 0→0.5 不透明度渐入（~0.5s） |
| 雷云聚集 | 从顶部渐入多层暗紫色云，云层透明度由顶向下递减，持续 ~1.5s |
| 裂缝转化 | 终结阶段的竖向裂缝（drawExecutionCrack 产物）从静态白线转化为向上贯穿的雷光，颜色由白→紫，宽度变化 |

### 5.2 天雷劈落（tribulation）

| 元素 | 描述 |
|------|------|
| 三段天雷 | 每段间隔 0.6-0.8s，共三段 |
| 单段流程 | ① 蓄能：Boss 残躯上方出现白光闪烁（~0.15s）② 劈落：竖直雷柱从屏幕顶部劈向 Boss 残躯位置③ 雷柱颜色：白→紫渐变④ 屏幕闪白（~0.1s 半透明白色全屏闪）⑤ Boss 碎片震动+缩小+淡出 |
| 三段递进 | 第一段：Boss 残躯震动，开始出现裂痕；第二段：碎片缩小至 60%，明显湮灭；第三段：碎片完全消失 |

### 5.3 破境光柱（breakthrough_show）

| 元素 | 描述 |
|------|------|
| 光柱展开 | 从 Boss 湮灭位置向上展开金色/白色光柱，底部宽顶部渐窄 |
| 粒子流 | 光柱内部上升的金色粒子流（灵气粒子），持续上升 |
| 灵气飘带 | 屏幕边缘出现彩带/飘带效果，从底部向上飘散 |
| 破境大字 | "突破成功"大字，金色，大号字体，居中显示，持续 >=1s 后淡出进入结果页 |

### 5.4 时间线汇总

```
0s          victory_show 结束
↓
0~1.5s      tribulation_intro：环境压暗、雷云聚集、裂缝转化
↓
1.5~1.65s   天雷第一段：蓄能闪烁
1.65~2.1s   天雷第一段：雷柱劈落 + 屏幕闪白 + Boss 震动
↓
2.1~2.25s   天雷第二段：蓄能闪烁
2.25~2.7s   天雷第二段：雷柱劈落 + 屏幕闪白 + Boss 缩小
↓
2.7~2.85s   天雷第三段：蓄能闪烁
2.85~3.3s   天雷第三段：雷柱劈落 + 屏幕闪白 + Boss 完全湮灭
↓
3.3~5.3s    breakthrough_show：光柱展开（0.5s）、粒子流持续、灵气飘带、破境大字（1.5s 显示 + 0.5s 淡出）
↓
5.3s+       result：破境结果页
```

---

## 6. 关注点与待确认

| # | 关注点 | 风险等级 | 说明 |
|---|--------|---------|------|
| 1 | **三段天雷性能** | 🟡 中 | 屏幕闪白、粒子效果、雷云叠加、Boss 碎片同时渲染，需注意 Canvas 重绘性能，低端设备可能卡顿 |
| 2 | **victory_show 过渡衔接** | 🟡 中 | victory_show 结束后裂缝状态需要正确传递到 tribulation_intro，确保裂缝转化为雷光的视觉连续性 |
| 3 | **现有测试不破坏** | 🟢 低 | 新增 6 项 terminal 测试后，原有 51 项测试必须全部保持绿色 |
| 4 | **破境结果页数据传递** | 🟢 低 | breakthrough_show 结束后需确保正确的破境数据（境界等级、奖励等）传递给 result 页面 |

### 待确认事项

- [ ] 三段天雷的视觉实现方式：纯 Canvas 绘制 vs 预渲染动画序列？建议纯 Canvas 绘制以保持一致性
- [ ] 破境光柱的具体配色方案：金色 vs 白色 vs 金色渐变白？建议以金色为主色
- [ ] 演出总时长是否可跳过？首版暂不提供跳过功能，后续视反馈决定
- [ ] 雷云效果的实现方式：纯 Canvas 绘制云层 vs CSS 叠加层？建议 CSS 叠加层降低 Canvas 负担
- [ ] 灵气粒子流的数量级：建议控制在 20-30 个活跃粒子，避免性能开销
- [ ] 破境结果页是否需新增"境界突破"专属动画/文案？需与现有 result 页面设计对齐

---

## 7. 优先级汇总

| 优先级 | 需求项 | 类型 | 预估工作量 |
|--------|--------|------|-----------|
| **P0** | P0-1 天雷劫主流程（tribulation_intro + tribulation） | 新功能 | 中型（状态机扩展 + 渲染逻辑） |
| **P0** | P0-2 破境光柱与结果（breakthrough_show） | 新功能 | 中型（光柱渲染 + 粒子 + 大字） |
| **P0** | P0-3 terminal 状态单元测试（6 项） | 测试 | 小型（6 项新增测试） |
| **P1** | P1-1 共享阶段判断函数导出 | 工程债 | 微型（重构导出） |
| **P1** | P1-2 victory_show 粒子持续更新或淡出 | 工程债 | 小型（粒子生命周期调整） |
| **P1** | P1-3 演出期间输入锁定与资源冻结 | 工程债 | 微型（新状态加入 lock 范围） |