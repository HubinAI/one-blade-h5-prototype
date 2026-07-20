# 《我只要一刀 V0720008》H5 原型

基于 React + TypeScript + HTML5 Canvas + Vite 实现的竖屏手机 demo。V0.4 在现有“刀势 + 指尖实时挥刀 + 收刀爆发”的核心战斗上，补齐 IAA 可循环测试需要的首页、结算、广告模拟、局内三选一、奖励、宝箱、碎片、军粮、每日和金币升级。

## 在线体验

```text
https://hubinai.github.io/one-blade-h5-prototype/
```

## 本地运行

```bash
npm install
npm run dev
```

默认地址：

```text
http://localhost:5173/
```

构建检查：

```bash
npm run build
```

## V0.4 已实现

- 首页 IAA 入口：开始游戏、继续关卡、每日挑战、高收益挑战、宝箱进度、金币、军粮、今日首胜、离线奖励、升级入口。
- 结算钩子：评级、击杀数、最大单刀、最大连锁、一刀破阵次数、火药连爆、阵眼崩散、奖励、差一点提示、再来一局、下一关、奖励翻倍、额外宝箱。
- 模拟广告层：`AdService` 支持激励视频、插屏广告、复活、奖励翻倍、额外宝箱、军粮恢复，前端 3 秒倒计时模拟。
- 广告频控：插屏第 3 局后才允许，结算后进入下一局前展示，并避开连续激励视频后的打扰。
- 局内三选一强化：30 / 75 / 105 秒按关卡触发，最多 3 个本局强化。
- 120 秒级单局节奏：10 关使用时间轴刷怪 + 关键阵型，后半段压力明显提高。
- 轻养成：金币升级刀势恢复、刀芒长度、爆炸范围、初始刀势。
- 碎片展示与轻属性：长锋刀、爆裂刀穗、破盾兵符、护心镜碎片。
- 军粮系统：主线不消耗，高收益挑战消耗 5 军粮，10 分钟恢复 1 点，广告恢复 10 点。
- 每日回流：每日首胜、每日挑战、每日任务、离线金币。
- 本地埋点：`game_start`、`slash_start`、`slash_end`、`buff_choice`、`pickup_collected`、`game_end`、`ad_offer`、`ad_start`、`ad_complete`、`ad_skip`、`replay_click`、`next_level_click`、`upgrade_buy`、`chest_open`、`daily_reward_claim`、`stamina_spend`、`stamina_ad_restore`。

## 主要目录

```text
src/
  App.tsx                         页面流、首页入口、广告、结算、升级页串联
  components/
    MainMenu.tsx                  V0.4 IAA 首页
    ResultScreen.tsx              V0.4 完整结算页
    UpgradeScreen.tsx             金币升级与碎片展示
    AdOverlay.tsx                 3 秒模拟广告弹窗
  game/
    Game.ts                       Canvas 战斗、刀势、实时切割、三选一、复活
    GameCanvas.tsx                Canvas 输入桥接
    config/
      ads.ts                      广告频控配置
      balance.ts                  刀势、敌军、补给核心数值
      buffs.ts                    局内三选一强化配置
      rewards.ts                  评级、奖励、宝箱、碎片、升级、军粮、每日配置
    services/
      AdService.ts                模拟广告服务
      Analytics.ts                本地 console 埋点
      ProgressionService.ts       本地存档、奖励、升级、军粮、每日、离线
  data/
    levels.ts                     10 关时间轴与关键阵型配置
```

## 部署

项目使用 GitHub Pages。推送到 `main` 后，GitHub Actions 会自动构建并部署：

```bash
git push origin main
```

部署完成后访问：

```text
https://hubinai.github.io/one-blade-h5-prototype/
```
