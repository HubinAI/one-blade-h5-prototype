@echo off
REM V0805-ink-wash.p2 revert — 回滚水墨刀光特效补丁
REM 恢复 Game.ts 到 .p1 状态（保留 .p1 背景效果）

setlocal

echo [V0805-ink-wash.p2] 开始回滚...

REM 1. 删除新增文件
if exist src\game\systems\inkWashEffects.ts del /Q src\game\systems\inkWashEffects.ts

REM 2. 恢复 Game.ts 到 .p1 版本
copy /Y ART_PATCHES\V0805-ink-wash.p1\modified_files\Game.ts src\game\Game.ts >nul

echo [V0805-ink-wash.p2] 已回滚
echo   - 删除: src\game\systems\inkWashEffects.ts
echo   - 恢复: src\game\Game.ts (回到 .p1 状态)
echo.
echo 注意: 背景层(.p1)仍生效，单纯去掉刀光特效
endlocal