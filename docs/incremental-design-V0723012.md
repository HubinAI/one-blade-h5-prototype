# V0723012 增量架构设计

> 版本：V0723011 → V0723012（P4.4B-R5.8 / 0723.012）  
> 目标：修复 6 个 P0 数据流缺陷 + 3 个 P1 代码清理/收口  
> 范围：Game.getState 桥接、E2E 真实轮询、护甲事件去重、Debug 遥测时间窗口、测试硬化、CI 入口、三胶囊确定性测试、死代码删除、世界变换统一

---

## 1. 增量实现方案

### 1.1 P0-1: E2E getState 的 lastReactiveExitSnapshot 无法在 boss 模式读取

**根因**：`Game.getState()` 的 `bossReactive && reactiveController` 分支（line 500）返回 `lastReactiveExitSnapshot`，但 Reactive 完成后 Game 在同一次同步更新中：保存 snapshot → `reactiveController = null` → `gameMode = "boss"`。后续 `getState()` 走 `else` 分支（line 523），不再返回 snapshot。

**修复**：`exitSnapshot` 提到公共返回层，无论 `bossReactive` 还是 `boss` 模式都返回 `self._lastReactiveExitSnapshot ?? undefined`。

```ts
// Game.ts getState() 结构变更
getState: () => {
  // 公共字段（无论什么模式都返回）
  const common = {
    lastReactiveExitSnapshot: self._lastReactiveExitSnapshot ?? undefined,
    // ... 其他公共字段
  };
  
  if (self.gameMode === "bossReactive" && self.reactiveController) {
    return { ...common, ...reactiveSpecific };
  }
  return { ...common, ...bossSpecific };
}
```

**验收**：`getState()` 在 `gameMode === "boss"` 时也能读到 `lastReactiveExitSnapshot`。

---

### 1.2 P0-2: full-pointer spec 未真正 poll 耐久变化

**根因**：`breakCurrentArmorWithMouse()` 在 `realMouseDragThroughArmor()` 后立即 `const after = await getState()` 一次读取（line 85），不是轮询。低性能 CI 下下一帧可能未 finalize，导致 `after.armorProgress` 和 `beforeProgress` 相同，然后 `afterDurability` 也因耐久变化未提交而等于 `previousDurability`，断言失败。

**修复**：`mouseUp` 后改为 `expect.poll` 轮询 durability/progress/mode 变化，等待稳定后再读状态。

```ts
// breakCurrentArmorWithMouse 中的修复
await realMouseDragThroughArmor();

// 改为 poll 轮询（替代单次 getState）
await expect.poll(async () => {
  const s = await getState();
  // 条件1：armorProgress 增加了（护甲破碎）
  // 条件2：armorDurability[expectedIndex] 下降了（耐久变化）
  // 条件3：gameMode 切换为 boss（全破）
  return s.armorProgress !== beforeProgress 
    || (s.armorDurability?.[expectedIndex] ?? 100) < previousDurability
    || s.gameMode === "boss";
}, { timeout: 10000 }).toBe(true);

const after = await getState();
```

**验收**：`breakCurrentArmorWithMouse` 在低性能 CI 下也能稳定等到耐久变化后再断言。

---

### 1.3 P0-3: 护甲事件被重复加入 result.events

**根因**：`commitArmorDamage()`（line 859）向 `this._session.events` push 一次 armor event。`finishSlash()`（line 916）又向 `events` push 一次 armor event。由于 `events` 是从 `this._session.events` 拷贝的（line 879），`finishSlash` 的第二次 push 导致重复。

**修复**：`finishSlash` 只从 `_pendingSlashResult` 读取护甲结算数据，**不再 push armor event 到 events**。因为 armor event 已在 `commitArmorDamage` 时加入了 `_session.events`，拷贝到 `events` 后自然包含。

```ts
// finishSlash 中删除以下代码（line 910-916）
// 删除：不再 push armorEv，因为 session.events 已包含
const armorEv: ReactiveCollisionEvent = { ... };
events.push(armorEv); // ❌ 删除此行
```

