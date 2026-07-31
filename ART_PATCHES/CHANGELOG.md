# 美术升级补丁日志（ART PATCHES）

> 替代 git 分支的轻量版本管理（适配 WorkBuddy 沙箱环境）
> 每个迭代一个补丁目录，含 apply/revert 脚本，可独立回滚

## 📜 目录

| 补丁 | 日期 | 主题 | 状态 |
|------|------|------|------|
| **V0805-ink-wash.p1** | 2026-07-31 | 水墨写意基础设施（背景+HUD+字体） | ✅ 已封板 |
| **V0805-ink-wash.p2** | 2026-07-31 | 水墨刀光特效（飞白底纹+墨点残响） | ✅ 已封板 |
| **V0805-ink-wash.p3** | 2026-07-31 | 对比度适配（敌人色+ HUD加深+影调整） | ✅ 已封板 |

---

## V0805-ink-wash.p1

**范围**：仅绘制层，零逻辑代码改动
**依赖**：无
**可叠加**：✅ 与任何其他补丁兼容

### 改动概览

```
新增:
- public/css/ink-wash.css                       水墨CSS变量
- src/game/assets.ts                            图片预加载管线
- src/game/systems/inkWashBackground.ts         水墨三层山+雾气+HUD

修改:
- index.html                                    Google Fonts + 宣纸底色
- src/game/Game.ts                              4个绘制函数
```

### 视觉效果

- ✅ 战斗背景：暗色 → 宣纸白
- ✅ 三层水墨山 + 雾气渐隐
- ✅ HUD 黑底金字 → 白底墨字
- ✅ 字体 Microsoft YaHei → Noto Serif SC 思源宋体

### 使用方法

```bash
# 应用
./ART_PATCHES/V0805-ink-wash.p1/apply.sh

# 回滚
双击 ART_PATCHES/V0805-ink-wash.p1/revert.bat
```

---

## V0805-ink-wash.p2

**范围**：仅刀光特效层（drawSlash），增强型不改原逻辑
**依赖**：V0805-ink-wash.p1（必须先应用）
**可叠加**：✅

### 改动概览

```
新增:
- src/game/systems/inkWashEffects.ts               墨色飞白+墨点残响+刀身高光

修改:
- src/game/Game.ts                                drawSlash 前插入墨色底纹
```

### 视觉效果

- ✅ 刀光前出现墨色飞白底纹（毛笔划纸感）
- ✅ 刀锋末端甩出墨点残响（笔锋离纸）
- ✅ 原金色刀光保留，效果叠加

### 使用方法

```bash
# 应用（依赖 .p1 已应用）
./ART_PATCHES/V0805-ink-wash.p2/apply.sh

# 回滚（保留 .p1 状态）
双击 ART_PATCHES/V0805-ink-wash.p2/revert.bat
```

---

## 🔮 未来补丁（计划）

| 编号 | 主题 | 预计 |
|------|------|------|
| ~~V0805.p2~~ | ~~刀光 Canvas 动态笔触~~ | ✅ 已封板为 V0805-ink-wash.p2 |
| V0805.p3 | 敌人纯黑剪影 | 下次迭代 |
| V0815.x | UI 组件水墨化（按钮、面板、icon） | V0815 阶段 |
| V0825.x | Boss 立绘 + 雷电特效 | V0825 阶段 |