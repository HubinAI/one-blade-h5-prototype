type MainMenuProps = {
  unlockedLevel: number;
  onStart: () => void;
  onLevels: () => void;
};

export function MainMenu({ unlockedLevel, onStart, onLevels }: MainMenuProps) {
  return (
    <section className="screen menu-screen">
      <div className="title-block">
        <span className="seal">V0.3</span>
        <h1>我只要一刀</h1>
        <p>刀势越满，一刀越强</p>
      </div>

      <div className="menu-actions">
        <button className="primary-button" onClick={onStart}>
          继续第 {unlockedLevel} 关
        </button>
        <button className="ghost-button" onClick={onLevels}>
          选择关卡
        </button>
      </div>
    </section>
  );
}
