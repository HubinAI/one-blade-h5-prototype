@echo off
REM V0805-ink-wash.p3 revert — 回滚对比度适配补丁
REM 恢复 .p2 状态（保留背景+刀光，去掉敌颜色映射）

setlocal

echo [V0805-ink-wash.p3] 开始回滚...

REM 1. 删除新增文件
if exist src\game\systems\inkWashPalette.ts del /Q src\game\systems\inkWashPalette.ts

REM 2. 恢复 .p2 版本
copy /Y ART_PATCHES\V0805-ink-wash.p2\modified_files\Game.ts src\game\Game.ts >nul
copy /Y ART_PATCHES\V0805-ink-wash.p1\modified_files\Game.ts src\game\inkWashBackground_restore.ts 2>nul
copy /Y ART_PATCHES\V0805-ink-wash.p1\new_files\src\game\systems\inkWashBackground.ts src\game\systems\inkWashBackground.ts >nul

echo [V0805-ink-wash.p3] 已回滚
echo   - 删除: src\game\systems\inkWashPalette.ts
echo   - 恢复: Game.ts (回到 .p2)
echo   - 恢复: inkWashBackground.ts (回到 .p1 HUD色)
endlocal