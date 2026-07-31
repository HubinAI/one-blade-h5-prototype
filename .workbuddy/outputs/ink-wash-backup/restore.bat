@echo off
REM 水墨写意备份恢复脚本
REM 从 .workbuddy/outputs/ink-wash-backup/ 恢复到 project-code/
REM V0805-ink-wash.p1+.p2+.p3 (全量)

echo [INK-WASH Restore] 开始恢复...

copy /Y "public\css\ink-wash.css" ..\public\css\ >nul
copy /Y "src\game\assets.ts" ..\src\game\ >nul
copy /Y "src\game\Game.ts" ..\src\game\ >nul
mkdir ..\src\game\systems 2>nul
copy /Y "src\game\systems\inkWashBackground.ts" ..\src\game\systems\ >nul
copy /Y "src\game\systems\inkWashEffects.ts" ..\src\game\systems\ >nul
copy /Y "src\game\systems\inkWashPalette.ts" ..\src\game\systems\ >nul
copy /Y "index.html" ..\ >nul

mkdir ..\public\images\bg 2>nul
mkdir ..\public\images\ui 2>nul
mkdir ..\public\images\enemy 2>nul
mkdir ..\public\images\fx 2>nul

echo [INK-WASH Restore] 完成
echo   - index.html (Google Fonts + 宣纸底色)
echo   - public/css/ink-wash.css
echo   - src/game/assets.ts
echo   - src/game/systems/inkWashBackground.ts
echo   - src/game/systems/inkWashEffects.ts
echo   - src/game/systems/inkWashPalette.ts
echo   - src/game/Game.ts (.p1 + .p2 + .p3)