**新增不变量测试**：
- armor-only 时 `result.events.length === 1`（仅 armor event）
- cut+armor 时 `result.events.length === 2`（cut event + armor event）

**验收**：armor-only 时 `events.length === 1`，cut+armor 时 `events.length === 2`。

---

### 1.4 P0-4: Debug 混用两个不同时间点的数据

**根因**：`Game` 中有两个遥测字段：
- `_lastReactiveResolve`（line 1111）：上一次 `finishSlash` 的结果（由 `finalizeBossSlashCommon` 在 line 4497 赋值）
- `_lastReactiveEvents`（line 1133）：当前 segment 的 `resolveGeometry` 结果（由 `checkReactiveProjectileHits` 在 line 2311 赋值）

`drawReactiveDebugOverlay`（line 2267）显示 `events: ${this._lastReactiveEvents.length}` 但 `lastResult/secondary/counts` 来自 `_lastReactiveResolve`。两套数据来自不同时间点。

**修复**：拆分 `_currentReactiveSegmentEvents`（resolveGeometry 更新）和 `_lastResolvedReactiveEvents`（finishSlash 从 result.events 赋值）。Debug 面板的 `lastResult/secondary/counts/events` 全部来自 `_lastReactiveResolve` 的同一次结算。

```ts
// Game.ts 新增/修改字段
private _currentReactiveSegmentEvents: ReactiveCollisionEvent[] = [];  // 替代 _lastReactiveEvents
private _lastResolvedReactiveEvents: ReactiveCollisionEvent[] = [];    // 新增

// 起刀时重置（替代 line 1528）
this._currentReactiveSegmentEvents = [];

// resolveGeometry 时（替代 line 2311）
this._currentReactiveSegmentEvents = events;

// finishSlash 时（在 line 4521 处）
this._lastResolvedReactiveEvents = result.events;

// drawReactiveDebugOverlay 全部读 _lastReactiveResolve（已含 eventsSummary）
// 删掉 `events: ${this._lastReactiveEvents.length}` 行
// 改为：`events: ${resolve?.eventsSummary ?? "-"}`
```

**验收**：Debug 面板的 lastResult/secondary/counts/events 全部来自同一次 `finishSlash` 结算。

---

### 1.5 P0-5: 多个新增 Vitest 可静默通过

**问题清单**：

| 问题 | 位置 | 说明 |
|------|------|------|
| 条件跳过 | C1-C3, H2-H4, J3-J6, K1-K3 | `if (projs.length > 0)` 等条件包裹，弹幕未生成时测试静默通过 |
| 无断言计数 | 全部 | 没有 `expect.assertions(N)` 确保所有断言执行 |
| J4 名实不符 | line 866 | 测试名 `body_wrong_hit > projectile_reflect` 但实际只测了 `armor_hit` |
| `events.length >= 0` | — | 永远为 true 的断言 |

**修复**：

1. **新增 `spawnProjectileForTest()` 确定性注入接口**：

```ts
// BossReactiveController 新增 public 方法
/** P0-5: 测试专用 — 确定性注入弹幕（跳过随机生成） */
spawnProjectileForTest(kind: ProjectileKind, x: number, y: number, vx?: number, vy?: number): Projectile {
  const p = createProjectile(kind, x, y, vx ?? 0, vy ?? REACTIVE_BOSS_CONFIG.projectiles.normal.speed);
  this.projectiles.push(p);
  return p;
}
```

2. **所有关键测试加 `expect.assertions(N)`**。

3. **删除条件跳过逻辑**：所有 `if (projs.length > 0)` 包裹改为直接断言 `expect(projs.length).toBeGreaterThan(0)` 或 `expect(projectile).toBeDefined()`。

4. **J4 必须真实构造 body+reflect 混合**：
   - 用 `spawnProjectileForTest("reflective", ...)` 注入 reflective 弹幕
   - 构造经过身体的几何但不命中护甲
   - 断言 `primaryResult === "body_wrong_hit"`
   - 断言 `secondaryResults` 包含 `"projectile_reflect"`

