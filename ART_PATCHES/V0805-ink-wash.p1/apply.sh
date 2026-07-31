#!/usr/bin/env bash
# V0805-ink-wash.p1 apply — 应用水墨写意基础设施补丁
# 不会影响 git 分支、不会影响 main 分支逻辑代码。
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "[V0805-ink-wash.p1] 应用补丁..."

# 1. 复制新增文件
mkdir -p public/css public/images/bg public/images/ui public/images/enemy public/images/fx
cp ART_PATCHES/V0805-ink-wash.p1/new_files/public/css/ink-wash.css public/css/ink-wash.css
cp ART_PATCHES/V0805-ink-wash.p1/new_files/src/game/assets.ts src/game/assets.ts
mkdir -p src/game/systems
cp ART_PATCHES/V0805-ink-wash.p1/new_files/src/game/systems/inkWashBackground.ts src/game/systems/inkWashBackground.ts

# 2. 覆盖修改的文件
cp ART_PATCHES/V0805-ink-wash.p1/modified_files/index.html index.html
cp ART_PATCHES/V0805-ink-wash.p1/modified_files/Game.ts src/game/Game.ts

echo "[V0805-ink-wash.p1] ✅ 已应用"
echo "  - 新增: public/css/ink-wash.css"
echo "  - 新增: src/game/assets.ts"
echo "  - 新增: src/game/systems/inkWashBackground.ts"
echo "  - 改:   index.html (Google Fonts + theme-color)"
echo "  - 改:   src/game/Game.ts (4个绘制函数)"