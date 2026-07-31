@echo off
REM V0805-ink-wash.p1 revert — 回滚水墨写意基础设施补丁
REM 不会影响 git 分支、不影响 main 分支逻辑代码。
REM 用法：在 project-code/ 目录下双击运行此 bat

setlocal

echo [V0805-ink-wash.p1] 开始回滚...

REM 1. 删除新增文件
if exist src\game\assets.ts del /Q src\game\assets.ts
if exist src\game\systems\inkWashBackground.ts del /Q src\game\systems\inkWashBackground.ts
if exist public\css\ink-wash.css del /Q public\css\ink-wash.css

REM 2. 从 git main 恢复修改的文件
git show main:index.html > index.html
git show main:src/game/Game.ts > src\game\Game.ts

echo [V0805-ink-wash.p1] 已回滚
echo   - 删除: src\game\assets.ts
echo   - 删除: src\game\systems\inkWashBackground.ts
echo   - 删除: public\css\ink-wash.css
echo   - 恢复: index.html (git main)
echo   - 恢复: src\game\Game.ts (git main)
echo.
echo 注意: public/images/bg|ui|enemy|fx 空目录保留（手动可删）
endlocal