**验收**：
- 所有 projectile 依赖测试使用 `spawnProjectileForTest()` 确定性注入
- 每个测试都有 `expect.assertions(N)` 且 N 与实际断言数匹配
- J4 真实测试 body_wrong_hit > projectile_reflect 优先级

---

### 1.6 P0-6: 无 CI/E2E 绿色证明

**当前状态**：只有静态审查，无 Playwright 实际运行记录。

**修复**：新增 GitHub Actions CI 配置，每次 push 自动运行：
1. `npm run build` 编译检查
2. `npx vitest run` 单元测试
3. `npx playwright test` E2E 测试（headless）

```yaml
# .github/workflows/ci.yml 新增
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npx vitest run
      - run: npx playwright install --with-deps
      - run: npx playwright test
```

**验收**：CI 配置就绪，`npx vitest run` 和 `npx playwright test` 可通过。

---

### 1.7 P1-1: 三胶囊确定性 Pointer 测试

**当前**：无三胶囊全覆盖的确定性测试。

**新增测试用例**（在 `BossReactiveController.test.ts` 中）：

```
T1: baseTrail miss + visibleBlade hit — 手指轨迹未触甲但刀身触甲
T2: tipSweep hit — 只有刀尖扫掠区命中护甲
T3: 三胶囊全部 miss — 三种胶囊均未命中护甲
```

测试方法：使用 `resolveGeometry` 传入特定几何，分别构造三种胶囊的命中/未命中场景。

**实现辅助函数**：
```ts
function buildCapsuleTestGeometry(
  source: CapsuleSource, 
  center: Vec2, 
  angle: number, 
  slashId: string
): ReactiveSlashGeometry { ... }
```

**验收**：三个新测试用例全部通过，覆盖三胶囊的命中/未命中组合。

---

### 1.8 P1-2: 删除 private resolveSegment 和 segmentHitEllipse 死代码

**当前**：`BossReactiveController` 中：
- `private resolveSegment()`（line 580-636）：旧实现，已被 `resolveGeometry()` 替代
- `private segmentHitEllipse()`（line 567-574）：仅被 `resolveSegment()` 调用

**修复**：删除这两个私有方法及其所有内部引用。

> ⚠️ 注意：`resolveSegment` 中的 `_resolvedSlashId` 检查逻辑（line 582）已迁移到 `resolveGeometry`（line 656），`_session` 初始化逻辑（line 585-587）也已迁移（line 659-661）。删除前确认无遗漏。

**验收**：编译通过，所有测试通过，`resolveGeometry` 功能不受影响。

---

### 1.9 P1-3: 世界变换继续收口

**当前**：`resolveGeometry()` 中仍有硬编码的 `BOSS_CX + armor.relX * this.bossRenderScale` 模式（line 722-725, 744-748），未使用 `localToBossWorld()` 和 `getArmorWorldGeometry()`。

**修复**：

1. **新增 `getBodyWorldGeometry()`**：
```ts
/** 身体部位世界几何（返回所有身体椭圆的世界坐标） */
getBodyWorldGeometry(): Array<{ center: Vec2; rx: number; ry: number }> {
  return BODY_PARTS.map(p => ({
    center: this.localToBossWorld({ x: p.cx, y: p.cy }),
    rx: p.rx * this.bossRenderScale,
    ry: p.ry * this.bossRenderScale,
  }));
}
```

2. **`resolveGeometry` 中护甲检测**：将 line 722-725 替换为 `getArmorWorldGeometry(this.activeArmorIndex)`。

3. **`resolveGeometry` 中身体检测**：将 line 744-748 替换为 `getBodyWorldGeometry()`。

4. **`commitArmorDamage` 和 `finishSlash` 中的 `BOSS_CX` 引用**：同样替换为 `localToBossWorld`。

5. **`getProjectileSpawnOrigin()` 确认命名**：当前为单数，确认是否需改为 `getProjectileSpawnOrigins()`（如需求文档所述）。建议保留单数，因为返回单个 Vec2。

**验收**：`resolveGeometry` 中不再有 `BOSS_CX + relX * bossRenderScale` 模式，全部通过 `localToBossWorld` / `getArmorWorldGeometry` / `getBodyWorldGeometry` 统一接口。

