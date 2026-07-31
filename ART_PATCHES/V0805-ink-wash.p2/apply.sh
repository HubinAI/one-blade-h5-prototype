#!/usr/bin/env bash
# V0805-ink-wash.p2 apply — 应用水墨刀光特效补丁
# 依赖：V0805-ink-wash.p1（背景层必须先应用）
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "[V0805-ink-wash.p2] 应用补丁..."

# 1. 复制新增文件
cp ART_PATCHES/V0805-ink-wash.p2/new_files/src/game/systems/inkWashEffects.ts src/game/systems/inkWashEffects.ts

# 2. 覆盖修改的文件
cp ART_PATCHES/V0805-ink-wash.p2/modified_files/Game.ts src/game/Game.ts

echo "[V0805-ink-wash.p2] ✅ 已应用"
echo "  - 新增: src/game/systems/inkWashEffects.ts (墨色飞白 + 刀锋残响)"
echo "  - 改:   src/game/Game.ts (drawSlash 接入水墨效果)"