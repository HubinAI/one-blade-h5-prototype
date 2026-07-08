import type { HomeSnapshot } from "../game/services/ProgressionService";

type MainMenuProps = {
  unlockedLevel: number;
  home: HomeSnapshot;
  onStart: () => void;
  onContinue: () => void;
  onLevels: () => void;
  onDailyChallenge: () => void;
  onHighYieldChallenge: () => void;
  onUpgrades: () => void;
  onRestoreStamina: () => void;
  onClaimOffline: () => void;
  onClaimOfflineDouble: () => void;
};

function percent(value: number, target: number) {
  return `${Math.min(100, Math.round((value / Math.max(1, target)) * 100))}%`;
}

export function MainMenu({
  unlockedLevel,
  home,
  onStart,
  onContinue,
  onLevels,
  onDailyChallenge,
  onHighYieldChallenge,
  onUpgrades,
  onRestoreStamina,
  onClaimOffline,
  onClaimOfflineDouble
}: MainMenuProps) {
  const firstFragment = home.fragments[0];
  const activeTasks = home.dailyTasks.filter((task) => !task.claimed).slice(0, 3);
  const isFirstPlay = unlockedLevel <= 1 && home.coins === 0;

  return (
    <section className="screen menu-screen menu-screen-v4">
      <div className="home-topbar">
        <span>金币 {home.coins}</span>
        <span>
          军粮 {home.stamina}/{home.staminaMax}
        </span>
        <span>{home.dailyFirstWinReady ? "🔥 今日首胜未领" : "今日首胜已领"}</span>
      </div>

      <div className="title-block title-block-v4">
        <span className="seal">V0708001 IAA版</span>
        <h1>我只要一刀</h1>
        <p>随时能砍，但刀势越满越爽</p>
      </div>

      <div className="home-progress-panel">
        <div className="home-progress-row">
          <span>战功宝箱</span>
          <b>
            {home.chestProgress}/{home.chestTarget}
          </b>
          <i style={{ width: percent(home.chestProgress, home.chestTarget) }} />
        </div>
        {firstFragment && (
          <div className="home-progress-row">
            <span>{firstFragment.unlocked ? `${firstFragment.name} 已解锁` : firstFragment.name}</span>
            <b>
              {firstFragment.count}/{firstFragment.target}
            </b>
            <i style={{ width: percent(firstFragment.count, firstFragment.target) }} />
          </div>
        )}
      </div>

      <div className="daily-card">
        <strong>每日挑战：{home.dailyChallengeName}</strong>
        <span>{home.dailyChallengeDescription}</span>
        <button className="ghost-button compact-button" onClick={onDailyChallenge}>
          进入挑战
        </button>
      </div>

      {home.offlineCoins > 0 && (
        <div className="offline-card">
          <span>离线收益 {home.offlineCoins} 金币</span>
          <div>
            <button className="text-button" onClick={onClaimOffline}>
              领取
            </button>
            <button className="text-button" onClick={onClaimOfflineDouble}>
              广告 x2
            </button>
          </div>
        </div>
      )}

      <div className="menu-actions">
        <button className="primary-button" onClick={isFirstPlay ? onStart : onContinue}>
          {isFirstPlay ? "开始游戏" : `继续第 ${unlockedLevel} 关`}
        </button>
        <button className="ghost-button" onClick={onHighYieldChallenge}>
          高收益挑战（5 军粮）
        </button>
        <button className="ghost-button" onClick={onUpgrades}>
          刀势升级
        </button>
        <button className="ghost-button" onClick={onLevels}>
          选择关卡
        </button>
        {home.stamina < 5 && (
          <button className="ad-button" onClick={onRestoreStamina}>
            军粮不足，看广告恢复 10 点
          </button>
        )}
      </div>

      {activeTasks.length > 0 && (
        <div className="daily-task-strip">
          {activeTasks.map((task) => (
            <span key={task.id}>
              {task.name} {task.progress}/{task.target}
            </span>
          ))}
        </div>
      )}

      <small className="stamina-note">军粮恢复：{home.staminaNextText}</small>
    </section>
  );
}