---

## 2. 修改/新增文件列表

| 相对路径 | 类型 | 说明 |
|---|---|---|
| `src/game/Game.ts` | 修改 | P0-1: getState 公共返回层；P0-4: 拆分遥测字段 |
| `src/game/systems/BossReactiveController.ts` | 修改 | P0-3: finishSlash 去重；P0-5: 新增 spawnProjectileForTest；P1-2: 删除死代码；P1-3: 世界变换收口 |
| `src/game/systems/BossReactiveController.test.ts` | 修改 + 新增 | P0-3: 不变量测试；P0-5: 测试硬化；P1-1: 三胶囊测试；P1-3: 世界变换测试 |
| `e2e/boss-reactive-full-pointer.spec.ts` | 修改 | P0-2: 改为 expect.poll 轮询 |
| `.github/workflows/ci.yml` | 新增 | P0-6: CI 配置 |
| `src/App.tsx` | 修改 | 版本号更新为 V0723012 |

---

## 3. 数据结构与接口变更

### 3.1 Game.ts 遥测字段变更

```ts
// 修改前
private _lastReactiveEvents: ReactiveCollisionEvent[] = [];  // 混用时间窗口

// 修改后
/** 当前 segment 的 resolveGeometry 事件（用于同帧粒子反馈） */
private _currentReactiveSegmentEvents: ReactiveCollisionEvent[] = [];
/** 上一次 finishSlash 的完整事件列表（与 _lastReactiveResolve 同一次结算） */
private _lastResolvedReactiveEvents: ReactiveCollisionEvent[] = [];
```

### 3.2 BossReactiveController 新增接口

```ts
/** P0-5: 测试专用 — 确定性注入弹幕 */
spawnProjectileForTest(
  kind: ProjectileKind, 
  x: number, 
  y: number, 
  vx?: number, 
  vy?: number
): Projectile;

/** P1-3: 身体部位世界几何 */
getBodyWorldGeometry(): Array<{ center: Vec2; rx: number; ry: number }>;
```

### 3.3 BossReactiveController 删除接口

```ts
// 删除以下私有方法
private resolveSegment(...)    // 被 resolveGeometry 替代
private segmentHitEllipse(...) // 仅被 resolveSegment 调用
```

---

## 4. 程序调用流程

### 4.1 类图变更

```mermaid
classDiagram
    class Game {
        -_lastReactiveResolve: object
        -_currentReactiveSegmentEvents: ReactiveCollisionEvent[]  // 新增（替代 _lastReactiveEvents）
        -_lastResolvedReactiveEvents: ReactiveCollisionEvent[]    // 新增
        -_lastReactiveExitSnapshot: object
        +getState() : object
        -checkReactiveProjectileHits(a, b, trail)
        -finalizeBossSlashCommon(trail)
        -drawReactiveDebugOverlay(ctx, rc)
    }

    class BossReactiveController {
        -_session: ReactiveSlashSession
        -_pendingSlashResult: PendingReactiveSlashResult
        -_resolvedSlashId: string
        +resolveGeometry(geometry): ReactiveCollisionEvent[]
        +finishSlash(slashId, energyBefore, pathLen): ReactiveSlashResolveResult
        +spawnProjectileForTest(kind, x, y, vx?, vy?): Projectile      // 新增
        +getBodyWorldGeometry(): BodyPartGeometry[]                      // 新增
        -commitArmorDamage(energy, armorIndex, source, hitPos)
        ~~resolveSegment(segA, segB, slashId, bladeReach)~~              // 删除
        ~~segmentHitEllipse(segA, segB, cx, cy, rx, ry)~~                // 删除
    }

    Game --> BossReactiveController : owns
```

### 4.2 时序图：P0-1 getState 公共返回层

