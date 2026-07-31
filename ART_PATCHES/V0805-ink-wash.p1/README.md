# V0805-ink-wash.p1 — 水墨写意基础设施

> 创建日期：2026-07-31
> 基于：main@V0731004（V0731.004）
> 风格：国风水墨写意
> 影响：仅绘制层，零逻辑代码改动

---

## 📦 内容

```
ART_PATCHES/V0805-ink-wash.p1/
├── README.md              # 本文档
├── CHANGELOG.md           # 全部补丁列表
├── apply.sh               # 应用补丁（Git Bash）
├── revert.bat             # 回滚补丁（Windows 双击）
├── modified_files/        # 修改的文件（已应用版本）
│   ├── Game.ts
│   └── index.html
├── new_files/             # 新增的文件
│   ├── public/css/ink-wash.css
│   ├── src/game/assets.ts
│   └── src/game/systems/inkWashBackground.ts
└── original/              # main 原版文件（仅作对照，可删除）
    ├── Game.ts
    └── index.html
```

---

## 🔧 修改清单

| 文件 | 状态 | 内容 |
|------|------|------|
| `public/css/ink-wash.css` | 新增 | 水墨CSS变量（墨色/朱红/宣纸） |
| `src/game/assets.ts` | 新增 | 图片预加载管线（失败回退代码绘制） |
| `src/game/systems/inkWashBackground.ts` | 新增 | 水墨三层山+雾气+HUD绘制系统 |
| `index.html` | 修改 | Google Fonts(思源宋体) + ink-wash.css + 宣纸底色 |
| `src/game/Game.ts` | 修改 | 4个绘制函数（drawBackground/drawTopMist/drawHud） |

---

## 🚀 应用

```bash
# Git Bash
./ART_PATCHES/V0805-ink-wash.p1/apply.sh
```

## ⏪ 回滚

```
# Windows
双击 ART_PATCHES/V0805-ink-wash.p1/revert.bat
```

回滚后效果：
- 主菜单背景仍是暗色（不是宣纸白）
- 战斗场景仍是单层暗色山（不是水墨三层山）
- HUD 仍是黑底金字（不是宣纸白底墨字）

---

## ✅ 验证

```bash
npx tsc --noEmit         # 0 错误
```

---

## 🎨 视觉对比

| 元素 | 应用前 | 应用后 |
|------|--------|--------|
| 战斗背景 | `#180f0b` 暗色 | `#F7F3EA` 宣纸 |
| 山形 | 单层暗色剪影 | 三层水墨山 |
| 雾气 | 黑雾 | 白宣纸雾气 |
| HUD 背景 | `rgba(18,12,8,0.78)` | `rgba(247,243,234,0.92)` |
| HUD 文字 | `#ffd35a` 金 | `#3D3A35` 墨 |
| 字体 | Microsoft YaHei | Noto Serif SC 思源宋体 |