# 《我只要一刀》H5 原型 V0.4

基于 React + TypeScript + HTML5 Canvas + Vite 实现的竖屏手机 demo。V0.4 在 V0.3 核心战斗上补齐 IAA 测试关键闭环：再来一局、模拟广告、局内三选一强化、120 秒左右的单局节奏、奖励与进度钩子。

## 在线试玩

```text
https://hubinai.github.io/one-blade-h5-prototype/
```

## 本地运行

```bash
npm install
npm run dev
```

启动后打开：

```text
http://localhost:5173/
```

构建检查：

```bash
npm run build
```

## V0.4 已实现

- 保留单一核心操作：玩家只拖动挥刀，不新增战斗按钮。
- 时间轴刷怪：每关按 `spawnAt` 触发关键阵型，不再必须清完才出下一波。
- 单局时长拉长：第 1 关 90 秒，第 10 关 150 秒，其余关卡 100-130 秒。
- 局内三选一军令：30/75/105 秒按关卡触发，暂停战斗后选择一个本局强化。
- 10 个军令强化：长锋、爆裂、回气、破盾、火油、阵破、战鼓、护城、双刃、碎纸。
- 广告模拟层：`AdService` 提供激励视频、插屏广告、可展示判断，前端以 3 秒倒计时弹窗模拟。
- 激励视频复活：第 3 关后、存活 40 秒以上、每局最多 1 次，复活后 1 血、80% 刀势并清理近防线敌人。
- 胜利奖励翻倍：结算页可看广告奖励 x2。
- 宝箱广告：战功宝箱触发后，可看广告额外开宝箱。
- 插屏广告频控：第 3 局后开始，只在结算页之后进入下一局前出现，并避免连续激励视频后再弹插屏。
- 完整结算页：评级、击杀、最大单刀、最大连锁、阵眼、目标、金币、战功、碎片、宝箱、图鉴、神之一刀挑战。
- 再来一局钩子：差一点提示、宝箱进度、碎片进度、图鉴进度、神之一刀挑战。
- 本地 console 埋点：`game_start`、`slash_start`、`slash_end`、`buff_choice`、`game_end`、`ad_offer`、`ad_start`、`ad_complete`、`replay_click`、`next_level_click`。

## 主要目录

```text
src/
  App.tsx                         屏幕流、复活广告、结算按钮、插屏触发
  components/
    AdOverlay.tsx                 3 秒模拟广告弹窗
    ResultScreen.tsx              V0.4 完整结算页
  game/
    Game.ts                       Canvas 战斗、时间轴刷怪、军令选择、复活逻辑
    GameCanvas.tsx                Canvas 输入、复活信号桥接
    config/
      ads.ts                      广告频控配置
      balance.ts                  刀势、敌军、补给核心数值
      buffs.ts                    三选一军令强化配置
      rewards.ts                  评级、金币、战功、宝箱、碎片配置
    services/
      AdService.ts                模拟广告服务
      Analytics.ts                本地 console 埋点
      ProgressionService.ts       本地奖励、宝箱、碎片、图鉴进度
  data/
    levels.ts                     10 关时间轴与关键阵型配置
```

## 部署

项目已配置 GitHub Pages workflow。推送到 `main` 后，GitHub Actions 会自动构建并部署：

```bash
git push origin main
```

部署完成后访问：

```text
https://hubinai.github.io/one-blade-h5-prototype/
```