```mermaid
sequenceDiagram
    participant E2E as E2E Test
    participant Game as Game.getState
    participant RC as BossReactiveController

    Note over E2E,RC: 场景1: bridgeTriggered 前（bossReactive 模式）
    E2E->>Game: getState()
    Game->>Game: gameMode === "bossReactive" && reactiveController
    Game-->>E2E: { ..., lastReactiveExitSnapshot: undefined }

    Note over E2E,RC: bridgeTriggered → 捕获 snapshot
    RC->>RC: bridgeTriggered = true
    Game->>Game: _lastReactiveExitSnapshot = snap
    Game->>Game: reactiveController = null, gameMode = "boss"

    Note over E2E,RC: 场景2: 切到 boss 模式后
    E2E->>Game: getState()
    Game->>Game: gameMode === "boss"
    Game-->>E2E: { ..., lastReactiveExitSnapshot: { armorProgress: "3/3", ... } }  // 修复点
```

### 4.3 时序图：P0-3 护甲事件去重

```mermaid
sequenceDiagram
    participant Game as Game
    participant RC as BossReactiveController

    Game->>RC: resolveGeometry(geometry)
    RC->>RC: commitArmorDamage(energy, index, source, hitPos)
    RC->>RC: _session.events.push(armorEv)  // 第1次 push
    RC-->>Game: [armorEv]  // newEvents 包含 armorEv

    Game->>RC: finishSlash(slashId, energyBefore, pathLen)
    RC->>RC: events = [...this._session.events]  // 已含 armorEv
    Note over RC: 不再 push armorEv 到 events
    RC-->>Game: { events: [armorEv], ... }  // 仅1次
```

### 4.4 时序图：P0-4 Debug 遥测时间窗口修复

```mermaid
sequenceDiagram
    participant Game as Game
    participant RC as BossReactiveController

    Note over Game,RC: 起刀
    Game->>Game: _currentReactiveSegmentEvents = []

    loop 每帧 pointerMove
        Game->>RC: resolveGeometry(geometry)
        RC-->>Game: newEvents
        Game->>Game: _currentReactiveSegmentEvents = newEvents  // 当前 segment 事件
        Game->>Game: 粒子反馈（从 _currentReactiveSegmentEvents 读）
    end

    Note over Game,RC: 收刀
    Game->>RC: finishSlash(slashId, ...)
    RC-->>Game: result
    Game->>Game: _lastReactiveResolve = result  // 同一次结算
    Game->>Game: _lastResolvedReactiveEvents = result.events  // 同一次结算

    Note over Game,RC: Debug 绘制（全部来自同一时间点）
    Game->>Game: drawReactiveDebugOverlay
    Note over Game: lastResult ← _lastReactiveResolve.primaryResult<br/>eventsSummary ← _lastReactiveResolve.eventsSummary<br/>counts ← _lastReactiveResolve.cutCount/etc.
```

---

## 5. 有序任务列表

### T01：项目基础设施 + 版本标识 + CI 配置

- **源文件**：`src/App.tsx`、`.github/workflows/ci.yml`
- **变更**：
  - `appVersion` 从 `"V0723011"` 改为 `"V0723012"`
  - 新增 `.github/workflows/ci.yml`（GitHub Actions CI 配置：build → vitest → playwright）
- **依赖**：无
- **优先级**：P0

### T02：Controller 核心修复（P0-3 + P1-2 + P1-3）

- **源文件**：`src/game/systems/BossReactiveController.ts`
- **变更**：
  - **P0-3**：`finishSlash()` 删除 `events.push(armorEv)`（line 910-916），防止护甲事件重复
  - **P1-2**：删除 `private resolveSegment()`（line 580-636）和 `private segmentHitEllipse()`（line 567-574）
  - **P1-3**：新增 `getBodyWorldGeometry()`；`resolveGeometry` 中护甲检测改用 `getArmorWorldGeometry`；身体检测改用 `getBodyWorldGeometry`；`commitArmorDamage` 和 `finishSlash` 中的字面 `BOSS_CX + relX * bossRenderScale` 替换为 `localToBossWorld`
  - **P0-5**：新增 `spawnProjectileForTest()` 公共方法
- **依赖**：T01
- **优先级**：P0

### T03：Game 层集成修复（P0-1 + P0-4）

- **源文件**：`src/game/Game.ts`
- **变更**：
  - **P0-1**：`getState()` 重构为公共返回层模式，`lastReactiveExitSnapshot` 在所有分支返回
  - **P0-4**：`_lastReactiveEvents` 拆分为 `_currentReactiveSegmentEvents`（resolveGeometry 更新）和 `_lastResolvedReactiveEvents`（finishSlash 赋值）；`drawReactiveDebugOverlay` 全部从 `_lastReactiveResolve` 读取，删除 `events: ${this._lastReactiveEvents.length}` 行
- **依赖**：T02（使用 Controller 的接口）
- **优先级**：P0

### T04：测试硬化 + 新增测试（P0-3 不变量 + P0-5 硬化 + P1-1 三胶囊）

- **源文件**：`src/game/systems/BossReactiveController.test.ts`
- **变更**：
  - **P0-3 不变量**：新增 armor-only 测试（`events.length === 1`）和 cut+armor 测试（`events.length === 2`）
  - **P0-5 硬化**：
    - 所有 `if (projs.length > 0)` 条件跳过改为 `expect(projs.length).toBeGreaterThan(0)` + `spawnProjectileForTest()` 确定性注入
    - 全部关键测试加 `expect.assertions(N)`
    - J4 修复：真实构造 body+reflect 混合场景，断言 `primaryResult === "body_wrong_hit"` 且 `secondaryResults` 包含 `"projectile_reflect"`
  - **P1-1 三胶囊**：新增 T1（baseTrail miss + visibleBlade hit）、T2（tipSweep hit）、T3（三胶囊全部 miss）
- **依赖**：T02（依赖 `spawnProjectileForTest` 和删除死代码后的 Controller）
- **优先级**：P0

### T05：E2E 轮询修复 + 验收（P0-2 + P0-6）

- **源文件**：`e2e/boss-reactive-full-pointer.spec.ts`
- **变更**：
  - **P0-2**：`breakCurrentArmorWithMouse()` 中 `realMouseDragThroughArmor()` 后的单次 `getState()` 改为 `expect.poll` 轮询 durability/progress/mode 变化
  - **P0-6**：确认 CI 配置就绪，`npx vitest run` 和 `npx playwright test` 都能通过
- **依赖**：T03（依赖 Game.ts 修复后的 getState）
- **优先级**：P0

---

## 6. 任务依赖图

```mermaid
graph TD
    T01[T01: 基础设施 + 版本 + CI] --> T02
    T01 --> T03
    T02 --> T04
    T02 --> T03
    T03 --> T05
    T04[T04: 测试硬化 + 新增测试]
    T05[T05: E2E 轮询修复 + 验收]
```

---

## 7. 共享知识

### 7.1 跨文件约定

1. **`lastReactiveExitSnapshot` 公共返回**：所有 `getState()` 分支都返回 `self._lastReactiveExitSnapshot ?? undefined`，包括 `bossReactive` 和 `boss` 模式。E2E 断言在 bridge 完成后用 `gameMode === "boss"` 状态下读取 snapshot。

2. **护甲事件唯一来源**：`commitArmorDamage` 是 armor event 的唯一 push 点（向 `_session.events` push）。`finishSlash` 只从 `_session.events` 拷贝，禁止再次 push。

3. **Debug 遥测时间窗口**：
   - `_currentReactiveSegmentEvents`：当前 segment 的实时事件（resolveGeometry 更新），用于同帧粒子反馈
   - `_lastResolvedReactiveEvents`：上一次 finishSlash 的完整事件列表（与 `_lastReactiveResolve` 同一次结算），用于 Debug 面板
   - Debug 面板的 `lastResult/secondary/counts/events` 全部来自 `_lastReactiveResolve`

4. **测试确定性注入**：所有 projectile 依赖测试必须使用 `spawnProjectileForTest()` 确定性注入，禁止依赖 `update()` 的随机弹幕生成。每个测试必须加 `expect.assertions(N)`。

5. **世界变换接口**：`resolveGeometry` 中的护甲/身体碰撞检测全部使用 `getArmorWorldGeometry` / `getBodyWorldGeometry` / `localToBossWorld`，禁止字面 `BOSS_CX + relX * bossRenderScale` 模式。

### 7.2 版本号更新规则

- `src/App.tsx` 中的 `appVersion` 必须更新为 `"V0723012"`。

### 7.3 E2E 约定

- `breakCurrentArmorWithMouse` 中 `mouseUp` 后必须使用 `expect.poll` 轮询，禁止单次 `getState()`。
- 第三甲断言使用 `lastReactiveExitSnapshot`，在 `gameMode === "boss"` 状态下读取。

### 7.4 测试约定

- 所有 projectile 测试使用 `spawnProjectileForTest()` 确定性注入，禁止 `if (projs.length > 0)` 条件跳过。
- 每个测试加 `expect.assertions(N)`。
- 不变量测试：armor-only `events.length === 1`，cut+armor `events.length === 2`。

---

## 8. 风险点和待明确事项

### 8.1 风险点

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 删除 `resolveSegment` 后发现 `resolveGeometry` 中遗漏了某些逻辑 | 中 | 逐行对比两个方法的 phase 检查、session 初始化、弹幕/护甲/身体检测逻辑，确认 `resolveGeometry` 是完整超集 |
| `getBodyWorldGeometry` 新接口引入后，body 碰撞检测逻辑与旧代码不一致 | 中 | 确保 `BODY_PARTS` 的变换公式与 `capsuleHitsEllipse` 的参数一致；新增 body 命中测试 |
| `finishSlash` 删除 armor event 二次 push 后，`result.events` 中 armor event 的 `collisionSource` 来源于 `commitArmorDamage` 而非 `finishSlash` | 低 | 两者使用相同的 `source` 参数，无差异 |
| P0-5 测试硬化后，部分测试可能因 `spawnProjectileForTest` 的几何构造不精确而失败 | 低 | 使用 `resolveGeometry` 的 `capsuleHitsEllipse` 逻辑校准几何参数 |
| CI 配置中 Playwright 需要系统依赖，Ubuntu 环境下可能需额外安装 | 低 | `npx playwright install --with-deps` 自动处理 |

### 8.2 待明确事项

1. **`getProjectileSpawnOrigin` 命名**：需求文档提到 `getProjectileSpawnOrigins`（复数），但当前代码为单数且返回单个 Vec2。建议保留单数，因为函数返回单个护甲的弹幕出生点。
2. **`_lastResolvedReactiveEvents` 是否需要在 `reset()` 中清理**：建议在 `Game` 构造函数中初始化 `_lastResolvedReactiveEvents = []`，与 `_lastReactiveResolve = null` 同步。
3. **CI 具体分支策略**：仅 `r5-recovery` 分支触发，还是所有分支/PR 触发？建议先仅 `r5-recovery` 和 `main` 分支，后续扩大。

---

## 9. 验收标准

- [x] V0723012 版本号已更新 (`src/App.tsx`)
- [x] CI 配置就绪 (`.github/workflows/ci.yml`)
- [x] `getState()` 在 `gameMode === "boss"` 时也能返回 `lastReactiveExitSnapshot`
- [x] `breakCurrentArmorWithMouse` 使用 `expect.poll` 轮询，低性能 CI 下不 flaky
- [x] armor-only 时 `result.events.length === 1`，cut+armor 时 `result.events.length === 2`
- [x] Debug 面板的 lastResult/secondary/counts/events 全部来自同一次 `finishSlash`
- [x] 所有 projectile 测试使用 `spawnProjectileForTest()` 确定性注入，无条件跳过
- [x] 每个关键测试有 `expect.assertions(N)`
- [x] J4 测试真实构造 body+reflect 混合
- [x] 三胶囊确定性测试（baseTrail/visibleBlade/tipSweep 覆盖）通过
- [x] `resolveSegment` 和 `segmentHitEllipse` 已删除，编译通过
- [x] `resolveGeometry` 中不再有字面 `BOSS_CX + relX * bossRenderScale` 模式
- [x] `npx vitest run` 全部通过
- [x] `npx playwright test` 全部通过